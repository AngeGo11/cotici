"""Contrats de sortie consommés par le front d'administration.

Ces tests existent parce que deux écrans (journal d'audit, comptes staff) ont
planté en production sur des champs absents de la réponse : un serializer
peut parfaitement rester "valide" tout en cessant de servir ce que
l'interface consomme. On fige donc ici l'ensemble exact des clés attendues,
côté serveur, plutôt que de le redécouvrir à l'exécution côté navigateur.

Toute modification de ces ensembles doit s'accompagner de la modification
correspondante dans `admin/src/lib/api/types.ts`.
"""
from __future__ import annotations

from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from apps.administration.domain.roles import StaffRole
from apps.administration.tests.helpers import create_staff_profile, login_staff_client
from apps.audits.models import AdminActionLog, AuditLog

User = get_user_model()

# Miroir de `StaffMember` (admin/src/lib/api/types.ts).
STAFF_CONTRACT = {
    "id",
    "username",
    "first_name",
    "last_name",
    "email",
    "role",
    "is_active",
    "totp_enabled",
    "permissions",
    "last_login",
    "date_joined",
}

# Miroir de `AuditEntry` (admin/src/lib/api/types.ts).
AUDIT_CONTRACT = {
    "source",
    "id",
    "created_at",
    "actor",
    "actor_role",
    "action",
    "target_type",
    "target_id",
    "reason",
    "ip_address",
    "user_agent",
    "metadata",
}


@override_settings(ADMIN_IP_ALLOWLIST="", DEBUG=True, ADMIN_TOTP_REQUIRED=True)
class StaffContractTests(TestCase):
    def setUp(self):
        cache.clear()
        self.client = APIClient()
        create_staff_profile(
            username="staff.contract",
            numero_telephone="2250700600001",
            password="Un-Mot-De-Passe-Contrat-1",
            role=StaffRole.SUPER_ADMIN,
        )
        login_staff_client(
            self.client,
            username="staff.contract",
            password="Un-Mot-De-Passe-Contrat-1",
        )

    def test_list_serves_every_field_the_screen_reads(self):
        resp = self.client.get("/api/admin/staff/")
        self.assertEqual(resp.status_code, 200, resp.content)
        row = resp.data["results"][0]
        self.assertTrue(
            STAFF_CONTRACT.issubset(set(row.keys())),
            f"Champs manquants : {STAFF_CONTRACT - set(row.keys())}",
        )

    def test_permissions_are_derived_from_the_role_matrix(self):
        """L'écran affiche `permissions.length` : une liste absente le fait
        planter, une liste vide induit en erreur."""
        resp = self.client.get("/api/admin/staff/")
        row = resp.data["results"][0]
        self.assertIsInstance(row["permissions"], list)
        self.assertIn("staff.manage", row["permissions"])

    def test_totp_state_is_exposed_but_never_the_secret(self):
        resp = self.client.get("/api/admin/staff/")
        row = resp.data["results"][0]
        self.assertTrue(row["totp_enabled"])
        self.assertNotIn("totp_secret", row)
        self.assertNotIn("totp_secret", resp.content.decode())


@override_settings(ADMIN_IP_ALLOWLIST="", DEBUG=True, ADMIN_TOTP_REQUIRED=True)
class AuditContractTests(TestCase):
    def setUp(self):
        cache.clear()
        self.client = APIClient()
        create_staff_profile(
            username="staff.audit.contract",
            numero_telephone="2250700600002",
            password="Un-Mot-De-Passe-Contrat-2",
            role=StaffRole.SUPER_ADMIN,
        )
        login_staff_client(
            self.client,
            username="staff.audit.contract",
            password="Un-Mot-De-Passe-Contrat-2",
        )
        self.actor = User.objects.get(username="staff.audit.contract")
        self.client_user = User.objects.create_user(
            username="client.audit",
            password="testpass123",
            code_pin="1234",
            numero_telephone="2250700600003",
        )

    def test_entries_are_flat_whatever_their_source(self):
        """Les deux journaux sont fusionnés dans une seule table : ils
        doivent sortir sous une forme unique, sans enveloppe à déballer."""
        AuditLog.objects.create(
            user=self.client_user,
            user_display="client.audit",
            action=AuditLog.Action.PIN_CHANGED,
            resource="self-service:credential-reset",
            status=AuditLog.Status.SUCCESS,
        )
        AdminActionLog.objects.create(
            actor=self.actor,
            action="staff_created",
            target_type="staff_profile",
            target_id="7",
            reason="Ouverture de compte",
        )

        resp = self.client.get("/api/admin/audit/")
        self.assertEqual(resp.status_code, 200, resp.content)
        self.assertGreaterEqual(len(resp.data["results"]), 2)

        for entry in resp.data["results"]:
            self.assertEqual(
                set(entry.keys()),
                AUDIT_CONTRACT,
                f"Contrat rompu pour la source {entry.get('source')}",
            )
            # L'écran appelle `action.toLowerCase()` : une action nulle le
            # fait planter.
            self.assertIsInstance(entry["action"], str)
            self.assertNotEqual(entry["action"], "")

    def test_source_specific_fields_land_in_metadata(self):
        AdminActionLog.objects.create(
            actor=self.actor,
            action="user_suspended",
            target_type="user",
            target_id="42",
            reason="Fraude",
            before={"is_active": True},
            after={"is_active": False},
        )
        entry = self.client.get("/api/admin/audit/").data["results"][0]
        self.assertEqual(entry["source"], "admin")
        self.assertEqual(entry["metadata"]["avant"], {"is_active": True})
        self.assertEqual(entry["metadata"]["apres"], {"is_active": False})
        self.assertEqual(entry["reason"], "Fraude")

    def test_search_actually_filters(self):
        """La barre de recherche de l'écran envoyait `search` dans le vide."""
        AdminActionLog.objects.create(
            actor=self.actor, action="staff_created", target_type="staff_profile"
        )
        AdminActionLog.objects.create(
            actor=self.actor, action="user_suspended", target_type="user"
        )

        resp = self.client.get("/api/admin/audit/", {"search": "user_suspended"})
        actions = {entry["action"] for entry in resp.data["results"]}
        self.assertEqual(actions, {"user_suspended"})
