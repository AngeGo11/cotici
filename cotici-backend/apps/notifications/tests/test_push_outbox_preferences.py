"""Tests du filtrage de l'outbox push par préférence utilisateur.

Couvre : catégorie mutée -> pas d'entrée outbox mais notification in-app
créée quand même ; catégories obligatoires (sécurité/paiement) qui ignorent
les préférences ; quiet hours qui décalent sans supprimer.
"""
import dataclasses
from datetime import time
from decimal import Decimal

from django.test import TestCase
from django.utils import timezone

from apps.authn.models import User
from apps.notifications.domain.catalog import spec_paiement_valide, spec_securite_connexion
from apps.notifications.domain.dedup import dedup_cotisation_rappel
from apps.notifications.domain.preferences import MANDATORY_CATEGORIES
from apps.notifications.models import NotificationPreference, Notifications, PushOutbox
from apps.notifications.services.notification_service import NotificationService


def _create_user(username: str, phone: str) -> User:
    return User.objects.create_user(
        username=username, password="testpass123", code_pin="1234", numero_telephone=phone
    )


class MutedCategoryTests(TestCase):
    def setUp(self):
        self.user = _create_user("mute_user", "22507110001")

    def test_muted_category_skips_outbox_but_keeps_notification(self):
        NotificationPreference.objects.create(
            user=self.user, push_enabled=True, categories_muted=["cotisation"]
        )
        spec = dataclasses.replace(
            spec_paiement_valide(kind="dépôt", montant=Decimal("1000"), ref="X1"),
            dedup_key=None,
        )
        # On force la catégorie "cotisation" pour ce test (paiement est
        # obligatoire — voir MandatoryCategoryTests) : on simule un rappel.
        spec = dataclasses.replace(spec, category="cotisation")

        NotificationService.emit(destinataire=self.user, spec=spec)

        self.assertEqual(Notifications.objects.filter(destinataire=self.user).count(), 1)
        self.assertEqual(PushOutbox.objects.filter(destinataire=self.user).count(), 0)

    def test_push_disabled_globally_skips_outbox_for_non_mandatory_category(self):
        NotificationPreference.objects.create(user=self.user, push_enabled=False)
        spec = dataclasses.replace(
            spec_paiement_valide(kind="dépôt", montant=Decimal("1000"), ref="X2"),
            category="invitation",
        )
        NotificationService.emit(destinataire=self.user, spec=spec)
        self.assertEqual(Notifications.objects.filter(destinataire=self.user).count(), 1)
        self.assertEqual(PushOutbox.objects.filter(destinataire=self.user).count(), 0)

    def test_non_muted_category_creates_outbox_entry(self):
        NotificationPreference.objects.create(
            user=self.user, push_enabled=True, categories_muted=["invitation"]
        )
        spec = dataclasses.replace(
            spec_paiement_valide(kind="dépôt", montant=Decimal("1000"), ref="X3"),
            category="cotisation",
        )
        NotificationService.emit(destinataire=self.user, spec=spec)
        self.assertEqual(PushOutbox.objects.filter(destinataire=self.user).count(), 1)


class MandatoryCategoryTests(TestCase):
    """securite/paiement ignorent TOUJOURS les préférences (mute ou push désactivé)."""

    def setUp(self):
        self.user = _create_user("mandatory_user", "22507110002")

    def test_mandatory_categories_constant(self):
        self.assertEqual(MANDATORY_CATEGORIES, {"securite", "paiement"})

    def test_paiement_ignores_full_mute_and_disabled_push(self):
        NotificationPreference.objects.create(
            user=self.user, push_enabled=False, categories_muted=["paiement", "securite"]
        )
        NotificationService.emit(
            destinataire=self.user,
            spec=spec_paiement_valide(kind="retrait", montant=Decimal("500"), ref="M1"),
        )
        self.assertEqual(PushOutbox.objects.filter(destinataire=self.user).count(), 1)

    def test_securite_ignores_full_mute_and_disabled_push(self):
        NotificationPreference.objects.create(
            user=self.user, push_enabled=False, categories_muted=["securite"]
        )
        NotificationService.emit(
            destinataire=self.user,
            spec=spec_securite_connexion(ip="1.2.3.4", when=timezone.now()),
        )
        self.assertEqual(PushOutbox.objects.filter(destinataire=self.user).count(), 1)


class QuietHoursTests(TestCase):
    """Les quiet hours décalent next_attempt_at, ne suppriment jamais le push."""

    def setUp(self):
        self.user = _create_user("quiet_user", "22507110003")

    def test_quiet_hours_delay_non_mandatory_push(self):
        NotificationPreference.objects.create(
            user=self.user,
            push_enabled=True,
            quiet_hours_start=time(21, 0),
            quiet_hours_end=time(7, 0),
        )
        now = timezone.now().replace(hour=22, minute=0, second=0, microsecond=0)
        spec = dataclasses.replace(
            spec_paiement_valide(kind="dépôt", montant=Decimal("100"), ref="Q1"),
            category="cotisation",
        )
        import unittest.mock as mock

        with mock.patch("django.utils.timezone.now", return_value=now):
            NotificationService.emit(destinataire=self.user, spec=spec)

        entry = PushOutbox.objects.get(destinataire=self.user)
        self.assertGreater(entry.next_attempt_at, now)
        self.assertEqual(entry.next_attempt_at.hour, 7)

    def test_quiet_hours_never_delay_mandatory_category(self):
        NotificationPreference.objects.create(
            user=self.user,
            push_enabled=True,
            quiet_hours_start=time(21, 0),
            quiet_hours_end=time(7, 0),
        )
        now = timezone.now().replace(hour=23, minute=0, second=0, microsecond=0)
        import unittest.mock as mock

        with mock.patch("django.utils.timezone.now", return_value=now):
            NotificationService.emit(
                destinataire=self.user,
                spec=spec_paiement_valide(kind="dépôt", montant=Decimal("100"), ref="Q2"),
            )

        entry = PushOutbox.objects.get(destinataire=self.user)
        self.assertEqual(entry.next_attempt_at, now)

    def test_outside_quiet_hours_sends_immediately(self):
        NotificationPreference.objects.create(
            user=self.user,
            push_enabled=True,
            quiet_hours_start=time(21, 0),
            quiet_hours_end=time(7, 0),
        )
        now = timezone.now().replace(hour=12, minute=0, second=0, microsecond=0)
        spec = dataclasses.replace(
            spec_paiement_valide(kind="dépôt", montant=Decimal("100"), ref="Q3"),
            category="cotisation",
        )
        import unittest.mock as mock

        with mock.patch("django.utils.timezone.now", return_value=now):
            NotificationService.emit(destinataire=self.user, spec=spec)

        entry = PushOutbox.objects.get(destinataire=self.user)
        self.assertEqual(entry.next_attempt_at, now)


class BulkEmitIdempotentTests(TestCase):
    def setUp(self):
        self.user = _create_user("bulk_user", "22507110004")

    def test_bulk_emit_idempotent_does_not_duplicate(self):
        spec = dataclasses.replace(
            spec_paiement_valide(kind="dépôt", montant=Decimal("100"), ref="B1"),
            category="cotisation",
            dedup_key=dedup_cotisation_rappel(tour_id=1, user_id=self.user.id, offset_label="J0"),
        )
        created_first = NotificationService.bulk_emit_idempotent([(self.user, spec)])
        created_second = NotificationService.bulk_emit_idempotent([(self.user, spec)])
        self.assertEqual(created_first, 1)
        self.assertEqual(created_second, 0)
        self.assertEqual(Notifications.objects.filter(dedup_key=spec.dedup_key).count(), 1)
        self.assertEqual(PushOutbox.objects.filter(destinataire=self.user).count(), 1)
