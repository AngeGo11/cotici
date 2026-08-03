"""Tests de `push_dispatch`/`push_receipts` : tout appel HTTP est mocké."""
from datetime import timedelta
from unittest import mock

from django.core.management import call_command
from django.test import TestCase
from django.utils import timezone

from apps.authn.models import User
from apps.notifications.models import PushDevice, PushOutbox
from apps.notifications.push.expo import MAX_MESSAGES_PER_SEND_BATCH


def _make_user(suffix: str) -> User:
    return User.objects.create_user(
        username=f"dispatch_{suffix}",
        password="testpass123",
        code_pin="1234",
        numero_telephone=f"22507400{suffix}",
    )


def _outbox_entry(user, **kwargs):
    defaults = dict(
        destinataire=user,
        titre="Titre",
        corps="Corps",
        data={"source_type": "tontine", "source_id": 1, "category": "cotisation", "notification_id": None},
        next_attempt_at=timezone.now(),
    )
    defaults.update(kwargs)
    return PushOutbox.objects.create(**defaults)


class PushDispatchTests(TestCase):
    def setUp(self):
        self.user = _make_user("001")
        self.device = PushDevice.objects.create(
            user=self.user, expo_token="ExponentPushToken[a]", platform=PushDevice.Platform.IOS
        )

    @mock.patch("apps.notifications.management.commands.push_dispatch.send_push_messages")
    def test_successful_send_keeps_entry_in_sending_awaiting_receipt(self, mock_send):
        mock_send.return_value = [{"status": "ok", "id": "ticket-1"}]
        entry = _outbox_entry(self.user)

        call_command("push_dispatch")

        entry.refresh_from_db()
        self.assertEqual(entry.statut, PushOutbox.Statut.SENDING)
        self.assertEqual(entry.ticket_id, "ticket-1")
        mock_send.assert_called_once()

    @mock.patch("apps.notifications.management.commands.push_dispatch.send_push_messages")
    def test_device_not_registered_deactivates_device_and_drops_entry(self, mock_send):
        mock_send.return_value = [
            {"status": "error", "message": "not registered", "details": {"error": "DeviceNotRegistered"}}
        ]
        entry = _outbox_entry(self.user)

        call_command("push_dispatch")

        entry.refresh_from_db()
        self.device.refresh_from_db()
        self.assertEqual(entry.statut, PushOutbox.Statut.DROPPED)
        self.assertFalse(self.device.is_active)

    @mock.patch("apps.notifications.management.commands.push_dispatch.send_push_messages")
    def test_message_rate_exceeded_schedules_backoff_retry(self, mock_send):
        mock_send.return_value = [
            {"status": "error", "message": "rate", "details": {"error": "MessageRateExceeded"}}
        ]
        entry = _outbox_entry(self.user)

        call_command("push_dispatch")

        entry.refresh_from_db()
        self.assertEqual(entry.statut, PushOutbox.Statut.QUEUED)
        self.assertEqual(entry.attempts, 1)
        self.assertGreater(entry.next_attempt_at, timezone.now())

    @mock.patch("apps.notifications.management.commands.push_dispatch.send_push_messages")
    def test_retry_exhausted_after_max_attempts_marks_failed(self, mock_send):
        mock_send.return_value = [
            {"status": "error", "message": "rate", "details": {"error": "MessageRateExceeded"}}
        ]
        entry = _outbox_entry(self.user, attempts=5, statut=PushOutbox.Statut.FAILED)

        call_command("push_dispatch")

        entry.refresh_from_db()
        self.assertEqual(entry.statut, PushOutbox.Statut.FAILED)
        self.assertEqual(entry.attempts, 6)

    def test_no_active_device_drops_entry_without_http_call(self):
        self.device.is_active = False
        self.device.save(update_fields=["is_active"])
        entry = _outbox_entry(self.user)

        call_command("push_dispatch")

        entry.refresh_from_db()
        self.assertEqual(entry.statut, PushOutbox.Statut.DROPPED)
        self.assertEqual(entry.error_code, "no_active_device")

    @mock.patch("apps.notifications.management.commands.push_dispatch.send_push_messages")
    def test_batches_are_capped_at_100_messages(self, mock_send):
        # 150 destinataires distincts, chacun avec un device actif : doit être
        # envoyé en (au moins) 2 lots, aucun appel > 100 messages.
        users = [_make_user(f"{i:03d}") for i in range(2, 152)]
        for u in users:
            PushDevice.objects.create(
                user=u, expo_token=f"ExponentPushToken[{u.id}]", platform=PushDevice.Platform.ANDROID
            )
            _outbox_entry(u)

        mock_send.side_effect = lambda messages: [{"status": "ok", "id": f"t{i}"} for i in range(len(messages))]

        call_command("push_dispatch", **{"batch_size": 500})

        for call in mock_send.call_args_list:
            messages = call.args[0]
            self.assertLessEqual(len(messages), MAX_MESSAGES_PER_SEND_BATCH)
        total_sent = sum(len(call.args[0]) for call in mock_send.call_args_list)
        self.assertEqual(total_sent, 150)


class PushReceiptsTests(TestCase):
    def setUp(self):
        self.user = _make_user("900")

    @mock.patch("apps.notifications.management.commands.push_receipts.get_push_receipts")
    def test_ok_receipt_marks_entry_sent(self, mock_receipts):
        entry = _outbox_entry(
            self.user, statut=PushOutbox.Statut.SENDING, ticket_id="ticket-ok", attempts=1
        )
        mock_receipts.return_value = {"ticket-ok": {"status": "ok"}}

        call_command("push_receipts")

        entry.refresh_from_db()
        self.assertEqual(entry.statut, PushOutbox.Statut.SENT)
        self.assertIsNotNone(entry.receipt_checked_at)

    @mock.patch("apps.notifications.management.commands.push_receipts.get_push_receipts")
    def test_device_not_registered_receipt_drops_entry(self, mock_receipts):
        entry = _outbox_entry(
            self.user, statut=PushOutbox.Statut.SENDING, ticket_id="ticket-bad", attempts=1
        )
        mock_receipts.return_value = {
            "ticket-bad": {"status": "error", "details": {"error": "DeviceNotRegistered"}}
        }

        call_command("push_receipts")

        entry.refresh_from_db()
        self.assertEqual(entry.statut, PushOutbox.Statut.DROPPED)

    @mock.patch("apps.notifications.management.commands.push_receipts.get_push_receipts")
    def test_transient_error_receipt_requeues_with_backoff(self, mock_receipts):
        entry = _outbox_entry(
            self.user, statut=PushOutbox.Statut.SENDING, ticket_id="ticket-transient", attempts=1
        )
        mock_receipts.return_value = {
            "ticket-transient": {"status": "error", "details": {"error": "MessageTooBig"}}
        }

        call_command("push_receipts")

        entry.refresh_from_db()
        self.assertEqual(entry.statut, PushOutbox.Statut.QUEUED)
        self.assertEqual(entry.attempts, 2)
        self.assertGreater(entry.next_attempt_at, timezone.now())
