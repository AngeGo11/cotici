"""Edge cases et concurrence réelle pour l'app cagnotte, en complément de
test_create_and_cotiser.py / test_idempotency.py / test_idor.py /
test_recuperation_and_regressions.py.

Couvre :
- montants invalides (négatif, zéro) à la contribution
- objectif de collecte invalide (zéro, négatif) à la création
- course réelle entre deux contributions concurrentes proches de l'objectif
  (aucun dépassement, aucune monnaie créée)
- course réelle entre deux tentatives concurrentes de récupération des fonds
  par l'organisateur (un seul versement, pas de double crédit)
- invariant de conservation de la monnaie sur un cycle complet à plusieurs
  contributeurs (somme des contributions REUSSIES == montant_collecte ==
  montant versé à l'organisateur)
- permission : un membre non-organisateur (mais membre actif) ne peut pas
  déclencher la récupération des fonds
"""

import threading
from decimal import Decimal

from django.db import connections
from django.test import TransactionTestCase
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient, APITestCase

from apps.authn.models import User
from apps.cagnotte.models import Cagnotte
from apps.tontine.models import TontineMembre
from apps.wallet.models import Transaction, Wallet

CREATE_URL = reverse("create-cagnotte")
COTISER_URL = reverse("cagnotte-cotiser")


def _user(username: str, phone: str) -> User:
    return User.objects.create_user(
        username=username, password="testpass123", code_pin="1234", numero_telephone=phone
    )


def _verser_url(tontine_id: int) -> str:
    return reverse("cagnotte-recuperation", args=[tontine_id])


class CreateCagnotteObjectifEdgeCasesTests(APITestCase):
    def setUp(self):
        self.user = _user("cagnotte_edge_creator", "22507080930")
        self.client.force_authenticate(user=self.user)

    def test_objectif_zero_rejected(self):
        response = self.client.post(
            CREATE_URL,
            {
                "nom_cagnotte": "Objectif nul",
                "description_projet": "Un projet",
                "objectif_collecte": 0,
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(
            response.data["detail"],
            "L'objectif de la collecte doit être un montant entier positif.",
        )
        self.assertFalse(Cagnotte.objects.filter(nom_cagnotte="Objectif nul").exists())

    def test_objectif_negative_rejected(self):
        response = self.client.post(
            CREATE_URL,
            {
                "nom_cagnotte": "Objectif negatif",
                "description_projet": "Un projet",
                "objectif_collecte": -5000,
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(
            response.data["detail"],
            "L'objectif de la collecte doit être un montant entier positif.",
        )


class CotiserCagnotteMontantEdgeCasesTests(APITestCase):
    def setUp(self):
        self.organizer = _user("cagnotte_edge_org", "22501020340")
        self.contributor = _user("cagnotte_edge_contrib", "22509080740")
        self.client.force_authenticate(user=self.contributor)
        Wallet.objects.create(user=self.contributor, solde_courant=Decimal("10000"))
        self.cagnotte = Cagnotte.objects.create(
            hote=self.organizer,
            nom_cagnotte="Cagnotte edge cases",
            description="Projet",
            objectif_cotisation=5000,
            objectif_atteint=False,
            qr_code="x",
        )

    def test_montant_negatif_rejected(self):
        response = self.client.post(
            COTISER_URL,
            {"tontine_id": self.cagnotte.id, "montant": -1000},
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
            {"tontine_id": self.cagnotte.id, "montant": 0},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(
            response.data["detail"], "Veuillez renseigner un montant de participation valide."
        )

    def test_non_membre_peut_cotiser_car_collecte_ouverte_a_tous(self):
        """La cotisation à une cagnotte est intentionnellement ouverte à tout
        utilisateur Cotici authentifié (pas de restriction de membership)."""
        response = self.client.post(
            COTISER_URL,
            {"tontine_id": self.cagnotte.id, "montant": 1000},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)


class CagnotteMembreNonOrganisateurTests(APITestCase):
    """Un membre actif de la cagnotte (statut ACTIF), mais pas admin/organisateur,
    ne doit pas pouvoir déclencher la récupération des fonds."""

    def setUp(self):
        self.organizer = _user("cagnotte_edge_org2", "22501020341")
        self.simple_member = _user("cagnotte_edge_member", "22509080741")
        self.cagnotte = Cagnotte.objects.create(
            hote=self.organizer,
            nom_cagnotte="Cagnotte membre simple",
            description="Projet",
            objectif_cotisation=1000,
            objectif_atteint=True,
            qr_code="x",
        )
        TontineMembre.objects.create(
            tontine=self.cagnotte,
            membre=self.simple_member,
            role_membre=TontineMembre.ROLE_MEMBRE.PARTICIPANT,
            statut_membre=TontineMembre.STATUT_MEMBRE.ACTIF,
            ordre_ramassage=2,
        )

    def test_simple_member_cannot_trigger_recuperation(self):
        self.client.force_authenticate(user=self.simple_member)
        response = self.client.post(_verser_url(self.cagnotte.id), {}, format="json")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.cagnotte.refresh_from_db()
        self.assertFalse(self.cagnotte.recuperation_effectue)


class CagnotteMoneyConservationLifecycleTests(APITestCase):
    """Vérifie qu'aucune monnaie n'est créée ni détruite sur un cycle complet
    à plusieurs contributeurs : somme des contributions réussies ==
    montant_collecte affiché == montant effectivement crédité à l'organisateur,
    et la somme des débits des contributeurs égale le crédit unique reçu par
    l'organisateur (aucune fuite ni duplication)."""

    def test_multi_contributor_cycle_conserves_money(self):
        organizer = _user("cagnotte_money_org", "22501020342")
        c1 = _user("cagnotte_money_c1", "22509080742")
        c2 = _user("cagnotte_money_c2", "22509080743")
        c3 = _user("cagnotte_money_c3", "22509080744")

        for c in (c1, c2, c3):
            Wallet.objects.create(user=c, solde_courant=Decimal("10000"))

        cagnotte = Cagnotte.objects.create(
            hote=organizer,
            nom_cagnotte="Cagnotte conservation",
            description="Projet",
            objectif_cotisation=9000,
            objectif_atteint=False,
            qr_code="x",
        )

        contributions = [(c1, 3000), (c2, 4000), (c3, 2000)]
        for contributor, montant in contributions:
            self.client.force_authenticate(user=contributor)
            response = self.client.post(
                COTISER_URL,
                {"tontine_id": cagnotte.id, "montant": montant},
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
                tontine=cagnotte,
                type_transaction=Transaction.TYPE_TRANSACTION.CONTRIBUTION_CAGNOTTE,
                statut_transaction=Transaction.STATUT_TRANSACTION.REUSSIE,
            )
        )
        self.assertEqual(somme_transactions, Decimal("9000"))

        cagnotte.refresh_from_db()
        self.assertTrue(cagnotte.objectif_atteint)

        self.client.force_authenticate(user=organizer)
        verser_response = self.client.post(_verser_url(cagnotte.id), {}, format="json")
        self.assertEqual(verser_response.status_code, status.HTTP_201_CREATED, verser_response.data)
        self.assertEqual(verser_response.data["montant_verse"], "9000")

        organizer_wallet = Wallet.objects.get(user=organizer)
        self.assertEqual(organizer_wallet.solde_courant, Decimal("9000"))

        # Aucune monnaie créée : le crédit reçu par l'organisateur == somme des
        # débits, à la centime près (Decimal, pas de float).
        self.assertEqual(organizer_wallet.solde_courant, somme_transactions)


class ConcurrentCotisationOverObjectifRaceTests(TransactionTestCase):
    """Deux contributions concurrentes qui, prises ensemble, dépasseraient
    largement l'objectif : le verrou sur la cagnotte doit garantir qu'aucune
    contribution n'est acceptée une fois l'objectif atteint par l'autre thread,
    même en cas de chevauchement réel de transactions DB."""

    reset_sequences = False

    def setUp(self):
        self.organizer = _user("cagnotte_race_org", "22501020350")
        self.c1 = _user("cagnotte_race_c1", "22509080750")
        self.c2 = _user("cagnotte_race_c2", "22509080751")
        Wallet.objects.create(user=self.c1, solde_courant=Decimal("10000"))
        Wallet.objects.create(user=self.c2, solde_courant=Decimal("10000"))

        # Objectif à 5000 : deux contributions de 5000 chacune, chacune suffit
        # SEULE à atteindre l'objectif. Sous concurrence réelle, une seule doit
        # être acceptée -- l'autre doit se heurter au verrou "objectif déjà
        # atteint" une fois la première validée, sinon la collecte finale
        # dépasse l'objectif deux fois (10000 au lieu de 5000).
        self.cagnotte = Cagnotte.objects.create(
            hote=self.organizer,
            nom_cagnotte="Cagnotte course objectif",
            description="Projet",
            objectif_cotisation=5000,
            objectif_atteint=False,
            qr_code="x",
        )

    def test_only_one_contribution_accepted_once_objectif_reached_under_race(self):
        cotiser_url = COTISER_URL
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
                cotiser_url, {"tontine_id": self.cagnotte.id, "montant": montant}, format="json"
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
        # Chaque contribution (5000) suffit seule à atteindre l'objectif (5000) :
        # sous verrouillage correct, une seule doit être acceptée, l'autre doit
        # être rejetée avec "objectif déjà atteint".
        self.assertEqual(len(successes), 1, f"Résultats obtenus : {results}")
        self.assertEqual(len(rejections), 1, f"Résultats obtenus : {results}")

        total_transactions = sum(
            tx.montant_transaction
            for tx in Transaction.objects.filter(
                tontine=self.cagnotte,
                type_transaction=Transaction.TYPE_TRANSACTION.CONTRIBUTION_CAGNOTTE,
                statut_transaction=Transaction.STATUT_TRANSACTION.REUSSIE,
            )
        )
        # Le débit total des wallets doit être exactement égal à la somme des
        # transactions enregistrées (pas de monnaie créée/détruite), peu importe
        # combien de contributions ont été acceptées.
        total_debited = (Decimal("10000") - Wallet.objects.get(user=self.c1).solde_courant) + (
            Decimal("10000") - Wallet.objects.get(user=self.c2).solde_courant
        )
        self.assertEqual(total_debited, total_transactions)
        # Exactement une contribution de 5000 a été retenue, pas 10000.
        self.assertEqual(total_transactions, Decimal("5000"))

        self.cagnotte.refresh_from_db()
        self.assertTrue(self.cagnotte.objectif_atteint)


class ConcurrentRecuperationRaceTests(TransactionTestCase):
    """Deux requêtes de récupération des fonds réellement simultanées, par
    l'organisateur : une seule doit créditer son wallet, l'autre doit être
    rejetée proprement (pas de double versement)."""

    reset_sequences = False

    def setUp(self):
        self.organizer = _user("cagnotte_race_verser_org", "22501020351")
        self.contributor = _user("cagnotte_race_verser_c", "22509080752")
        Wallet.objects.create(user=self.contributor, solde_courant=Decimal("10000"))
        self.cagnotte = Cagnotte.objects.create(
            hote=self.organizer,
            nom_cagnotte="Cagnotte course versement",
            description="Projet",
            objectif_cotisation=5000,
            objectif_atteint=False,
            qr_code="x",
        )
        client = APIClient()
        client.force_authenticate(user=self.contributor)
        response = client.post(
            COTISER_URL, {"tontine_id": self.cagnotte.id, "montant": 5000}, format="json"
        )
        assert response.status_code == status.HTTP_201_CREATED, response.data

    def test_concurrent_double_recuperation_only_one_wins(self):
        verser_url = _verser_url(self.cagnotte.id)
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

        organizer_wallet = Wallet.objects.get(user=self.organizer)
        # Un seul crédit de 5000, pas 10000.
        self.assertEqual(organizer_wallet.solde_courant, Decimal("5000"))

        versement_count = Transaction.objects.filter(
            tontine=self.cagnotte,
            type_transaction=Transaction.TYPE_TRANSACTION.VERSEMENT_CAGNOTTE,
            statut_transaction=Transaction.STATUT_TRANSACTION.REUSSIE,
        ).count()
        self.assertEqual(versement_count, 1)
