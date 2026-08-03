"""Tests purs pour `apps.tontine.scheduling` : échéance, fenêtres de rappel
par fréquence (cas JOURNALIER en particulier), offsets de retard.
"""
from datetime import timedelta

from django.test import TestCase
from django.utils import timezone

from apps.tontine.models import Tontine, TontineRegle, TourTontine
from apps.tontine.scheduling import (
    MAX_RETARD_RELANCES,
    frequence_delta,
    reminder_targets,
    retard_offsets,
    tour_echeance,
)
from apps.authn.models import User


def _make_tontine_regle(frequence, *, frequence_personalise=None) -> tuple[Tontine, TontineRegle]:
    hote = User.objects.create_user(
        username=f"sched_{frequence}_{frequence_personalise}",
        password="testpass123",
        code_pin="1234",
        numero_telephone=f"2250700{abs(hash((frequence, frequence_personalise))) % 100000:05d}",
    )
    tontine = Tontine.objects.create(
        hote=hote,
        type_tontine=Tontine.TYPE_TONTINE.GROUPE,
        description="Tontine test scheduling",
        qr_code="qr",
    )
    regle = TontineRegle.objects.create(
        tontine=tontine,
        objectif_cotisation=10000,
        montant_cotisation=1000,
        montant_penalite=0,
        nombre_max=5,
        frequence=frequence,
        frequence_personalise=frequence_personalise,
        nombre_tours=5,
    )
    return tontine, regle


class TourEcheanceTests(TestCase):
    def test_journalier_echeance_is_one_day_after_start(self):
        tontine, regle = _make_tontine_regle(TontineRegle.FREQUENCE_COTISATION.JOURNALIER)
        tour = TourTontine.objects.create(
            tontine=tontine, user=tontine.hote, numero_du_tour=1, montant_depose=0
        )
        echeance = tour_echeance(regle, tour)
        self.assertEqual(echeance, tour.date + timedelta(days=1))

    def test_personnalise_without_frequence_personalise_has_no_echeance(self):
        tontine, regle = _make_tontine_regle(TontineRegle.FREQUENCE_COTISATION.PERSONNALISE)
        tour = TourTontine.objects.create(
            tontine=tontine, user=tontine.hote, numero_du_tour=1, montant_depose=0
        )
        self.assertIsNone(frequence_delta(regle))
        self.assertIsNone(tour_echeance(regle, tour))


class ReminderTargetsTests(TestCase):
    def test_journalier_has_single_target_at_tour_opening(self):
        """Cas critique : la fenêtre fixe de 48h serait inapplicable ici (tour de 24h)."""
        tontine, regle = _make_tontine_regle(TontineRegle.FREQUENCE_COTISATION.JOURNALIER)
        tour = TourTontine.objects.create(
            tontine=tontine, user=tontine.hote, numero_du_tour=1, montant_depose=0
        )
        targets = reminder_targets(regle, tour)
        self.assertEqual(len(targets), 1)
        self.assertEqual(targets[0]["label"], "J0")
        self.assertEqual(targets[0]["window_start"], tour.date)
        self.assertGreaterEqual(targets[0]["window_start"], tour.date)

    def test_hebdomadaire_has_j1_and_j0(self):
        tontine, regle = _make_tontine_regle(TontineRegle.FREQUENCE_COTISATION.HEBDOMADAIRE)
        tour = TourTontine.objects.create(
            tontine=tontine, user=tontine.hote, numero_du_tour=1, montant_depose=0
        )
        labels = [t["label"] for t in reminder_targets(regle, tour)]
        self.assertEqual(labels, ["J1", "J0"])

    def test_mensuel_has_j3_j1_j0(self):
        tontine, regle = _make_tontine_regle(TontineRegle.FREQUENCE_COTISATION.MENSUEL)
        tour = TourTontine.objects.create(
            tontine=tontine, user=tontine.hote, numero_du_tour=1, montant_depose=0
        )
        labels = [t["label"] for t in reminder_targets(regle, tour)]
        self.assertEqual(labels, ["J3", "J1", "J0"])

    def test_personnalise_short_delay_has_only_j0(self):
        tontine, regle = _make_tontine_regle(
            TontineRegle.FREQUENCE_COTISATION.PERSONNALISE, frequence_personalise=3
        )
        tour = TourTontine.objects.create(
            tontine=tontine, user=tontine.hote, numero_du_tour=1, montant_depose=0
        )
        labels = [t["label"] for t in reminder_targets(regle, tour)]
        self.assertEqual(labels, ["J0"])

    def test_personnalise_long_delay_has_j2_and_j0(self):
        tontine, regle = _make_tontine_regle(
            TontineRegle.FREQUENCE_COTISATION.PERSONNALISE, frequence_personalise=10
        )
        tour = TourTontine.objects.create(
            tontine=tontine, user=tontine.hote, numero_du_tour=1, montant_depose=0
        )
        labels = [t["label"] for t in reminder_targets(regle, tour)]
        self.assertEqual(labels, ["J2", "J0"])

    def test_window_never_starts_before_tour_opening(self):
        tontine, regle = _make_tontine_regle(TontineRegle.FREQUENCE_COTISATION.MENSUEL)
        tour = TourTontine.objects.create(
            tontine=tontine, user=tontine.hote, numero_du_tour=1, montant_depose=0
        )
        for target in reminder_targets(regle, tour):
            self.assertGreaterEqual(target["window_start"], tour.date)


class RetardOffsetsTests(TestCase):
    def test_journalier_retard_is_three_hours(self):
        _, regle = _make_tontine_regle(TontineRegle.FREQUENCE_COTISATION.JOURNALIER)
        self.assertEqual(retard_offsets(regle), [timedelta(hours=3)])

    def test_mensuel_retard_has_two_offsets_capped_at_max(self):
        _, regle = _make_tontine_regle(TontineRegle.FREQUENCE_COTISATION.MENSUEL)
        offsets = retard_offsets(regle)
        self.assertEqual(len(offsets), MAX_RETARD_RELANCES)
        self.assertEqual(offsets, [timedelta(days=1), timedelta(days=3)])

    def test_hebdomadaire_retard_has_one_offset(self):
        _, regle = _make_tontine_regle(TontineRegle.FREQUENCE_COTISATION.HEBDOMADAIRE)
        self.assertEqual(retard_offsets(regle), [timedelta(days=1)])
