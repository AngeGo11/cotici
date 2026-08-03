"""Tests d'intégration pour `notify_tour_reminders` et `notify_tour_overdue` :
idempotence (ré-exécution ne double pas), arrêt après paiement, plafond de
2 relances de retard, cas JOURNALIER.
"""
from datetime import timedelta
from decimal import Decimal

from django.core.management import call_command
from django.test import TestCase
from django.utils import timezone

from apps.authn.models import User
from apps.notifications.models import Notifications
from apps.tontine.models import Tontine, TontineMembre, TontineRegle, TourTontine
from apps.tontine.scheduling import tour_echeance
from apps.wallet.models import Transaction, Wallet


def _make_user(suffix: str) -> User:
    return User.objects.create_user(
        username=f"reminder_{suffix}",
        password="testpass123",
        code_pin="1234",
        numero_telephone=f"22507200{suffix}",
    )


def _setup_tontine(frequence, *, frequence_personalise=None, n_membres=2):
    hote = _make_user("000")
    tontine = Tontine.objects.create(
        hote=hote, type_tontine=Tontine.TYPE_TONTINE.GROUPE, description="Rappels", qr_code="qr"
    )
    regle = TontineRegle.objects.create(
        tontine=tontine,
        objectif_cotisation=10000,
        montant_cotisation=1000,
        montant_penalite=0,
        nombre_max=n_membres,
        frequence=frequence,
        frequence_personalise=frequence_personalise,
        nombre_tours=5,
    )
    membres = []
    for i in range(n_membres):
        user = _make_user(f"{i + 1:03d}")
        TontineMembre.objects.create(
            tontine=tontine,
            membre=user,
            role_membre=TontineMembre.ROLE_MEMBRE.PARTICIPANT,
            statut_membre=TontineMembre.STATUT_MEMBRE.ACTIF,
            ordre_ramassage=i + 1,
        )
        membres.append(user)
    return tontine, regle, membres


def _start_tour(tontine, regle, beneficiaire, *, opened_at=None):
    tour = TourTontine.objects.create(
        tontine=tontine, user=beneficiaire, numero_du_tour=1, montant_depose=0
    )
    if opened_at is not None:
        TourTontine.objects.filter(pk=tour.pk).update(date=opened_at)
        tour.refresh_from_db()
    tour.date_echeance = tour_echeance(regle, tour)
    tour.save(update_fields=["date_echeance"])
    return tour


class NotifyTourRemindersTests(TestCase):
    def test_journalier_reminder_sent_at_tour_opening(self):
        tontine, regle, membres = _setup_tontine(TontineRegle.FREQUENCE_COTISATION.JOURNALIER)
        _start_tour(tontine, regle, membres[0], opened_at=timezone.now())

        call_command("notify_tour_reminders")

        # Le bénéficiaire du tour n'est pas nécessairement exempté par la
        # command (il doit aussi cotiser tant qu'il n'a pas payé) : on vérifie
        # juste qu'au moins une notification "cotisation" a été émise.
        self.assertTrue(
            Notifications.objects.filter(category="cotisation", destinataire__in=membres).exists()
        )

    def test_reminder_command_is_idempotent_on_replay(self):
        tontine, regle, membres = _setup_tontine(TontineRegle.FREQUENCE_COTISATION.HEBDOMADAIRE)
        # Ouvre le tour il y a 6 jours : la fenêtre J-1 (6 jours après ouverture
        # pour un tour de 7 jours) doit être active.
        _start_tour(tontine, regle, membres[0], opened_at=timezone.now() - timedelta(days=6))

        call_command("notify_tour_reminders")
        first_count = Notifications.objects.filter(category="cotisation").count()
        call_command("notify_tour_reminders")
        second_count = Notifications.objects.filter(category="cotisation").count()

        self.assertGreater(first_count, 0)
        self.assertEqual(first_count, second_count)

    def test_no_reminder_after_member_has_paid(self):
        tontine, regle, membres = _setup_tontine(TontineRegle.FREQUENCE_COTISATION.HEBDOMADAIRE)
        tour = _start_tour(tontine, regle, membres[0], opened_at=timezone.now() - timedelta(days=6))

        payeur = membres[1]
        wallet, _ = Wallet.objects.get_or_create(user=payeur)
        Transaction.objects.create(
            wallet=wallet,
            tontine=tontine,
            tour=tour,
            solde_courant=Decimal("0"),
            ref_transaction="PAYREM1",
            mode_de_paiement=Transaction.MODE_DE_PAIEMENT.SOLDE_COTICI,
            montant_transaction=Decimal("1000"),
            statut_transaction=Transaction.STATUT_TRANSACTION.REUSSIE,
            type_transaction=Transaction.TYPE_TRANSACTION.DEBIT,
        )

        call_command("notify_tour_reminders")

        self.assertFalse(
            Notifications.objects.filter(category="cotisation", destinataire=payeur).exists()
        )


class NotifyTourOverdueTests(TestCase):
    def test_overdue_alert_sent_after_echeance(self):
        tontine, regle, membres = _setup_tontine(TontineRegle.FREQUENCE_COTISATION.HEBDOMADAIRE)
        _start_tour(tontine, regle, membres[0], opened_at=timezone.now() - timedelta(days=8))

        call_command("notify_tour_overdue")

        self.assertTrue(
            Notifications.objects.filter(
                dedup_key__startswith="v1:tontine:cotisation.retard:", destinataire__in=membres
            ).exists()
        )

    def test_overdue_capped_at_two_relances(self):
        tontine, regle, membres = _setup_tontine(TontineRegle.FREQUENCE_COTISATION.MENSUEL)
        tour = _start_tour(tontine, regle, membres[0], opened_at=timezone.now() - timedelta(days=40))

        # Simule 2 relances déjà envoyées à des jours différents.
        for i in range(2):
            Notifications.objects.create(
                destinataire=membres[1],
                objet="Cotisation en retard",
                contenu="...",
                category=Notifications.Category.COTISATION,
                source_type="tontine",
                source_id=tontine.id,
                dedup_key=f"v1:tontine:cotisation.retard:tour={tour.id}:user={membres[1].id}:d=2020-01-0{i+1}",
            )

        call_command("notify_tour_overdue")

        count = Notifications.objects.filter(
            dedup_key__startswith=f"v1:tontine:cotisation.retard:tour={tour.id}:user={membres[1].id}:"
        ).count()
        self.assertEqual(count, 2)  # Aucune 3e relance.

    def test_overdue_replay_same_day_is_idempotent(self):
        tontine, regle, membres = _setup_tontine(TontineRegle.FREQUENCE_COTISATION.HEBDOMADAIRE)
        _start_tour(tontine, regle, membres[0], opened_at=timezone.now() - timedelta(days=8))

        call_command("notify_tour_overdue")
        first_count = Notifications.objects.filter(
            dedup_key__startswith="v1:tontine:cotisation.retard:"
        ).count()
        call_command("notify_tour_overdue")
        second_count = Notifications.objects.filter(
            dedup_key__startswith="v1:tontine:cotisation.retard:"
        ).count()

        self.assertEqual(first_count, second_count)
