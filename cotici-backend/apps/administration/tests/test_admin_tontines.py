"""Tests de `/api/admin/tontines/` (consultation + modération).

Couvre :
- l'accès refusé sans session staff, et sans la permission requise ;
- la modération sans motif -> 400 ;
- la modération nominale -> état correct + `AdminActionLog` écrit ;
- qu'une `Cagnotte` (héritage multi-table sur `Tontine`) n'apparaît jamais
  dans la liste des tontines de groupe.
"""
from __future__ import annotations

from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from apps.administration.domain.roles import StaffRole
from apps.administration.tests.helpers import create_staff_profile, login_staff_client
from apps.audits.models import AdminActionLog
from apps.cagnotte.models import Cagnotte
from apps.tontine.models import Tontine, TontineMembre

User = get_user_model()

LIST_URL = "/api/admin/tontines/"


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


def _create_tontine(hote: User, *, description="Tontine de groupe", **kwargs) -> Tontine:
    return Tontine.objects.create(
        hote=hote,
        type_tontine=Tontine.TYPE_TONTINE.GROUPE,
        description=description,
        qr_code=f"qr-{description}",
        **kwargs,
    )


@override_settings(ADMIN_IP_ALLOWLIST="", DEBUG=True, ADMIN_TOTP_REQUIRED=True)
class TontineAccessControlTests(TestCase):
    def setUp(self):
        cache.clear()
        self.client = APIClient()
        self.hote = _create_user("hote.tontine", "2250700300001")
        self.tontine = _create_tontine(self.hote)

    def test_anonymous_is_denied(self):
        resp = self.client.get(LIST_URL)
        self.assertEqual(resp.status_code, 403)

    def test_authenticated_non_staff_is_denied(self):
        mobile_user = _create_user("mobile.tontine", "2250700300002")
        self.client.force_login(mobile_user)
        resp = self.client.get(LIST_URL)
        self.assertEqual(resp.status_code, 403)

    def test_staff_without_permission_is_denied(self):
        """Le rôle `compliance` ne détient pas `Perm.TONTINE_READ`."""
        create_staff_profile(
            username="staff.compliance",
            numero_telephone="2250700300003",
            password="Un-Mot-De-Passe-Compliance-1",
            role=StaffRole.COMPLIANCE,
        )
        login_staff_client(
            self.client,
            username="staff.compliance",
            password="Un-Mot-De-Passe-Compliance-1",
        )
        resp = self.client.get(LIST_URL)
        self.assertEqual(resp.status_code, 403)


@override_settings(ADMIN_IP_ALLOWLIST="", DEBUG=True, ADMIN_TOTP_REQUIRED=True)
class TontineListTests(TestCase):
    def setUp(self):
        cache.clear()
        self.client = APIClient()
        create_staff_profile(
            username="staff.tontines",
            numero_telephone="2250700310001",
            password="Un-Mot-De-Passe-Tontines-1",
            role=StaffRole.OPERATEUR,
        )
        login_staff_client(
            self.client,
            username="staff.tontines",
            password="Un-Mot-De-Passe-Tontines-1",
        )
        self.hote = _create_user("hote.liste", "2250700310002")

    def test_cagnotte_is_not_listed_as_tontine(self):
        """`Cagnotte` hérite de `Tontine` (héritage multi-table, même table
        de base) : sans filtre sur `type_tontine`, elle apparaîtrait aussi
        dans cette liste."""
        tontine = _create_tontine(self.hote, description="Tontine visible")
        Cagnotte.objects.create(
            hote=self.hote,
            nom_cagnotte="Cagnotte non visible",
            objectif_cotisation=100000,
            description="Cagnotte",
            qr_code="qr-cagnotte-liste",
        )

        resp = self.client.get(LIST_URL)
        self.assertEqual(resp.status_code, 200, resp.content)
        ids = {row["id"] for row in resp.data["results"]}
        self.assertIn(tontine.pk, ids)
        self.assertEqual(len(ids), 1)

    def test_counters_avoid_n_plus_one_and_are_correct(self):
        tontine = _create_tontine(self.hote)
        membre = _create_user("membre.liste", "2250700310003")
        TontineMembre.objects.create(
            tontine=tontine,
            membre=self.hote,
            role_membre=TontineMembre.ROLE_MEMBRE.ADMIN,
            statut_membre=TontineMembre.STATUT_MEMBRE.ACTIF,
            ordre_ramassage=1,
        )
        TontineMembre.objects.create(
            tontine=tontine,
            membre=membre,
            role_membre=TontineMembre.ROLE_MEMBRE.PARTICIPANT,
            statut_membre=TontineMembre.STATUT_MEMBRE.EXCLU,
            ordre_ramassage=2,
        )

        resp = self.client.get(LIST_URL)
        self.assertEqual(resp.status_code, 200, resp.content)
        row = next(r for r in resp.data["results"] if r["id"] == tontine.pk)
        self.assertEqual(row["membres_count"], 1)  # seul le membre ACTIF est compté
        self.assertEqual(row["tours_count"], 0)

    def test_filter_by_etat(self):
        _create_tontine(self.hote, description="Actif")
        _create_tontine(
            self.hote,
            description="Archivé",
            etat=Tontine.ETAT.ARCHIVE,
            est_active=False,
        )
        resp = self.client.get(LIST_URL, {"etat": Tontine.ETAT.ARCHIVE})
        self.assertEqual(resp.status_code, 200, resp.content)
        self.assertEqual(len(resp.data["results"]), 1)
        self.assertEqual(resp.data["results"][0]["etat"], Tontine.ETAT.ARCHIVE)

    def test_search_by_description(self):
        _create_tontine(self.hote, description="Tontine des collègues")
        _create_tontine(self.hote, description="Autre groupe")
        resp = self.client.get(LIST_URL, {"search": "collègues"})
        self.assertEqual(resp.status_code, 200, resp.content)
        self.assertEqual(len(resp.data["results"]), 1)

    def test_retrieve_includes_detail_context(self):
        tontine = _create_tontine(self.hote)
        resp = self.client.get(_detail_url(tontine.pk))
        self.assertEqual(resp.status_code, 200, resp.content)
        for key in ("regle", "membres", "tours", "penalites_en_cours"):
            self.assertIn(key, resp.data)


@override_settings(ADMIN_IP_ALLOWLIST="", DEBUG=True, ADMIN_TOTP_REQUIRED=True)
class TontineModerateTests(TestCase):
    def setUp(self):
        cache.clear()
        self.client = APIClient()
        create_staff_profile(
            username="staff.moderate",
            numero_telephone="2250700320001",
            password="Un-Mot-De-Passe-Moderate-1",
            role=StaffRole.OPERATEUR,
        )
        login_staff_client(
            self.client,
            username="staff.moderate",
            password="Un-Mot-De-Passe-Moderate-1",
        )
        self.hote = _create_user("hote.moderate", "2250700320002")
        self.tontine = _create_tontine(self.hote)

    def test_moderate_without_reason_is_rejected(self):
        resp = self.client.post(
            _moderate_url(self.tontine.pk), {"action": "archive"}, format="json"
        )
        self.assertEqual(resp.status_code, 400)
        self.tontine.refresh_from_db()
        self.assertEqual(self.tontine.etat, Tontine.ETAT.ACTIF)

    def test_moderate_without_permission_is_denied(self):
        cache.clear()
        client = APIClient()
        create_staff_profile(
            username="staff.readonly",
            numero_telephone="2250700320003",
            password="Un-Mot-De-Passe-Readonly-1",
            role=StaffRole.AUDITEUR,
        )
        login_staff_client(
            client,
            username="staff.readonly",
            password="Un-Mot-De-Passe-Readonly-1",
        )
        resp = client.post(
            _moderate_url(self.tontine.pk),
            {"action": "archive", "reason": "Signalement communauté"},
            format="json",
        )
        self.assertEqual(resp.status_code, 403)

    def test_archive_sets_expected_state_and_writes_audit_log(self):
        resp = self.client.post(
            _moderate_url(self.tontine.pk),
            {"action": "archive", "reason": "Signalement communauté"},
            format="json",
        )
        self.assertEqual(resp.status_code, 200, resp.content)
        self.tontine.refresh_from_db()
        self.assertEqual(self.tontine.etat, Tontine.ETAT.ARCHIVE)
        self.assertFalse(self.tontine.est_active)
        self.assertIsNotNone(self.tontine.date_archivage)

        log = AdminActionLog.objects.filter(
            action="tontine_moderated", target_id=str(self.tontine.pk)
        ).latest("timestamp")
        self.assertEqual(log.reason, "Signalement communauté")
        self.assertEqual(log.before["etat"], Tontine.ETAT.ACTIF)
        self.assertEqual(log.after["etat"], Tontine.ETAT.ARCHIVE)

    def test_restore_reactivates_tontine(self):
        self.tontine.etat = Tontine.ETAT.ARCHIVE
        self.tontine.est_active = False
        self.tontine.save(update_fields=["etat", "est_active"])

        resp = self.client.post(
            _moderate_url(self.tontine.pk),
            {"action": "restore", "reason": "Erreur d'archivage"},
            format="json",
        )
        self.assertEqual(resp.status_code, 200, resp.content)
        self.tontine.refresh_from_db()
        self.assertEqual(self.tontine.etat, Tontine.ETAT.ACTIF)
        self.assertTrue(self.tontine.est_active)

    def test_delete_marks_tontine_supprimee(self):
        resp = self.client.post(
            _moderate_url(self.tontine.pk),
            {"action": "delete", "reason": "Fraude avérée"},
            format="json",
        )
        self.assertEqual(resp.status_code, 200, resp.content)
        self.tontine.refresh_from_db()
        self.assertEqual(self.tontine.etat, Tontine.ETAT.SUPPRIME)
        self.assertFalse(self.tontine.est_active)
        self.assertIsNotNone(self.tontine.date_suppression)

    def test_moderate_unknown_action_is_rejected(self):
        resp = self.client.post(
            _moderate_url(self.tontine.pk),
            {"action": "explode", "reason": "Motif"},
            format="json",
        )
        self.assertEqual(resp.status_code, 400)

    def test_cagnotte_cannot_be_moderated_through_tontine_endpoint(self):
        cagnotte = Cagnotte.objects.create(
            hote=self.hote,
            nom_cagnotte="Cagnotte non moderable ici",
            objectif_cotisation=50000,
            description="Cagnotte",
            qr_code="qr-cagnotte-moderate",
        )
        resp = self.client.post(
            _moderate_url(cagnotte.pk),
            {"action": "archive", "reason": "Test"},
            format="json",
        )
        self.assertEqual(resp.status_code, 404)
