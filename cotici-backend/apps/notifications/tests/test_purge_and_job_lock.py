"""Tests de `purge_notifications` et du verrou anti-chevauchement (`job_lock`)."""
from datetime import timedelta

import psycopg2
from django.core.management import call_command
from django.db import connection
from django.test import TestCase
from django.utils import timezone

from apps.authn.models import User
from apps.notifications.management.commands._job_utils import _advisory_lock_key, job_lock
from apps.notifications.models import JobRun, Notifications, PushOutbox


def _make_user(suffix: str) -> User:
    return User.objects.create_user(
        username=f"purge_{suffix}",
        password="testpass123",
        code_pin="1234",
        numero_telephone=f"22507500{suffix}",
    )


class PurgeNotificationsTests(TestCase):
    def setUp(self):
        self.user = _make_user("001")

    def _make_notif(self, *, est_lue, date_envoie, date_lecture=None):
        notif = Notifications.objects.create(
            destinataire=self.user,
            objet="X",
            contenu="Y",
            category=Notifications.Category.PAIEMENT,
            est_lue=est_lue,
            date_lecture=date_lecture,
        )
        Notifications.objects.filter(pk=notif.pk).update(date_envoie=date_envoie)
        return notif

    def test_old_read_notification_is_purged(self):
        now = timezone.now()
        old_read = self._make_notif(
            est_lue=True, date_envoie=now - timedelta(days=200), date_lecture=now - timedelta(days=100)
        )
        call_command("purge_notifications")
        self.assertFalse(Notifications.objects.filter(pk=old_read.pk).exists())

    def test_recent_read_notification_is_kept(self):
        now = timezone.now()
        recent_read = self._make_notif(
            est_lue=True, date_envoie=now - timedelta(days=10), date_lecture=now - timedelta(days=5)
        )
        call_command("purge_notifications")
        self.assertTrue(Notifications.objects.filter(pk=recent_read.pk).exists())

    def test_very_old_unread_notification_is_purged_via_all_cutoff(self):
        now = timezone.now()
        old_unread = self._make_notif(est_lue=False, date_envoie=now - timedelta(days=400))
        call_command("purge_notifications")
        self.assertFalse(Notifications.objects.filter(pk=old_unread.pk).exists())

    def test_recent_unread_notification_is_kept(self):
        now = timezone.now()
        recent_unread = self._make_notif(est_lue=False, date_envoie=now - timedelta(days=5))
        call_command("purge_notifications")
        self.assertTrue(Notifications.objects.filter(pk=recent_unread.pk).exists())

    def test_old_sent_outbox_entry_is_purged(self):
        entry = PushOutbox.objects.create(
            destinataire=self.user, titre="T", corps="C", statut=PushOutbox.Statut.SENT
        )
        PushOutbox.objects.filter(pk=entry.pk).update(
            updated_at=timezone.now() - timedelta(days=45)
        )
        call_command("purge_notifications")
        self.assertFalse(PushOutbox.objects.filter(pk=entry.pk).exists())

    def test_job_run_heartbeat_updated_on_success(self):
        call_command("purge_notifications")
        run = JobRun.objects.get(job_name="purge_notifications")
        self.assertIsNotNone(run.last_success_at)
        self.assertEqual(run.runs_ok, 1)
        self.assertEqual(run.runs_failed, 0)


def _raw_connection():
    """Connexion psycopg2 brute, indépendante de la connexion Django du test.

    Nécessaire pour vérifier un verrou par session PostgreSQL
    (`pg_try_advisory_lock` est réentrant au sein d'une même session — le
    re-tester sur LA MÊME connexion réussirait toujours, ce qui ne prouverait
    rien). `connection.settings_dict` reflète déjà le nom de la base de test
    swappé par Django (préfixe `test_`), donc pas besoin de relire
    `settings.DATABASES` directement.
    """
    cfg = connection.settings_dict
    return psycopg2.connect(
        dbname=cfg["NAME"],
        user=cfg["USER"] or None,
        password=cfg["PASSWORD"] or None,
        host=cfg["HOST"] or None,
        port=cfg["PORT"] or None,
    )


class JobLockPrimitiveTests(TestCase):
    """Vérifie directement la primitive `pg_try_advisory_lock` sous-jacente à `job_lock`.

    Utilise deux connexions PostgreSQL distinctes (donc deux sessions) plutôt
    que des threads : plus rapide, déterministe, et suffisant pour prouver
    qu'une deuxième session ne peut pas acquérir un verrou déjà détenu par une
    première — exactement le scénario anti-chevauchement de `push_dispatch`.
    """

    def test_second_session_fails_while_first_holds_lock(self):
        key = _advisory_lock_key("test_job_concurrent")
        conn1 = _raw_connection()
        conn2 = _raw_connection()
        try:
            with conn1.cursor() as cur1:
                cur1.execute("SELECT pg_try_advisory_lock(%s)", [key])
                acquired1 = cur1.fetchone()[0]

            with conn2.cursor() as cur2:
                cur2.execute("SELECT pg_try_advisory_lock(%s)", [key])
                acquired2 = cur2.fetchone()[0]

            self.assertTrue(acquired1)
            self.assertFalse(acquired2)
        finally:
            conn1.close()
            conn2.close()

    def test_lock_available_again_after_release(self):
        key = _advisory_lock_key("test_job_release")
        conn1 = _raw_connection()
        try:
            with conn1.cursor() as cur:
                cur.execute("SELECT pg_try_advisory_lock(%s)", [key])
                self.assertTrue(cur.fetchone()[0])
                cur.execute("SELECT pg_advisory_unlock(%s)", [key])
        finally:
            conn1.close()

        conn2 = _raw_connection()
        try:
            with conn2.cursor() as cur:
                cur.execute("SELECT pg_try_advisory_lock(%s)", [key])
                self.assertTrue(cur.fetchone()[0])
        finally:
            conn2.close()


class JobLockContextManagerTests(TestCase):
    """`job_lock` : acquisition/relâchement séquentiels sur la connexion du test."""

    def test_lock_released_after_context_exits(self):
        with job_lock("test_job_sequential") as first:
            self.assertTrue(first)
        with job_lock("test_job_sequential") as second:
            self.assertTrue(second)
