"""Tests pour l'app notifications :
- IDOR : un utilisateur ne peut ni lister, ni consulter, ni marquer comme lue
  la notification d'un autre utilisateur.
- Création correcte par catégorie (via les fabriques de `domain.catalog`).
- Idempotence du `dedup_key` (`emit_idempotent` / `get_or_create_by_dedup`).
"""
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from apps.authn.models import User
from apps.notifications.domain.catalog import (
    spec_cotisation_a_venir,
    spec_invitation_tontine,
    spec_paiement_valide,
    spec_securite_connexion,
)
from apps.notifications.models import Notifications
from apps.notifications.repositories.notification_repository import NotificationRepository
from apps.notifications.services.notification_service import NotificationService

import dataclasses
from decimal import Decimal
from django.utils import timezone


def _create_user(username: str, phone: str) -> User:
    return User.objects.create_user(
        username=username, password="testpass123", code_pin="1234", numero_telephone=phone
    )


class NotificationCatalogAndServiceTests(APITestCase):
    """Création correcte par catégorie."""

    def setUp(self):
        self.user = _create_user("notif_user_1", "22507000001")

    def test_emit_invitation_creates_notification_with_expected_category(self):
        NotificationService.emit(
            destinataire=self.user,
            spec=spec_invitation_tontine(tontine_nom="Ma tontine", tontine_id=42),
        )
        notif = Notifications.objects.get(destinataire=self.user)
        self.assertEqual(notif.category, "invitation")
        self.assertEqual(notif.source_type, "tontine")
        self.assertEqual(notif.source_id, 42)
        self.assertFalse(notif.est_lue)
        self.assertIsNone(notif.date_lecture)

    def test_emit_paiement_valide_creates_notification(self):
        NotificationService.emit(
            destinataire=self.user,
            spec=spec_paiement_valide(
                kind="dépôt", montant=Decimal("5000"), ref="DEP123",
                source_type="wallet", source_id=1,
            ),
        )
        notif = Notifications.objects.get(destinataire=self.user)
        self.assertEqual(notif.category, "paiement")
        self.assertIn("5000", notif.contenu)
        self.assertIn("DEP123", notif.contenu)

    def test_emit_securite_creates_notification(self):
        NotificationService.emit(
            destinataire=self.user,
            spec=spec_securite_connexion(ip="1.2.3.4", when=timezone.now()),
        )
        notif = Notifications.objects.get(destinataire=self.user)
        self.assertEqual(notif.category, "securite")
        self.assertEqual(notif.source_type, "auth")

    def test_emit_never_raises_even_if_destinataire_is_none(self):
        """emit() avale les erreurs : ne doit jamais faire échouer l'appelant métier."""
        try:
            NotificationService.emit(
                destinataire=None,
                spec=spec_paiement_valide(
                    kind="retrait", montant=Decimal("100"), ref="R1",
                ),
            )
        except Exception as exc:  # noqa: BLE001
            self.fail(f"NotificationService.emit() a laissé remonter une exception: {exc}")
        self.assertEqual(Notifications.objects.count(), 0)


class NotificationDedupIdempotencyTests(APITestCase):
    """Idempotence du dedup_key."""

    def setUp(self):
        self.user = _create_user("notif_user_2", "22507000002")

    def _spec(self, dedup_key: str):
        base = spec_cotisation_a_venir(
            tontine_nom="Tontine X", tontine_id=1, tour_num=1, echeance=timezone.now(),
        )
        return dataclasses.replace(base, dedup_key=dedup_key)

    def test_emit_idempotent_does_not_duplicate_on_same_dedup_key(self):
        spec = self._spec("cotisation:tontine=1:tour=1:user=999")

        NotificationService.emit_idempotent(destinataire=self.user, spec=spec)
        NotificationService.emit_idempotent(destinataire=self.user, spec=spec)
        NotificationService.emit_idempotent(destinataire=self.user, spec=spec)

        self.assertEqual(
            Notifications.objects.filter(dedup_key=spec.dedup_key).count(), 1
        )

    def test_get_or_create_by_dedup_reports_created_flag(self):
        spec = self._spec("cotisation:tontine=2:tour=1:user=1000")

        _, created_first = NotificationRepository.get_or_create_by_dedup(self.user, spec)
        _, created_second = NotificationRepository.get_or_create_by_dedup(self.user, spec)

        self.assertTrue(created_first)
        self.assertFalse(created_second)

    def test_get_or_create_by_dedup_requires_dedup_key(self):
        base = spec_invitation_tontine(tontine_nom="Sans dedup", tontine_id=1)
        with self.assertRaises(ValueError):
            NotificationRepository.get_or_create_by_dedup(self.user, base)


class NotificationIdorTests(APITestCase):
    """User A ne peut ni lister, ni get-detail, ni mark_read une notif de user B."""

    def setUp(self):
        self.user_a = _create_user("notif_idor_a", "22507000003")
        self.user_b = _create_user("notif_idor_b", "22507000004")

        self.notif_a = Notifications.objects.create(
            destinataire=self.user_a,
            objet="Pour A",
            contenu="Notification de A",
            category=Notifications.Category.PAIEMENT,
        )
        self.notif_b = Notifications.objects.create(
            destinataire=self.user_b,
            objet="Pour B",
            contenu="Notification de B",
            category=Notifications.Category.PAIEMENT,
        )

        self.client.force_authenticate(user=self.user_a)

    def test_list_only_returns_own_notifications(self):
        response = self.client.get(reverse("notification-list"))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        ids = [item["id"] for item in response.data["results"]]
        self.assertIn(self.notif_a.id, ids)
        self.assertNotIn(self.notif_b.id, ids)

    def test_retrieve_other_users_notification_returns_404(self):
        response = self.client.get(reverse("notification-detail", args=[self.notif_b.id]))
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_retrieve_own_notification_returns_200(self):
        response = self.client.get(reverse("notification-detail", args=[self.notif_a.id]))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["id"], self.notif_a.id)

    def test_mark_read_other_users_notification_returns_404_and_does_not_mutate(self):
        response = self.client.post(reverse("notification-mark-read", args=[self.notif_b.id]))
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.notif_b.refresh_from_db()
        self.assertFalse(self.notif_b.est_lue)

    def test_mark_read_own_notification_succeeds(self):
        response = self.client.post(reverse("notification-mark-read", args=[self.notif_a.id]))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.notif_a.refresh_from_db()
        self.assertTrue(self.notif_a.est_lue)
        self.assertIsNotNone(self.notif_a.date_lecture)

    def test_unread_count_scoped_to_user(self):
        response = self.client.get(reverse("notification-unread-count"))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["unread"], 1)

    def test_mark_all_read_only_affects_own_notifications(self):
        response = self.client.post(reverse("notification-mark-all-read"))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["updated"], 1)

        self.notif_a.refresh_from_db()
        self.notif_b.refresh_from_db()
        self.assertTrue(self.notif_a.est_lue)
        self.assertFalse(self.notif_b.est_lue)

    def test_unauthenticated_access_is_rejected(self):
        self.client.force_authenticate(user=None)
        response = self.client.get(reverse("notification-list"))
        self.assertIn(
            response.status_code,
            (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN),
        )
