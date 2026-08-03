"""`/api/admin/disputes/` : consultation et résolution des litiges.

Couvre :
- l'accès est refusé sans session staff (anonyme, mobile ordinaire) ;
- l'accès est refusé sans la permission `dispute.read`/`dispute.resolve` ;
- la résolution sans motif (`reason`) est rejetée (400) — action sensible ;
- une transition interdite (résoudre un litige déjà tranché) est refusée ;
- la résolution nominale met à jour statut/décideur et écrit une entrée
  `AdminActionLog` ;
- la file est bien priorisée du plus ancien litige ouvert au plus récent.
"""
from __future__ import annotations

from datetime import timedelta

from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from apps.administration.domain.roles import StaffRole
from apps.administration.tests.helpers import create_staff_profile, login_staff_client
from apps.audits.models import AdminActionLog
from apps.disputes.models import Dispute

User = get_user_model()

DISPUTES_URL = "/api/admin/disputes/"


def _create_client_user(username: str, phone: str) -> User:
    return User.objects.create_user(
        username=username,
        password="testpass123",
        code_pin="1234",
        numero_telephone=phone,
    )


def _create_dispute(*, opened_by, subject="Litige de test", category=Dispute.Category.OTHER, opened_at=None):
    dispute = Dispute.objects.create(
        opened_by=opened_by,
        category=category,
        subject=subject,
        description="Description détaillée du litige.",
    )
    if opened_at is not None:
        # `opened_at` est en auto_now_add : seul un UPDATE direct permet
        # d'antidater un litige pour tester l'ordre de la file.
        Dispute.objects.filter(pk=dispute.pk).update(opened_at=opened_at)
        dispute.refresh_from_db()
    return dispute


@override_settings(ADMIN_IP_ALLOWLIST="", DEBUG=True, ADMIN_TOTP_REQUIRED=True)
class DisputeAccessControlTests(TestCase):
    def setUp(self):
        cache.clear()
        self.client = APIClient()
        self.complainant = _create_client_user("client.disputes.access", "2250700300001")
        self.dispute = _create_dispute(opened_by=self.complainant)

    def test_anonymous_is_denied(self):
        resp = self.client.get(DISPUTES_URL)
        self.assertEqual(resp.status_code, 403)

    def test_authenticated_non_staff_is_denied(self):
        mobile_user = _create_client_user("mobile.disputes.access", "2250700300002")
        self.client.force_login(mobile_user)
        resp = self.client.get(DISPUTES_URL)
        self.assertEqual(resp.status_code, 403)

    def test_staff_without_dispute_read_permission_is_denied(self):
        # Aucun rôle du catalogue n'omet `dispute.read` sauf s'il n'a AUCUNE
        # permission de lecture ; on simule ce cas via un rôle inconnu n'étant
        # attaché à aucune permission (StaffProfile créé directement, sans
        # passer par `staff_service`, pour forcer un rôle hors matrice).
        from apps.administration.models import StaffProfile

        user = _create_client_user("staff.no.perm", "2250700300003")
        StaffProfile.objects.create(user=user, role="role_inconnu", totp_confirmed_at=timezone.now())
        self.client.force_login(user)
        resp = self.client.get(DISPUTES_URL)
        self.assertEqual(resp.status_code, 403)

    def test_staff_without_resolve_permission_cannot_resolve(self):
        create_staff_profile(
            username="staff.disputes.support",
            numero_telephone="2250700300004",
            password="Un-Mot-De-Passe-Support-1",
            role=StaffRole.SUPPORT,  # dispute.read oui, dispute.resolve non
        )
        login_staff_client(
            self.client, username="staff.disputes.support", password="Un-Mot-De-Passe-Support-1"
        )
        resp = self.client.get(DISPUTES_URL)
        self.assertEqual(resp.status_code, 200, resp.content)

        resp = self.client.post(
            f"{DISPUTES_URL}{self.dispute.pk}/resolve/",
            {"resolution": Dispute.Status.RESOLVED, "decision": "Remboursement validé.", "reason": "Motif suffisant."},
            format="json",
        )
        self.assertEqual(resp.status_code, 403)


@override_settings(ADMIN_IP_ALLOWLIST="", DEBUG=True, ADMIN_TOTP_REQUIRED=True)
class DisputeResolutionTests(TestCase):
    def setUp(self):
        cache.clear()
        self.client = APIClient()
        self.staff = create_staff_profile(
            username="staff.disputes.operateur",
            numero_telephone="2250700310001",
            password="Un-Mot-De-Passe-Operateur-1",
            role=StaffRole.OPERATEUR,  # dispute.read + dispute.resolve
        )
        login_staff_client(
            self.client, username="staff.disputes.operateur", password="Un-Mot-De-Passe-Operateur-1"
        )
        self.complainant = _create_client_user("client.disputes.resolution", "2250700310002")
        self.dispute = _create_dispute(
            opened_by=self.complainant,
            category=Dispute.Category.TRANSACTION_CONTESTED,
        )

    def _resolve(self, dispute_id, payload):
        return self.client.post(f"{DISPUTES_URL}{dispute_id}/resolve/", payload, format="json")

    def test_resolution_without_reason_is_rejected(self):
        resp = self._resolve(
            self.dispute.pk,
            {"resolution": Dispute.Status.RESOLVED, "decision": "Remboursement validé."},
        )
        self.assertEqual(resp.status_code, 400)
        self.dispute.refresh_from_db()
        self.assertEqual(self.dispute.status, Dispute.Status.OPEN)

    def test_resolution_without_decision_is_rejected(self):
        resp = self._resolve(
            self.dispute.pk,
            {"resolution": Dispute.Status.RESOLVED, "reason": "Vérifié avec le service transactions."},
        )
        self.assertEqual(resp.status_code, 400)

    def test_nominal_resolution_updates_status_and_resolver(self):
        resp = self._resolve(
            self.dispute.pk,
            {
                "resolution": Dispute.Status.RESOLVED,
                "decision": "Le montant a bien été crédité, litige non fondé.",
                "reason": "Vérification du relevé wallet effectuée avec le service transactions.",
            },
        )
        self.assertEqual(resp.status_code, 200, resp.content)
        self.dispute.refresh_from_db()
        self.assertEqual(self.dispute.status, Dispute.Status.RESOLVED)
        self.assertEqual(self.dispute.resolved_by_id, self.staff.user_id)
        self.assertIsNotNone(self.dispute.resolved_at)
        self.assertTrue(self.dispute.decision)

        log = AdminActionLog.objects.filter(action="dispute_resolved", target_id=str(self.dispute.pk)).first()
        self.assertIsNotNone(log)
        self.assertEqual(log.result, AdminActionLog.Result.SUCCESS)
        self.assertEqual(log.actor_id, self.staff.user_id)
        self.assertEqual(log.target_user_id, self.complainant.pk)
        self.assertTrue(log.reason)

    def test_rejecting_a_dispute_is_a_valid_outcome(self):
        resp = self._resolve(
            self.dispute.pk,
            {
                "resolution": Dispute.Status.REJECTED,
                "decision": "Réclamation non fondée après vérification.",
                "reason": "Aucune anomalie détectée sur la transaction citée.",
            },
        )
        self.assertEqual(resp.status_code, 200, resp.content)
        self.dispute.refresh_from_db()
        self.assertEqual(self.dispute.status, Dispute.Status.REJECTED)

    def test_resolving_an_already_resolved_dispute_is_refused(self):
        first = self._resolve(
            self.dispute.pk,
            {
                "resolution": Dispute.Status.RESOLVED,
                "decision": "Premier verdict.",
                "reason": "Motif de la première résolution.",
            },
        )
        self.assertEqual(first.status_code, 200, first.content)

        second = self._resolve(
            self.dispute.pk,
            {
                "resolution": Dispute.Status.REJECTED,
                "decision": "Second verdict, ne devrait jamais s'appliquer.",
                "reason": "Tentative de re-résolution.",
            },
        )
        self.assertEqual(second.status_code, 400)
        self.dispute.refresh_from_db()
        self.assertEqual(self.dispute.status, Dispute.Status.RESOLVED)
        self.assertEqual(self.dispute.decision, "Premier verdict.")

    def test_unknown_dispute_returns_404(self):
        resp = self._resolve(
            999999,
            {"resolution": Dispute.Status.RESOLVED, "decision": "x", "reason": "x" * 5},
        )
        self.assertEqual(resp.status_code, 404)


@override_settings(ADMIN_IP_ALLOWLIST="", DEBUG=True, ADMIN_TOTP_REQUIRED=True)
class DisputeQueueOrderingTests(TestCase):
    def setUp(self):
        cache.clear()
        self.client = APIClient()
        create_staff_profile(
            username="staff.disputes.queue",
            numero_telephone="2250700320001",
            password="Un-Mot-De-Passe-Queue-1",
            role=StaffRole.AUDITEUR,
        )
        login_staff_client(
            self.client, username="staff.disputes.queue", password="Un-Mot-De-Passe-Queue-1"
        )
        self.complainant = _create_client_user("client.disputes.queue", "2250700320002")

    def test_oldest_open_dispute_is_listed_first(self):
        now = timezone.now()
        newest = _create_dispute(
            opened_by=self.complainant, subject="Le plus récent", opened_at=now - timedelta(hours=1)
        )
        oldest = _create_dispute(
            opened_by=self.complainant, subject="Le plus ancien", opened_at=now - timedelta(days=5)
        )
        middle = _create_dispute(
            opened_by=self.complainant, subject="Intermédiaire", opened_at=now - timedelta(days=1)
        )

        resp = self.client.get(DISPUTES_URL)
        self.assertEqual(resp.status_code, 200, resp.content)
        ids_in_order = [row["id"] for row in resp.data["results"]]
        self.assertEqual(ids_in_order, [oldest.pk, middle.pk, newest.pk])

    def test_filters_by_status_and_category(self):
        matching = _create_dispute(
            opened_by=self.complainant,
            subject="Cotisation non créditée",
            category=Dispute.Category.CONTRIBUTION_NOT_CREDITED,
        )
        _create_dispute(
            opened_by=self.complainant,
            subject="Autre litige",
            category=Dispute.Category.OTHER,
        )

        resp = self.client.get(DISPUTES_URL, {"category": Dispute.Category.CONTRIBUTION_NOT_CREDITED})
        self.assertEqual(resp.status_code, 200, resp.content)
        ids = [row["id"] for row in resp.data["results"]]
        self.assertEqual(ids, [matching.pk])

        resp = self.client.get(DISPUTES_URL, {"status": Dispute.Status.OPEN})
        self.assertEqual(resp.status_code, 200, resp.content)
        self.assertEqual(len(resp.data["results"]), 2)

        resp = self.client.get(DISPUTES_URL, {"status": Dispute.Status.RESOLVED})
        self.assertEqual(resp.status_code, 200, resp.content)
        self.assertEqual(resp.data["results"], [])
