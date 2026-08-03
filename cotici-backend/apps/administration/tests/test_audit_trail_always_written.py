"""Vérifie que `AdminAuditTrailMiddleware` écrit systématiquement une entrée
`AdminActionLog` pour toute requête d'écriture authentifiée sur
`/api/admin/`, y compris lorsque la requête est refusée (403)."""
import pyotp
from django.core.cache import cache
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from apps.administration.domain.audit_actions import STAFF_CREATED, STAFF_TOTP_RESET
from apps.administration.domain.roles import StaffRole
from apps.administration.tests.helpers import create_staff_profile, login_staff_client
from apps.audits.models import AdminActionLog


@override_settings(ADMIN_IP_ALLOWLIST="", DEBUG=True, ADMIN_TOTP_REQUIRED=True)
class AuditTrailAlwaysWrittenTests(TestCase):
    def setUp(self):
        cache.clear()
        self.client = APIClient()
        self.password = "Un-Mot-De-Passe-Fort-3"
        self.profile = create_staff_profile(
            username="staff.audit",
            numero_telephone="2250700000003",
            password=self.password,
            role=StaffRole.SUPER_ADMIN,
        )
        login_staff_client(self.client, username="staff.audit", password=self.password)

    def test_successful_action_is_logged(self):
        before_count = AdminActionLog.objects.count()
        resp = self.client.post(
            "/api/admin/staff/",
            {
                "username": "staff.new",
                "numero_telephone": "2250700000004",
                "password": "Un-Autre-Mot-De-Passe-1",
                "role": StaffRole.SUPPORT,
            },
            format="json",
        )
        self.assertEqual(resp.status_code, 201, resp.content)
        self.assertEqual(AdminActionLog.objects.count(), before_count + 1)

        entry = AdminActionLog.objects.latest("timestamp")
        self.assertEqual(entry.action, STAFF_CREATED)
        self.assertEqual(entry.result, AdminActionLog.Result.SUCCESS)
        self.assertEqual(entry.status_code, 201)
        self.assertEqual(entry.actor_id, self.profile.user_id)

    def test_denied_action_is_still_logged(self):
        # Auto-modification interdite -> 403, mais l'entrée d'audit doit
        # malgré tout être écrite (aucune action sur /api/admin/ ne doit
        # échapper au journal, même refusée).
        before_count = AdminActionLog.objects.count()
        resp = self.client.patch(
            f"/api/admin/staff/{self.profile.pk}/deactivate/",
            {"reason": "tentative d'auto-désactivation"},
            format="json",
        )
        self.assertEqual(resp.status_code, 403)
        self.assertEqual(AdminActionLog.objects.count(), before_count + 1)

        entry = AdminActionLog.objects.latest("timestamp")
        self.assertEqual(entry.result, AdminActionLog.Result.DENIED)
        self.assertEqual(entry.status_code, 403)
        self.assertEqual(entry.actor_id, self.profile.user_id)

    def test_sensitive_action_without_reason_is_rejected_before_any_write(self):
        other = create_staff_profile(
            username="staff.other",
            numero_telephone="2250700000005",
            password="Un-Autre-Mot-De-Passe-2",
            role=StaffRole.SUPPORT,
        )
        resp = self.client.patch(f"/api/admin/staff/{other.pk}/deactivate/", {}, format="json")
        self.assertEqual(resp.status_code, 400)

        other.refresh_from_db()
        self.assertTrue(other.is_active, "Le profil ne doit pas être désactivé sans motif fourni.")

    def test_reset_totp_revokes_enrollment_and_is_audited(self):
        other = create_staff_profile(
            username="staff.totp",
            numero_telephone="2250700000006",
            password="Un-Autre-Mot-De-Passe-3",
            role=StaffRole.SUPPORT,
        )
        # Simule un enrôlement 2FA déjà confirmé.
        other.totp_secret = pyotp.random_base32()
        other.totp_confirmed_at = timezone.now()
        other.save(update_fields=["totp_secret", "totp_confirmed_at", "updated_at"])

        resp = self.client.patch(
            f"/api/admin/staff/{other.pk}/reset-totp/",
            {"reason": "terminal perdu par l'agent"},
            format="json",
        )
        self.assertEqual(resp.status_code, 200, resp.content)

        other.refresh_from_db()
        self.assertEqual(other.totp_secret, "")
        self.assertIsNone(other.totp_confirmed_at)

        entry = AdminActionLog.objects.latest("timestamp")
        self.assertEqual(entry.action, STAFF_TOTP_RESET)
        self.assertEqual(entry.result, AdminActionLog.Result.SUCCESS)
        self.assertEqual(entry.reason, "terminal perdu par l'agent")

    def test_get_requests_are_not_audited(self):
        before_count = AdminActionLog.objects.count()
        resp = self.client.get("/api/admin/me/")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(AdminActionLog.objects.count(), before_count)
