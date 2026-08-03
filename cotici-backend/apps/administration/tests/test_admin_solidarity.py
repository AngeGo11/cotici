"""`/api/admin/solidarity/` : consultation des tontines solidaires.

Points vérifiés :

- l'accès reste refusé hors session staff, et sans `Perm.CAGNOTTE_READ` ;
- `montant_collecte` ne compte que les contributions solidaires RÉUSSIES ;
- `beneficiaire_telephone` n'est jamais exposé en clair (masquage) ;
- une cagnotte et une tontine de groupe n'apparaissent pas dans la liste
  (héritage multi-table de `Tontine`).
"""
from __future__ import annotations

from decimal import Decimal

from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from apps.administration.domain.roles import StaffRole
from apps.administration.tests.helpers import create_staff_profile, login_staff_client
from apps.cagnotte.models import Cagnotte
from apps.solidarity.models import Solidarity
from apps.tontine.models import Tontine
from apps.wallet.models import Transaction, Wallet

User = get_user_model()

LIST_URL = "/api/admin/solidarity/"


def _create_user(username: str, phone: str) -> User:
    return User.objects.create_user(
        username=username,
        password="testpass123",
        code_pin="1234",
        numero_telephone=phone,
    )


def _create_solidarity(*, hote, beneficiaire_telephone, objectif=50000) -> Solidarity:
    return Solidarity.objects.create(
        hote=hote,
        description="Collecte solidaire test",
        qr_code="qr-solidarite",
        beneficiaire_telephone=beneficiaire_telephone,
        objectif_cotisation=objectif,
    )


def _create_transaction(
    wallet: Wallet, *, tontine: Tontine, type_transaction: str, statut: str, montant
) -> Transaction:
    return Transaction.objects.create(
        wallet=wallet,
        tontine=tontine,
        solde_courant=Decimal(0),
        ref_transaction=f"REF-{Transaction.objects.count() + 1:06d}",
        mode_de_paiement=Transaction.MODE_DE_PAIEMENT.SOLDE_COTICI,
        montant_transaction=Decimal(montant),
        statut_transaction=statut,
        type_transaction=type_transaction,
    )


@override_settings(ADMIN_IP_ALLOWLIST="", DEBUG=True, ADMIN_TOTP_REQUIRED=True)
class SolidarityAdminAccessTests(TestCase):
    def setUp(self):
        cache.clear()
        self.client = APIClient()
        self.organisateur = _create_user("client.solidarite.host", "2250700300001")

    def test_access_denied_without_staff_session(self):
        resp = self.client.get(LIST_URL)
        self.assertEqual(resp.status_code, 403)

    def test_access_denied_without_permission(self):
        """Le rôle `compliance` ne détient pas `Perm.CAGNOTTE_READ`."""
        create_staff_profile(
            username="staff.solidarite.compliance",
            numero_telephone="2250700300002",
            password="Un-Mot-De-Passe-Solidarite-1",
            role=StaffRole.COMPLIANCE,
        )
        login_staff_client(
            self.client,
            username="staff.solidarite.compliance",
            password="Un-Mot-De-Passe-Solidarite-1",
        )
        resp = self.client.get(LIST_URL)
        self.assertEqual(resp.status_code, 403)


@override_settings(ADMIN_IP_ALLOWLIST="", DEBUG=True, ADMIN_TOTP_REQUIRED=True)
class SolidarityAdminListTests(TestCase):
    def setUp(self):
        cache.clear()
        self.client = APIClient()
        create_staff_profile(
            username="staff.solidarite.support",
            numero_telephone="2250700300010",
            password="Un-Mot-De-Passe-Solidarite-2",
            role=StaffRole.SUPPORT,
        )
        login_staff_client(
            self.client,
            username="staff.solidarite.support",
            password="Un-Mot-De-Passe-Solidarite-2",
        )
        self.organisateur = _create_user("client.solidarite.host2", "2250700300011")
        self.wallet = Wallet.objects.create(user=self.organisateur, solde_courant=Decimal(0))

    def test_montant_collecte_counts_only_successful_contributions(self):
        solidarity = _create_solidarity(
            hote=self.organisateur,
            beneficiaire_telephone="2250700999912",
            objectif=30000,
        )
        _create_transaction(
            self.wallet,
            tontine=solidarity,
            type_transaction=Transaction.TYPE_TRANSACTION.CONTRIBUTION_SOLIDAIRE,
            statut=Transaction.STATUT_TRANSACTION.REUSSIE,
            montant=10000,
        )
        _create_transaction(
            self.wallet,
            tontine=solidarity,
            type_transaction=Transaction.TYPE_TRANSACTION.CONTRIBUTION_SOLIDAIRE,
            statut=Transaction.STATUT_TRANSACTION.REUSSIE,
            montant=5000,
        )
        _create_transaction(
            self.wallet,
            tontine=solidarity,
            type_transaction=Transaction.TYPE_TRANSACTION.CONTRIBUTION_SOLIDAIRE,
            statut=Transaction.STATUT_TRANSACTION.EN_ATTENTE,
            montant=9999,
        )
        _create_transaction(
            self.wallet,
            tontine=solidarity,
            type_transaction=Transaction.TYPE_TRANSACTION.CONTRIBUTION_SOLIDAIRE,
            statut=Transaction.STATUT_TRANSACTION.ECHOUEE,
            montant=1234,
        )

        resp = self.client.get(LIST_URL)
        self.assertEqual(resp.status_code, 200, resp.content)
        result = resp.data["results"][0]
        self.assertEqual(Decimal(str(result["montant_collecte"])), Decimal(15000))

    def test_montant_verse_does_not_double_count_validation_transaction(self):
        """Piège documenté (`apps.solidarity.views.verser_beneficiaire`) :
        VALIDATION_VERSEMENT_SOLIDAIRE porte le même montant que
        VERSEMENT_SOLIDAIRE mais ne crédite aucun wallet — il ne doit pas
        être sommé dans `montant_verse`."""
        solidarity = _create_solidarity(
            hote=self.organisateur,
            beneficiaire_telephone="2250700999913",
            objectif=20000,
        )
        _create_transaction(
            self.wallet,
            tontine=solidarity,
            type_transaction=Transaction.TYPE_TRANSACTION.VERSEMENT_SOLIDAIRE,
            statut=Transaction.STATUT_TRANSACTION.REUSSIE,
            montant=20000,
        )
        _create_transaction(
            self.wallet,
            tontine=solidarity,
            type_transaction=Transaction.TYPE_TRANSACTION.VALIDATION_VERSEMENT_SOLIDAIRE,
            statut=Transaction.STATUT_TRANSACTION.REUSSIE,
            montant=20000,
        )

        resp = self.client.get(LIST_URL)
        self.assertEqual(resp.status_code, 200, resp.content)
        result = resp.data["results"][0]
        self.assertEqual(Decimal(str(result["montant_verse"])), Decimal(20000))

    def test_beneficiaire_phone_is_masked(self):
        _create_solidarity(
            hote=self.organisateur,
            beneficiaire_telephone="2250700999914",
        )
        resp = self.client.get(LIST_URL)
        self.assertEqual(resp.status_code, 200, resp.content)
        result = resp.data["results"][0]
        self.assertNotIn("beneficiaire_telephone", result)
        masked = result["beneficiaire_telephone_masque"]
        self.assertNotEqual(masked, "2250700999914")
        self.assertTrue(masked.endswith("14"))
        self.assertIn("*", masked)

    def test_cagnotte_does_not_appear_in_list(self):
        Cagnotte.objects.create(
            hote=self.organisateur,
            nom_cagnotte="Cagnotte test",
            objectif_cotisation=100000,
            description="Cagnotte",
            qr_code="qr-cagnotte",
        )
        resp = self.client.get(LIST_URL)
        self.assertEqual(resp.status_code, 200, resp.content)
        self.assertEqual(resp.data["count"], 0)

    def test_group_tontine_does_not_appear_in_list(self):
        Tontine.objects.create(
            hote=self.organisateur,
            type_tontine=Tontine.TYPE_TONTINE.GROUPE,
            description="Tontine de groupe",
            qr_code="qr-groupe",
        )
        resp = self.client.get(LIST_URL)
        self.assertEqual(resp.status_code, 200, resp.content)
        self.assertEqual(resp.data["count"], 0)

    def test_solidarity_is_listed(self):
        _create_solidarity(
            hote=self.organisateur,
            beneficiaire_telephone="2250700999915",
        )
        resp = self.client.get(LIST_URL)
        self.assertEqual(resp.status_code, 200, resp.content)
        self.assertEqual(resp.data["count"], 1)
