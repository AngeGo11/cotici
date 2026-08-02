"""`GET /api/admin/savings/` : module strictement en lecture.

Points vérifiés :

- accès refusé sans session staff, et refusé avec une session staff ne
  détenant pas `Perm.WALLET_READ` ;
- la liste est paginée et retourne le contrat attendu (titulaire, libellé,
  objectif, cumul versé, progression, échéance) ;
- le "cumul versé" ne compte que les transactions `RÉUSSIE`
  (VERSEMENT_EPARGNE_PERSONNELLE - RETRAIT_EPARGNE_PERSONNELLE) ;
- aucune écriture n'est exposée (POST/PATCH/PUT/DELETE -> 405).
"""
from __future__ import annotations

from decimal import Decimal

from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from apps.administration.domain.roles import StaffRole
from apps.administration.tests.helpers import create_staff_profile, login_staff_client
from apps.savings.models import EpargnePersonnelle
from apps.wallet.models import Transaction, Wallet

User = get_user_model()

LIST_URL = "/api/admin/savings/"


def _detail_url(pk: int) -> str:
    return f"/api/admin/savings/{pk}/"


def _create_user(username: str, phone: str) -> User:
    return User.objects.create_user(
        username=username,
        password="testpass123",
        code_pin="1234",
        numero_telephone=phone,
    )


def _create_epargne(hote: User, *, nom_projet="Voyage", objectif=100000, duree=0) -> EpargnePersonnelle:
    return EpargnePersonnelle.objects.create(
        hote=hote,
        nom_projet=nom_projet,
        objectif_cotisation=objectif,
        montant_courant=Decimal("0"),
        duree=duree,
    )


def _create_transaction(
    *, wallet: Wallet, epargne: EpargnePersonnelle, type_transaction: str, montant, statut
) -> Transaction:
    return Transaction.objects.create(
        wallet=wallet,
        epargne=epargne,
        solde_courant=Decimal(0),
        ref_transaction=f"REF-{Transaction.objects.count() + 1:06d}",
        mode_de_paiement=Transaction.MODE_DE_PAIEMENT.ORANGE,
        montant_transaction=Decimal(montant),
        statut_transaction=statut,
        type_transaction=type_transaction,
    )


@override_settings(ADMIN_IP_ALLOWLIST="", DEBUG=True, ADMIN_TOTP_REQUIRED=True)
class SavingsAccessControlTests(TestCase):
    def setUp(self):
        cache.clear()
        self.client = APIClient()
        self.holder = _create_user("client.savings.access", "2250700230001")
        self.epargne = _create_epargne(self.holder)

    def test_anonymous_is_denied(self):
        resp = self.client.get(LIST_URL)
        self.assertEqual(resp.status_code, 403)

    def test_authenticated_non_staff_is_denied(self):
        self.client.force_login(self.holder)
        resp = self.client.get(LIST_URL)
        self.assertEqual(resp.status_code, 403)

    def test_staff_without_wallet_read_permission_is_denied(self):
        # Aucun rôle de la matrice ne prive `wallet.read` seul sans en
        # priver aussi le reste : on utilise donc un profil actif dont le
        # rôle n'existe pas dans `ROLE_PERMISSIONS`, simulé via un rôle
        # inconnu directement affecté après création (contournement de
        # `staff_service.create_staff`, qui valide le rôle à la création).
        profile = create_staff_profile(
            username="staff.savings.norole",
            numero_telephone="2250700230002",
            password="Un-Mot-De-Passe-Savings-1",
            role=StaffRole.SUPPORT,
        )
        # `support` détient `wallet.read` dans la matrice actuelle : on force
        # ici un rôle qui n'en dispose délibérément pas pour vérifier le
        # refus, sans dépendre d'un rôle métier fictif.
        profile.role = "role_inconnu"
        profile.save(update_fields=["role"])

        login_ok = self.client.post(
            "/api/admin/auth/login/",
            {"identifiant": "staff.savings.norole", "password": "Un-Mot-De-Passe-Savings-1"},
            format="json",
        )
        self.assertEqual(login_ok.status_code, 200, login_ok.content)
        # L'enrôlement TOTP ne dépend pas du rôle : on le complète normalement.
        import pyotp

        setup_resp = self.client.post("/api/admin/auth/totp/setup/", {}, format="json")
        self.assertEqual(setup_resp.status_code, 200, setup_resp.content)
        code = pyotp.TOTP(setup_resp.data["secret"]).now()
        verify_resp = self.client.post(
            "/api/admin/auth/totp/verify/", {"code": code}, format="json"
        )
        self.assertEqual(verify_resp.status_code, 200, verify_resp.content)

        resp = self.client.get(LIST_URL)
        self.assertEqual(resp.status_code, 403)


@override_settings(ADMIN_IP_ALLOWLIST="", DEBUG=True, ADMIN_TOTP_REQUIRED=True)
class SavingsListTests(TestCase):
    def setUp(self):
        cache.clear()
        self.client = APIClient()
        create_staff_profile(
            username="staff.savings.list",
            numero_telephone="2250700231001",
            password="Un-Mot-De-Passe-Savings-2",
            role=StaffRole.SUPPORT,
        )
        login_staff_client(
            self.client,
            username="staff.savings.list",
            password="Un-Mot-De-Passe-Savings-2",
        )

        self.holder = _create_user("client.savings.list", "2250700231002")
        self.wallet = Wallet.objects.create(user=self.holder, solde_courant=Decimal(0))
        self.epargne = _create_epargne(
            self.holder, nom_projet="Voyage Dakar", objectif=100000, duree=30
        )

    def test_list_returns_expected_contract(self):
        resp = self.client.get(LIST_URL)
        self.assertEqual(resp.status_code, 200, resp.content)
        self.assertIn("results", resp.data)
        self.assertIn("count", resp.data)
        self.assertEqual(resp.data["count"], 1)

        row = resp.data["results"][0]
        for key in (
            "id",
            "titulaire",
            "nom_projet",
            "categorie",
            "objectif_cotisation",
            "cumul_verse",
            "progression",
            "etat",
            "objectif_atteint",
            "duree",
            "date_creation",
            "echeance",
        ):
            self.assertIn(key, row)

        self.assertEqual(row["nom_projet"], "Voyage Dakar")
        self.assertEqual(row["titulaire"]["id"], self.holder.pk)
        # Le numéro de téléphone ne doit jamais sortir en clair de ce module.
        self.assertNotIn(self.holder.numero_telephone, str(row["titulaire"]))

    def test_cumul_verse_counts_only_successful_transactions(self):
        _create_transaction(
            wallet=self.wallet,
            epargne=self.epargne,
            type_transaction=Transaction.TYPE_TRANSACTION.VERSEMENT_EPARGNE_PERSONNELLE,
            montant=20000,
            statut=Transaction.STATUT_TRANSACTION.REUSSIE,
        )
        _create_transaction(
            wallet=self.wallet,
            epargne=self.epargne,
            type_transaction=Transaction.TYPE_TRANSACTION.VERSEMENT_EPARGNE_PERSONNELLE,
            montant=99999,
            statut=Transaction.STATUT_TRANSACTION.EN_ATTENTE,
        )
        _create_transaction(
            wallet=self.wallet,
            epargne=self.epargne,
            type_transaction=Transaction.TYPE_TRANSACTION.VERSEMENT_EPARGNE_PERSONNELLE,
            montant=12345,
            statut=Transaction.STATUT_TRANSACTION.ECHOUEE,
        )
        _create_transaction(
            wallet=self.wallet,
            epargne=self.epargne,
            type_transaction=Transaction.TYPE_TRANSACTION.RETRAIT_EPARGNE_PERSONNELLE,
            montant=5000,
            statut=Transaction.STATUT_TRANSACTION.REUSSIE,
        )

        resp = self.client.get(LIST_URL)
        row = resp.data["results"][0]
        self.assertEqual(Decimal(str(row["cumul_verse"])), Decimal(15000))
        self.assertAlmostEqual(row["progression"], 15.0, places=2)

    def test_search_filters_by_holder(self):
        other_holder = _create_user("client.savings.other", "2250700231003")
        _create_epargne(other_holder, nom_projet="Mariage")

        resp = self.client.get(LIST_URL, {"search": "client.savings.other"})
        self.assertEqual(resp.status_code, 200, resp.content)
        self.assertEqual(resp.data["count"], 1)
        self.assertEqual(resp.data["results"][0]["nom_projet"], "Mariage")

    def test_etat_filter(self):
        EpargnePersonnelle.objects.create(
            hote=self.holder,
            nom_projet="Archive test",
            objectif_cotisation=50000,
            montant_courant=Decimal("0"),
            etat=EpargnePersonnelle.ETAT.ARCHIVE,
        )
        resp = self.client.get(LIST_URL, {"etat": "ARCHIVÉ"})
        self.assertEqual(resp.status_code, 200, resp.content)
        self.assertEqual(resp.data["count"], 1)
        self.assertEqual(resp.data["results"][0]["nom_projet"], "Archive test")

    def test_detail_returns_transaction_history(self):
        tx = _create_transaction(
            wallet=self.wallet,
            epargne=self.epargne,
            type_transaction=Transaction.TYPE_TRANSACTION.VERSEMENT_EPARGNE_PERSONNELLE,
            montant=7000,
            statut=Transaction.STATUT_TRANSACTION.REUSSIE,
        )
        resp = self.client.get(_detail_url(self.epargne.pk))
        self.assertEqual(resp.status_code, 200, resp.content)
        self.assertIn("historique", resp.data)
        self.assertEqual(len(resp.data["historique"]), 1)
        self.assertEqual(resp.data["historique"][0]["id"], tx.pk)
        self.assertEqual(Decimal(str(resp.data["cumul_verse"])), Decimal(7000))

    def test_write_methods_are_not_allowed(self):
        list_resp = self.client.post(LIST_URL, {"nom_projet": "x"}, format="json")
        self.assertEqual(list_resp.status_code, 405)

        detail_url = _detail_url(self.epargne.pk)
        self.assertEqual(self.client.patch(detail_url, {}, format="json").status_code, 405)
        self.assertEqual(self.client.put(detail_url, {}, format="json").status_code, 405)
        self.assertEqual(self.client.delete(detail_url).status_code, 405)
