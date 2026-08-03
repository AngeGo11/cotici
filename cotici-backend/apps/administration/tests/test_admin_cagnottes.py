"""Tests de `/api/admin/cagnottes/` (consultation + modération).

Couvre :
- l'accès refusé sans session staff, et sans la permission requise ;
- la modération sans motif -> 400 ;
- la modération nominale -> état correct + `AdminActionLog` écrit ;
- le calcul du montant collecté (seules les contributions `RÉUSSIE` comptent) ;
- qu'une tontine de groupe (héritage multi-table sur `Tontine`) n'apparaît
  jamais dans la liste des cagnottes.
"""
from __future__ import annotations

from decimal import Decimal

from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from apps.administration.domain.roles import StaffRole
from apps.administration.tests.helpers import create_staff_profile, login_staff_client
from apps.audits.models import AdminActionLog
from apps.cagnotte.models import Cagnotte
from apps.tontine.models import Tontine
from apps.wallet.models import Transaction, Wallet

User = get_user_model()

LIST_URL = "/api/admin/cagnottes/"


def _detail_url(pk) -> str:
    return f"{LIST_URL}{pk}/"


def _moderate_url(pk) -> str:
    return f"{LIST_URL}{pk}/moderate/"


def _create_user(username: str, phone: str) -> User:
    return User.objects.create_user(
        username=username,
        password="testpass123",
        code_pin="1234",
        numero_telephone=phone,
    )


def _create_cagnotte(hote: User, *, nom="Cagnotte test", objectif=100000, **kwargs) -> Cagnotte:
    return Cagnotte.objects.create(
        hote=hote,
        nom_cagnotte=nom,
        objectif_cotisation=objectif,
        description=nom,
        qr_code=f"qr-{nom}",
        **kwargs,
    )


def _create_contribution(
    cagnotte: Cagnotte, contributeur: User, *, montant, statut=Transaction.STATUT_TRANSACTION.REUSSIE
) -> Transaction:
    wallet, _ = Wallet.objects.get_or_create(user=contributeur)
    return Transaction.objects.create(
        tontine=cagnotte,
        wallet=wallet,
        solde_courant=Decimal(0),
        ref_transaction=f"REF-CAG-{Transaction.objects.count() + 1:06d}",
        mode_de_paiement=Transaction.MODE_DE_PAIEMENT.ORANGE,
        montant_transaction=Decimal(montant),
        statut_transaction=statut,
        type_transaction=Transaction.TYPE_TRANSACTION.CONTRIBUTION_CAGNOTTE,
    )


@override_settings(ADMIN_IP_ALLOWLIST="", DEBUG=True, ADMIN_TOTP_REQUIRED=True)
class CagnotteAccessControlTests(TestCase):
    def setUp(self):
        cache.clear()
        self.client = APIClient()
        self.hote = _create_user("hote.cagnotte", "2250700400001")
        self.cagnotte = _create_cagnotte(self.hote)

    def test_anonymous_is_denied(self):
        resp = self.client.get(LIST_URL)
        self.assertEqual(resp.status_code, 403)

    def test_authenticated_non_staff_is_denied(self):
        mobile_user = _create_user("mobile.cagnotte", "2250700400002")
        self.client.force_login(mobile_user)
        resp = self.client.get(LIST_URL)
        self.assertEqual(resp.status_code, 403)

    def test_staff_without_permission_is_denied(self):
        """Le rôle `compliance` ne détient pas `Perm.CAGNOTTE_READ`."""
        create_staff_profile(
            username="staff.compliance.cag",
            numero_telephone="2250700400003",
            password="Un-Mot-De-Passe-Compliance-1",
            role=StaffRole.COMPLIANCE,
        )
        login_staff_client(
            self.client,
            username="staff.compliance.cag",
            password="Un-Mot-De-Passe-Compliance-1",
        )
        resp = self.client.get(LIST_URL)
        self.assertEqual(resp.status_code, 403)


@override_settings(ADMIN_IP_ALLOWLIST="", DEBUG=True, ADMIN_TOTP_REQUIRED=True)
class CagnotteListTests(TestCase):
    def setUp(self):
        cache.clear()
        self.client = APIClient()
        create_staff_profile(
            username="staff.cagnottes",
            numero_telephone="2250700410001",
            password="Un-Mot-De-Passe-Cagnottes-1",
            role=StaffRole.OPERATEUR,
        )
        login_staff_client(
            self.client,
            username="staff.cagnottes",
            password="Un-Mot-De-Passe-Cagnottes-1",
        )
        self.hote = _create_user("hote.liste.cag", "2250700410002")

    def test_tontine_de_groupe_is_not_listed_as_cagnotte(self):
        """`Cagnotte` hérite de `Tontine` (héritage multi-table, même table
        de base) : sans restriction au queryset `Cagnotte.objects`, une
        tontine de groupe apparaîtrait aussi dans cette liste."""
        cagnotte = _create_cagnotte(self.hote, nom="Cagnotte visible")
        Tontine.objects.create(
            hote=self.hote,
            type_tontine=Tontine.TYPE_TONTINE.GROUPE,
            description="Tontine de groupe non visible",
            qr_code="qr-tontine-groupe-liste",
        )

        resp = self.client.get(LIST_URL)
        self.assertEqual(resp.status_code, 200, resp.content)
        ids = {row["id"] for row in resp.data["results"]}
        self.assertIn(cagnotte.pk, ids)
        self.assertEqual(len(ids), 1)

    def test_montant_collecte_counts_only_successful_contributions(self):
        cagnotte = _create_cagnotte(self.hote, nom="Cagnotte contributions", objectif=10000)
        contributeur = _create_user("contributeur.cag", "2250700410003")

        _create_contribution(cagnotte, contributeur, montant=3000)
        _create_contribution(
            cagnotte, contributeur, montant=9999, statut=Transaction.STATUT_TRANSACTION.EN_ATTENTE
        )
        _create_contribution(
            cagnotte, contributeur, montant=1234, statut=Transaction.STATUT_TRANSACTION.ECHOUEE
        )
        _create_contribution(cagnotte, contributeur, montant=2000)

        resp = self.client.get(LIST_URL)
        self.assertEqual(resp.status_code, 200, resp.content)
        row = next(r for r in resp.data["results"] if r["id"] == cagnotte.pk)
        self.assertEqual(Decimal(str(row["montant_collecte"])), Decimal(5000))
        self.assertEqual(row["progression"], 50.0)

    def test_filter_by_etat(self):
        _create_cagnotte(self.hote, nom="Active")
        _create_cagnotte(
            self.hote,
            nom="Archivée",
            etat=Tontine.ETAT.ARCHIVE,
            est_active=False,
        )
        resp = self.client.get(LIST_URL, {"etat": Tontine.ETAT.ARCHIVE})
        self.assertEqual(resp.status_code, 200, resp.content)
        self.assertEqual(len(resp.data["results"]), 1)
        self.assertEqual(resp.data["results"][0]["etat"], Tontine.ETAT.ARCHIVE)

    def test_filter_by_objectif_atteint(self):
        _create_cagnotte(self.hote, nom="Objectif non atteint")
        _create_cagnotte(self.hote, nom="Objectif atteint", objectif_atteint=True)
        resp = self.client.get(LIST_URL, {"objectif_atteint": "true"})
        self.assertEqual(resp.status_code, 200, resp.content)
        self.assertEqual(len(resp.data["results"]), 1)
        self.assertTrue(resp.data["results"][0]["objectif_atteint"])

    def test_search_by_nom_or_organisateur(self):
        _create_cagnotte(self.hote, nom="Anniversaire de Fatou")
        _create_cagnotte(self.hote, nom="Autre collecte")
        resp = self.client.get(LIST_URL, {"search": "Fatou"})
        self.assertEqual(resp.status_code, 200, resp.content)
        self.assertEqual(len(resp.data["results"]), 1)

    def test_retrieve_includes_membres(self):
        cagnotte = _create_cagnotte(self.hote)
        resp = self.client.get(_detail_url(cagnotte.pk))
        self.assertEqual(resp.status_code, 200, resp.content)
        self.assertIn("membres", resp.data)


@override_settings(ADMIN_IP_ALLOWLIST="", DEBUG=True, ADMIN_TOTP_REQUIRED=True)
class CagnotteModerateTests(TestCase):
    def setUp(self):
        cache.clear()
        self.client = APIClient()
        create_staff_profile(
            username="staff.moderate.cag",
            numero_telephone="2250700420001",
            password="Un-Mot-De-Passe-Moderate-1",
            role=StaffRole.OPERATEUR,
        )
        login_staff_client(
            self.client,
            username="staff.moderate.cag",
            password="Un-Mot-De-Passe-Moderate-1",
        )
        self.hote = _create_user("hote.moderate.cag", "2250700420002")
        self.cagnotte = _create_cagnotte(self.hote)

    def test_moderate_without_reason_is_rejected(self):
        resp = self.client.post(
            _moderate_url(self.cagnotte.pk), {"action": "archive"}, format="json"
        )
        self.assertEqual(resp.status_code, 400)
        self.cagnotte.refresh_from_db()
        self.assertEqual(self.cagnotte.etat, Tontine.ETAT.ACTIF)

    def test_moderate_without_permission_is_denied(self):
        cache.clear()
        client = APIClient()
        create_staff_profile(
            username="staff.readonly.cag",
            numero_telephone="2250700420003",
            password="Un-Mot-De-Passe-Readonly-1",
            role=StaffRole.AUDITEUR,
        )
        login_staff_client(
            client,
            username="staff.readonly.cag",
            password="Un-Mot-De-Passe-Readonly-1",
        )
        resp = client.post(
            _moderate_url(self.cagnotte.pk),
            {"action": "archive", "reason": "Signalement communauté"},
            format="json",
        )
        self.assertEqual(resp.status_code, 403)

    def test_archive_sets_expected_state_and_writes_audit_log(self):
        resp = self.client.post(
            _moderate_url(self.cagnotte.pk),
            {"action": "archive", "reason": "Signalement communauté"},
            format="json",
        )
        self.assertEqual(resp.status_code, 200, resp.content)
        self.cagnotte.refresh_from_db()
        self.assertEqual(self.cagnotte.etat, Tontine.ETAT.ARCHIVE)
        self.assertFalse(self.cagnotte.est_active)
        self.assertIsNotNone(self.cagnotte.date_archivage)

        log = AdminActionLog.objects.filter(
            action="cagnotte_moderated", target_id=str(self.cagnotte.pk)
        ).latest("timestamp")
        self.assertEqual(log.reason, "Signalement communauté")
        self.assertEqual(log.before["etat"], Tontine.ETAT.ACTIF)
        self.assertEqual(log.after["etat"], Tontine.ETAT.ARCHIVE)

    def test_restore_reactivates_cagnotte(self):
        self.cagnotte.etat = Tontine.ETAT.ARCHIVE
        self.cagnotte.est_active = False
        self.cagnotte.save(update_fields=["etat", "est_active"])

        resp = self.client.post(
            _moderate_url(self.cagnotte.pk),
            {"action": "restore", "reason": "Erreur d'archivage"},
            format="json",
        )
        self.assertEqual(resp.status_code, 200, resp.content)
        self.cagnotte.refresh_from_db()
        self.assertEqual(self.cagnotte.etat, Tontine.ETAT.ACTIF)
        self.assertTrue(self.cagnotte.est_active)

    def test_delete_marks_cagnotte_supprimee(self):
        resp = self.client.post(
            _moderate_url(self.cagnotte.pk),
            {"action": "delete", "reason": "Fraude avérée"},
            format="json",
        )
        self.assertEqual(resp.status_code, 200, resp.content)
        self.cagnotte.refresh_from_db()
        self.assertEqual(self.cagnotte.etat, Tontine.ETAT.SUPPRIME)
        self.assertFalse(self.cagnotte.est_active)
        self.assertIsNotNone(self.cagnotte.date_suppression)

    def test_moderate_unknown_action_is_rejected(self):
        resp = self.client.post(
            _moderate_url(self.cagnotte.pk),
            {"action": "explode", "reason": "Motif"},
            format="json",
        )
        self.assertEqual(resp.status_code, 400)

    def test_tontine_de_groupe_cannot_be_moderated_through_cagnotte_endpoint(self):
        tontine = Tontine.objects.create(
            hote=self.hote,
            type_tontine=Tontine.TYPE_TONTINE.GROUPE,
            description="Tontine non moderable ici",
            qr_code="qr-tontine-moderate",
        )
        resp = self.client.post(
            _moderate_url(tontine.pk),
            {"action": "archive", "reason": "Test"},
            format="json",
        )
        self.assertEqual(resp.status_code, 404)
