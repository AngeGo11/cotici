"""`/api/admin/settings/` : lecture et écriture des réglages plateforme.

Points vérifiés :

- un `GET` sur une base vierge renvoie le catalogue complet avec les valeurs
  par défaut (aucune ligne `PlatformSetting` nécessaire) ;
- l'écriture est refusée sans `Perm.SETTINGS_WRITE`, sans motif, pour une clé
  hors catalogue, et pour une valeur qui ne respecte pas le type déclaré ;
- une écriture nominale persiste la valeur ET journalise le before/after de
  chaque clé modifiée dans `AdminActionLog`.
"""
from __future__ import annotations

from decimal import Decimal

from django.core.cache import cache
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from apps.administration.domain.roles import StaffRole
from apps.administration.domain.settings_catalog import SETTINGS_CATALOG
from apps.administration.models import PlatformSetting
from apps.administration.tests.helpers import create_staff_profile, login_staff_client
from apps.audits.models import AdminActionLog

SETTINGS_URL = "/api/admin/settings/"


@override_settings(ADMIN_IP_ALLOWLIST="", DEBUG=True, ADMIN_TOTP_REQUIRED=True)
class AdminSettingsReadTests(TestCase):
    def setUp(self):
        cache.clear()
        self.client = APIClient()
        create_staff_profile(
            username="staff.settings.reader",
            numero_telephone="2250700300001",
            password="Un-Mot-De-Passe-Settings-1",
            role=StaffRole.SUPPORT,
        )
        login_staff_client(
            self.client,
            username="staff.settings.reader",
            password="Un-Mot-De-Passe-Settings-1",
        )

    def test_get_on_empty_db_returns_full_default_catalog(self):
        self.assertEqual(PlatformSetting.objects.count(), 0)

        resp = self.client.get(SETTINGS_URL)
        self.assertEqual(resp.status_code, 200, resp.content)

        returned_keys = {item["key"] for item in resp.data}
        self.assertEqual(returned_keys, set(SETTINGS_CATALOG.keys()))

        for item in resp.data:
            definition = SETTINGS_CATALOG[item["key"]]
            self.assertTrue(item["is_default"])
            self.assertIsNone(item["updated_at"])
            self.assertIsNone(item["updated_by"])
            if definition.value_type.value == "decimal":
                self.assertEqual(Decimal(item["value"]), definition.default)
            else:
                self.assertEqual(item["value"], definition.default)

    def test_get_does_not_require_settings_write_permission(self):
        # Le compte de test a le rôle SUPPORT, qui ne porte pas
        # `settings.write` : la lecture doit malgré tout être autorisée.
        resp = self.client.get(SETTINGS_URL)
        self.assertEqual(resp.status_code, 200, resp.content)


@override_settings(ADMIN_IP_ALLOWLIST="", DEBUG=True, ADMIN_TOTP_REQUIRED=True)
class AdminSettingsWriteTests(TestCase):
    def setUp(self):
        cache.clear()

        self.admin_client = APIClient()
        create_staff_profile(
            username="staff.settings.admin",
            numero_telephone="2250700300002",
            password="Un-Mot-De-Passe-Settings-2",
            role=StaffRole.SUPER_ADMIN,
        )
        login_staff_client(
            self.admin_client,
            username="staff.settings.admin",
            password="Un-Mot-De-Passe-Settings-2",
        )

        self.support_client = APIClient()
        create_staff_profile(
            username="staff.settings.support",
            numero_telephone="2250700300003",
            password="Un-Mot-De-Passe-Settings-3",
            role=StaffRole.SUPPORT,
        )
        login_staff_client(
            self.support_client,
            username="staff.settings.support",
            password="Un-Mot-De-Passe-Settings-3",
        )

    def test_write_forbidden_without_settings_write_permission(self):
        resp = self.support_client.patch(
            SETTINGS_URL,
            {
                "changes": {"wallet.deposit_min_amount": "200"},
                "reason": "Tentative sans la permission requise.",
            },
            format="json",
        )
        self.assertEqual(resp.status_code, 403, resp.content)
        self.assertEqual(PlatformSetting.objects.count(), 0)

    def test_write_without_reason_returns_400(self):
        resp = self.admin_client.patch(
            SETTINGS_URL,
            {"changes": {"wallet.deposit_min_amount": "200"}, "reason": ""},
            format="json",
        )
        self.assertEqual(resp.status_code, 400, resp.content)
        self.assertEqual(PlatformSetting.objects.count(), 0)

    def test_write_unknown_key_returns_400(self):
        resp = self.admin_client.patch(
            SETTINGS_URL,
            {
                "changes": {"wallet.inexistant": "200"},
                "reason": "Verification d'une cle hors catalogue.",
            },
            format="json",
        )
        self.assertEqual(resp.status_code, 400, resp.content)
        self.assertEqual(PlatformSetting.objects.count(), 0)

    def test_write_invalid_value_for_type_returns_400(self):
        resp = self.admin_client.patch(
            SETTINGS_URL,
            {
                "changes": {"platform.maintenance_mode": "oui"},
                "reason": "Verification d'une valeur invalide pour un booleen.",
            },
            format="json",
        )
        self.assertEqual(resp.status_code, 400, resp.content)
        self.assertEqual(PlatformSetting.objects.count(), 0)

    def test_write_value_below_minimum_returns_400(self):
        resp = self.admin_client.patch(
            SETTINGS_URL,
            {
                "changes": {"wallet.deposit_min_amount": "-100"},
                "reason": "Verification d'un montant negatif refuse.",
            },
            format="json",
        )
        self.assertEqual(resp.status_code, 400, resp.content)
        self.assertEqual(PlatformSetting.objects.count(), 0)

    def test_write_value_above_declared_max_returns_400(self):
        resp = self.admin_client.patch(
            SETTINGS_URL,
            {
                "changes": {"tontine.grace_period_hours": 1000},
                "reason": "Verification d'un delai de grace hors bornes.",
            },
            format="json",
        )
        self.assertEqual(resp.status_code, 400, resp.content)
        self.assertEqual(PlatformSetting.objects.count(), 0)

    def test_nominal_write_persists_value_and_logs_audit_before_after(self):
        resp = self.admin_client.patch(
            SETTINGS_URL,
            {
                "changes": {
                    "wallet.deposit_min_amount": "250",
                    "platform.maintenance_mode": True,
                },
                "reason": "Ajustement suite a une revue de risque mensuelle.",
            },
            format="json",
        )
        self.assertEqual(resp.status_code, 200, resp.content)

        by_key = {item["key"]: item for item in resp.data}
        self.assertEqual(Decimal(by_key["wallet.deposit_min_amount"]["value"]), Decimal("250"))
        self.assertFalse(by_key["wallet.deposit_min_amount"]["is_default"])
        self.assertEqual(by_key["platform.maintenance_mode"]["value"], True)

        deposit_row = PlatformSetting.objects.get(key="wallet.deposit_min_amount")
        self.assertEqual(Decimal(deposit_row.value), Decimal("250"))
        maintenance_row = PlatformSetting.objects.get(key="platform.maintenance_mode")
        self.assertIs(maintenance_row.value, True)

        log = AdminActionLog.objects.filter(action="settings_changed").latest("timestamp")
        self.assertEqual(log.reason, "Ajustement suite a une revue de risque mensuelle.")
        self.assertEqual(log.before["wallet.deposit_min_amount"], "100")
        self.assertEqual(log.after["wallet.deposit_min_amount"], "250")
        self.assertEqual(log.before["platform.maintenance_mode"], False)
        self.assertEqual(log.after["platform.maintenance_mode"], True)

    def test_second_write_reports_previous_value_as_before(self):
        first = self.admin_client.patch(
            SETTINGS_URL,
            {
                "changes": {"wallet.withdrawal_min_amount": "700"},
                "reason": "Premiere modification du montant minimum de retrait.",
            },
            format="json",
        )
        self.assertEqual(first.status_code, 200, first.content)

        second = self.admin_client.patch(
            SETTINGS_URL,
            {
                "changes": {"wallet.withdrawal_min_amount": "900"},
                "reason": "Seconde modification du montant minimum de retrait.",
            },
            format="json",
        )
        self.assertEqual(second.status_code, 200, second.content)

        log = AdminActionLog.objects.filter(action="settings_changed").latest("timestamp")
        self.assertEqual(log.before["wallet.withdrawal_min_amount"], "700")
        self.assertEqual(log.after["wallet.withdrawal_min_amount"], "900")
