"""Edge cases et concurrence réelle pour l'app solidarity, en complément de
test_create_and_cotiser.py / test_idempotency.py / test_idor.py /
test_verser_beneficiaire.py.

Couvre :
- montants invalides (négatif, zéro) à la contribution
- objectif de collecte invalide (zéro, négatif) à la création
- course réelle entre deux contributions concurrentes qui atteignent chacune
  seules l'objectif (une seule doit être retenue)
- course réelle entre deux tentatives concurrentes de versement au
  bénéficiaire (un seul versement, pas de double crédit)
- invariant de conservation de la monnaie sur un cycle complet à plusieurs
  contributeurs
- archive/suppression bloquée dès qu'il existe au moins un contributeur
- permission : un membre non-organisateur (mais membre actif) ne peut pas
  déclencher le versement au bénéficiaire
"""

import threading
from decimal import Decimal

from django.db import connections
from django.test import TransactionTestCase
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient, APITestCase

from apps.authn.models import User
from apps.solidarity.models import Solidarity
from apps.tontine.models import Tontine, TontineMembre
from apps.wallet.models import Transaction, Wallet

ETAT = Tontine.ETAT

CREATE_URL = reverse("create-solidarity-tontine")
COTISER_URL = reverse("solidarity-cotiser")
ARCHIVE_URL = reverse("solidarity-archive")
DELETE_URL = reverse("solidarity-delete")


def _user(username: str, phone: str) -> User:
    return User.objects.create_user(
        username=username, password="testpass123", code_pin="1234", numero_telephone=phone
    )


def _verser_url(tontine_id: int) -> str:
    return reverse("solidarity-verser", args=[tontine_id])


class CreateSolidarityObjectifEdgeCasesTests(APITestCase):
    def setUp(self):
        self.organizer = _user("solidarity_edge_creator", "22507080960")
        self.beneficiary = _user("solidarity_edge_benef", "22501020360")
        self.client.force_authenticate(user=self.organizer)

    def test_objectif_zero_rejected(self):
        response = self.client.post(
            CREATE_URL,
            {"beneficiaire": "22501020360", "motif": "Aide", "objectif_collecte": 0},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(
            response.data["detail"],
            "L'objectif de la collecte doit être un montant entier positif.",
        )
        self.assertFalse(Solidarity.objects.filter(hote=self.organizer).exists())

    def test_objectif_negative_rejected(self):
        response = self.client.post(
            CREATE_URL,
            {"beneficiaire": "22501020360", "motif": "Aide", "objectif_collecte": -1000},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(
            response.data["detail"],
            "L'objectif de la collecte doit être un montant entier positif.",
        )


class CotiserSolidarityMontantEdgeCasesTests(APITestCase):
    def setUp(self):
        self.organizer = _user("solidarity_edge_org", "22501020361")
        self.beneficiary = _user("solidarity_edge_benef2", "22501020362")
        self.contributor = _user("solidarity_edge_contrib", "22509080761")
        self.client.force_authenticate(user=self.contributor)
        Wallet.objects.create(user=self.contributor, solde_courant=Decimal("10000"))
        self.solidarity = Solidarity.objects.create(
            hote=self.organizer,
            description="Aide",
            beneficiaire_telephone="22501020362",
            objectif_cotisation=5000,
            objectif_atteint=False,
            qr_code="x",
            etat=ETAT.ACTIF,
        )

    def test_montant_negatif_rejected(self):
        response = self.client.post(
            COTISER_URL,
            {"tontine_id": self.solidarity.id, "montant": -500},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(
            response.data["detail"], "Veuillez renseigner un montant de participation valide."
        )
        wallet = Wallet.objects.get(user=self.contributor)
        self.assertEqual(wallet.solde_courant, Decimal("10000"))
        self.assertFalse(Transaction.objects.filter(wallet=wallet).exists())

    def test_montant_zero_rejected(self):
        response = self.client.post(
            COTISER_URL,
            {"tontine_id": self.solidarity.id, "montant": 0},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(
            response.data["detail"], "Veuillez renseigner un montant de participation valide."
        )


class SolidarityMembreNonOrganisateurTests(APITestCase):
    """Un membre actif de la collecte (statut ACTIF), mais pas admin/organisateur,
    ne doit pas pouvoir déclencher le versement au bénéficiaire."""

    def setUp(self):
        self.organizer = _user("solidarity_edge_org2", "22501020363")
        self.beneficiary = _user("solidarity_edge_benef3", "22501020364")
        self.simple_member = _user("solidarity_edge_member", "22509080762")
        self.solidarity = Solidarity.objects.create(
            hote=self.organizer,
            description="Aide",
            beneficiaire_telephone="22501020364",
            objectif_cotisation=1000,
            objectif_atteint=True,
            qr_code="x",
            etat=ETAT.ACTIF,
        )
        TontineMembre.objects.create(
            tontine=self.solidarity,
            membre=self.simple_member,
            role_membre=TontineMembre.ROLE_MEMBRE.PARTICIPANT,
            statut_membre=TontineMembre.STATUT_MEMBRE.ACTIF,
            ordre_ramassage=2,
        )

    def test_simple_member_cannot_trigger_versement(self):
        self.client.force_authenticate(user=self.simple_member)
        response = self.client.post(_verser_url(self.solidarity.id), {}, format="json")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.solidarity.refresh_from_db()
        self.assertFalse(self.solidarity.versement_effectue)


class SolidarityArchiveDeleteBlockedByContributorsTests(APITestCase):
    """L'archivage et la suppression doivent être bloqués dès qu'un
    contributeur a déjà versé (protection contre la perte de traçabilité des
    fonds engagés)."""

    def setUp(self):
        self.organizer = _user("solidarity_edge_org3", "22501020365")
        self.beneficiary = _user("solidarity_edge_benef4", "22501020366")
        self.contributor = _user("solidarity_edge_contrib3", "22509080763")
        self.client.force_authenticate(user=self.contributor)
        Wallet.objects.create(user=self.contributor, solde_courant=Decimal("10000"))
        self.solidarity = Solidarity.objects.create(
            hote=self.organizer,
            description="Aide",
            beneficiaire_telephone="22501020366",
            objectif_cotisation=5000,
            objectif_atteint=False,
            qr_code="x",
            etat=ETAT.ACTIF,
        )
        response = self.client.post(
            COTISER_URL, {"tontine_id": self.solidarity.id, "montant": 1000}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

    def test_archive_blocked_with_contributors(self):
        self.client.force_authenticate(user=self.organizer)
        response = self.client.post(ARCHIVE_URL, {"id": self.solidarity.id}, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(
            response.data["detail"],
            "Impossible d'archiver ou supprimer une collecte ayant déjà des contributeurs.",
        )
        self.solidarity.refresh_from_db()
        self.assertEqual(self.solidarity.etat, ETAT.ACTIF)

    def test_delete_blocked_with_contributors(self):
        self.client.force_authenticate(user=self.organizer)
        response = self.client.post(DELETE_URL, {"id": self.solidarity.id}, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(
            response.data["detail"],
            "Impossible d'archiver ou supprimer une collecte ayant déjà des contributeurs.",
        )
        self.solidarity.refresh_from_db()
        self.assertEqual(self.solidarity.etat, ETAT.ACTIF)

    def test_archive_allowed_without_contributors(self):
        organizer2 = _user("solidarity_edge_org4", "22501020367")
        beneficiary2 = _user("solidarity_edge_benef5", "22501020368")
        empty_solidarity = Solidarity.objects.create(
            hote=organizer2,
            description="Aide vide",
            beneficiaire_telephone="22501020368",
            objectif_cotisation=5000,
            objectif_atteint=False,
            qr_code="x",
            etat=ETAT.ACTIF,
        )
        self.client.force_authenticate(user=organizer2)
        response = self.client.post(ARCHIVE_URL, {"id": empty_solidarity.id}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        empty_solidarity.refresh_from_db()
        self.assertEqual(empty_solidarity.etat, ETAT.ARCHIVE)


class SolidarityMoneyConservationLifecycleTests(APITestCase):
    """Conservation de la monnaie sur un cycle complet à plusieurs
    contributeurs jusqu'au versement au bénéficiaire."""

    def test_multi_contributor_cycle_conserves_money(self):
        organizer = _user("solidarity_money_org", "22501020370")
        beneficiary = _user("solidarity_money_benef", "22501020371")
        c1 = _user("solidarity_money_c1", "22509080770")
        c2 = _user("solidarity_money_c2", "22509080771")
        c3 = _user("solidarity_money_c3", "22509080772")

        for c in (c1, c2, c3):
            Wallet.objects.create(user=c, solde_courant=Decimal("10000"))

        solidarity = Solidarity.objects.create(
            hote=organizer,
            description="Aide médicale",
            beneficiaire_telephone="22501020371",
            objectif_cotisation=9000,
            objectif_atteint=False,
            qr_code="x",
            etat=ETAT.ACTIF,
        )

        contributions = [(c1, 3000), (c2, 4000), (c3, 2000)]
        for contributor, montant in contributions:
            self.client.force_authenticate(user=contributor)
            response = self.client.post(
                COTISER_URL,
                {"tontine_id": solidarity.id, "montant": montant},
                format="json",
            )
            self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)

        total_debited = sum(
            Decimal("10000") - Wallet.objects.get(user=c).solde_courant for c, _ in contributions
        )
        self.assertEqual(total_debited, Decimal("9000"))

        somme_transactions = sum(
            tx.montant_transaction
            for tx in Transaction.objects.filter(
                tontine=solidarity,
                type_transaction=Transaction.TYPE_TRANSACTION.CONTRIBUTION_SOLIDAIRE,
                statut_transaction=Transaction.STATUT_TRANSACTION.REUSSIE,
            )
        )
        self.assertEqual(somme_transactions, Decimal("9000"))

        solidarity.refresh_from_db()
        self.assertTrue(solidarity.objectif_atteint)

        self.client.force_authenticate(user=organizer)
        verser_response = self.client.post(_verser_url(solidarity.id), {}, format="json")
        self.assertEqual(verser_response.status_code, status.HTTP_201_CREATED, verser_response.data)
        self.assertEqual(verser_response.data["montant_verse"], "9000")

        benef_wallet = Wallet.objects.get(user=beneficiary)
        self.assertEqual(benef_wallet.solde_courant, Decimal("9000"))
        self.assertEqual(benef_wallet.solde_courant, somme_transactions)


class ConcurrentCotisationOverObjectifRaceTests(TransactionTestCase):
    """Deux contributions concurrentes qui atteignent chacune SEULES
    l'objectif : sous verrouillage correct, une seule doit être acceptée."""

    reset_sequences = False

    def setUp(self):
        self.organizer = _user("solidarity_race_org", "22501020380")
        self.beneficiary = _user("solidarity_race_benef", "22501020381")
        self.c1 = _user("solidarity_race_c1", "22509080780")
        self.c2 = _user("solidarity_race_c2", "22509080781")
        Wallet.objects.create(user=self.c1, solde_courant=Decimal("10000"))
        Wallet.objects.create(user=self.c2, solde_courant=Decimal("10000"))

        self.solidarity = Solidarity.objects.create(
            hote=self.organizer,
            description="Aide course objectif",
            beneficiaire_telephone="22501020381",
            objectif_cotisation=5000,
            objectif_atteint=False,
            qr_code="x",
            etat=ETAT.ACTIF,
        )

    def test_only_one_contribution_accepted_once_objectif_reached_under_race(self):
        results = []
        results_lock = threading.Lock()
        barrier = threading.Barrier(2)

        def _fire(user, montant):
            client = APIClient()
            client.force_authenticate(user=user)
            try:
                barrier.wait(timeout=5)
            except threading.BrokenBarrierError:
                pass
            response = client.post(
                COTISER_URL, {"tontine_id": self.solidarity.id, "montant": montant}, format="json"
            )
            with results_lock:
                results.append(response.status_code)
            connections.close_all()

        threads = [
            threading.Thread(target=_fire, args=(self.c1, 5000)),
            threading.Thread(target=_fire, args=(self.c2, 5000)),
        ]
        for t in threads:
            t.start()
        for t in threads:
            t.join(timeout=10)

        self.assertEqual(len(results), 2)
        successes = [r for r in results if r == status.HTTP_201_CREATED]
        rejections = [r for r in results if r == status.HTTP_400_BAD_REQUEST]
        self.assertEqual(len(successes), 1, f"Résultats obtenus : {results}")
        self.assertEqual(len(rejections), 1, f"Résultats obtenus : {results}")

        total_transactions = sum(
            tx.montant_transaction
            for tx in Transaction.objects.filter(
                tontine=self.solidarity,
                type_transaction=Transaction.TYPE_TRANSACTION.CONTRIBUTION_SOLIDAIRE,
                statut_transaction=Transaction.STATUT_TRANSACTION.REUSSIE,
            )
        )
        total_debited = (Decimal("10000") - Wallet.objects.get(user=self.c1).solde_courant) + (
            Decimal("10000") - Wallet.objects.get(user=self.c2).solde_courant
        )
        self.assertEqual(total_debited, total_transactions)
        self.assertEqual(total_transactions, Decimal("5000"))

        self.solidarity.refresh_from_db()
        self.assertTrue(self.solidarity.objectif_atteint)


class ConcurrentVersementBeneficiaireRaceTests(TransactionTestCase):
    """Deux requêtes de versement au bénéficiaire réellement simultanées, par
    l'organisateur : une seule doit créditer le bénéficiaire, l'autre doit
    être rejetée proprement (pas de double versement)."""

    reset_sequences = False

    def setUp(self):
        self.organizer = _user("solidarity_race_verser_org", "22501020382")
        self.beneficiary = _user("solidarity_race_verser_benef", "22501020383")
        self.contributor = _user("solidarity_race_verser_c", "22509080782")
        Wallet.objects.create(user=self.contributor, solde_courant=Decimal("10000"))
        self.solidarity = Solidarity.objects.create(
            hote=self.organizer,
            description="Aide course versement",
            beneficiaire_telephone="22501020383",
            objectif_cotisation=5000,
            objectif_atteint=False,
            qr_code="x",
            etat=ETAT.ACTIF,
        )
        client = APIClient()
        client.force_authenticate(user=self.contributor)
        response = client.post(
            COTISER_URL, {"tontine_id": self.solidarity.id, "montant": 5000}, format="json"
        )
        assert response.status_code == status.HTTP_201_CREATED, response.data

    def test_concurrent_double_versement_only_one_wins(self):
        verser_url = _verser_url(self.solidarity.id)
        results = []
        results_lock = threading.Lock()
        barrier = threading.Barrier(2)

        def _fire():
            client = APIClient()
            client.force_authenticate(user=self.organizer)
            try:
                barrier.wait(timeout=5)
            except threading.BrokenBarrierError:
                pass
            response = client.post(verser_url, {}, format="json")
            with results_lock:
                results.append(response.status_code)
            connections.close_all()

        threads = [threading.Thread(target=_fire) for _ in range(2)]
        for t in threads:
            t.start()
        for t in threads:
            t.join(timeout=10)

        self.assertEqual(len(results), 2)
        self.assertEqual(
            sorted(results),
            sorted([status.HTTP_201_CREATED, status.HTTP_400_BAD_REQUEST]),
            f"Attendu un succès et un rejet, obtenu : {results}",
        )

        benef_wallet = Wallet.objects.get(user=self.beneficiary)
        # Un seul crédit de 5000, pas 10000.
        self.assertEqual(benef_wallet.solde_courant, Decimal("5000"))

        versement_count = Transaction.objects.filter(
            tontine=self.solidarity,
            type_transaction=Transaction.TYPE_TRANSACTION.VERSEMENT_SOLIDAIRE,
            statut_transaction=Transaction.STATUT_TRANSACTION.REUSSIE,
        ).count()
        self.assertEqual(versement_count, 1)
