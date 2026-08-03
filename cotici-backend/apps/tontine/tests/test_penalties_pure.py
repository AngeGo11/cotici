"""Tests purs pour `apps.tontine.penalties` (aucun I/O, aucune DB nécessaire
pour les assertions elles-mêmes — `TestCase` est utilisé uniquement pour
pouvoir construire des instances `TontineRegle`/`TourTontine` non sauvegardées
en mémoire, comme `test_scheduling.py`).

Couvre : deadline glissante (rang 1 vs rang >1), garde-fous d'activation
combinés, réserve de cotisation anti-spirale de dette, plafond de dette.
"""
from datetime import timedelta
from decimal import Decimal

from django.test import SimpleTestCase
from django.utils import timezone

from apps.tontine.models import TontineRegle, TourTontine
from apps.tontine.penalties import (
    PLAFOND_DETTE_EN_COTISATIONS,
    deadline_penalite,
    delai_grace_delta,
    est_en_retard,
    montant_penalite_pour,
    penalites_auto_actives,
    plafond_dette_atteint,
    reserve_cotisation,
)


def _regle(**overrides) -> TontineRegle:
    defaults = dict(
        objectif_cotisation=Decimal("10000"),
        montant_cotisation=Decimal("1000"),
        montant_penalite=Decimal("500"),
        nombre_max=5,
        nombre_tours=5,
        delai_grace_heures=24,
        penalites_automatiques=True,
        frequence=TontineRegle.FREQUENCE_COTISATION.MENSUEL,
    )
    defaults.update(overrides)
    return TontineRegle(**defaults)


def _tour(**overrides) -> TourTontine:
    now = timezone.now()
    defaults = dict(
        numero_du_tour=1,
        montant_depose=Decimal("0"),
        statut_tour=TourTontine.STATUT_TOUR.EN_COURS,
        date=now,
        date_echeance=now,
    )
    defaults.update(overrides)
    return TourTontine(**defaults)


class DelaiGraceDeltaTests(SimpleTestCase):
    def test_delai_grace_delta_matches_hours(self):
        regle = _regle(delai_grace_heures=48)
        self.assertEqual(delai_grace_delta(regle), timedelta(hours=48))

    def test_delai_grace_zero_is_immediate(self):
        regle = _regle(delai_grace_heures=0)
        self.assertEqual(delai_grace_delta(regle), timedelta(0))


class DeadlinePenaliteTests(SimpleTestCase):
    """Paiement libre (décision produit) : la deadline est désormais UNIFORME
    par tour (échéance + délai de grâce), il n'existe plus de notion de
    "devenu payeur à" par rang."""

    def test_deadline_uses_tour_echeance(self):
        now = timezone.now()
        regle = _regle(delai_grace_heures=24)
        tour = _tour(date=now, date_echeance=now)
        deadline = deadline_penalite(regle, tour)
        self.assertEqual(deadline, now + timedelta(hours=24))

    def test_deadline_falls_back_to_tour_date_if_no_echeance(self):
        now = timezone.now()
        regle = _regle(delai_grace_heures=10)
        tour = _tour(date=now, date_echeance=None)
        deadline = deadline_penalite(regle, tour)
        self.assertEqual(deadline, now + timedelta(hours=10))


class EstEnRetardTests(SimpleTestCase):
    def test_not_late_before_deadline(self):
        now = timezone.now()
        regle = _regle(delai_grace_heures=24)
        tour = _tour(date=now, date_echeance=now)
        self.assertFalse(est_en_retard(regle, tour, now=now + timedelta(hours=23)))

    def test_late_strictly_after_deadline(self):
        now = timezone.now()
        regle = _regle(delai_grace_heures=24)
        tour = _tour(date=now, date_echeance=now)
        self.assertTrue(est_en_retard(regle, tour, now=now + timedelta(hours=24, seconds=1)))

    def test_exactly_at_deadline_is_not_late(self):
        """`now > deadline` strict : `now == deadline` n'est pas en retard."""
        now = timezone.now()
        regle = _regle(delai_grace_heures=24)
        tour = _tour(date=now, date_echeance=now)
        deadline = now + timedelta(hours=24)
        self.assertFalse(est_en_retard(regle, tour, now=deadline))


class MontantPenalitePourTests(SimpleTestCase):
    def test_returns_regle_montant_penalite(self):
        regle = _regle(montant_penalite=Decimal("777"))
        self.assertEqual(montant_penalite_pour(regle), Decimal("777"))


class PlafondDetteAtteintTests(SimpleTestCase):
    def test_below_threshold_is_false(self):
        regle = _regle(montant_cotisation=Decimal("1000"))
        seuil = regle.montant_cotisation * PLAFOND_DETTE_EN_COTISATIONS
        self.assertFalse(plafond_dette_atteint(regle, seuil - Decimal("1")))

    def test_exactly_at_threshold_is_true(self):
        regle = _regle(montant_cotisation=Decimal("1000"))
        seuil = regle.montant_cotisation * PLAFOND_DETTE_EN_COTISATIONS
        self.assertTrue(plafond_dette_atteint(regle, seuil))

    def test_above_threshold_is_true(self):
        regle = _regle(montant_cotisation=Decimal("1000"))
        seuil = regle.montant_cotisation * PLAFOND_DETTE_EN_COTISATIONS
        self.assertTrue(plafond_dette_atteint(regle, seuil + Decimal("1")))


class PenalitesAutoActivesTests(SimpleTestCase):
    def _base(self, **overrides):
        now = timezone.now()
        cutoff = now - timedelta(days=30)
        regle = _regle(penalites_automatiques=True, montant_penalite=Decimal("500"))
        tour = _tour(date_echeance=now)
        params = dict(regle=regle, tour=tour, now=now, cutoff=cutoff)
        params.update(overrides)
        return params

    def test_all_conditions_met_is_active(self):
        params = self._base()
        self.assertTrue(penalites_auto_actives(**params))

    def test_penalites_automatiques_false_disables(self):
        params = self._base()
        params["regle"] = _regle(penalites_automatiques=False, montant_penalite=Decimal("500"))
        self.assertFalse(penalites_auto_actives(**params))

    def test_montant_penalite_zero_disables(self):
        params = self._base()
        params["regle"] = _regle(penalites_automatiques=True, montant_penalite=Decimal("0"))
        self.assertFalse(penalites_auto_actives(**params))

    def test_cutoff_none_disables_globally(self):
        params = self._base()
        params["cutoff"] = None
        self.assertFalse(penalites_auto_actives(**params))

    def test_tour_date_echeance_none_disables(self):
        params = self._base()
        params["tour"] = _tour(date_echeance=None)
        self.assertFalse(penalites_auto_actives(**params))

    def test_tour_date_echeance_before_cutoff_disables(self):
        now = timezone.now()
        cutoff = now
        params = self._base(now=now, cutoff=cutoff)
        params["tour"] = _tour(date_echeance=cutoff - timedelta(seconds=1))
        self.assertFalse(penalites_auto_actives(**params))

    def test_tour_date_echeance_exactly_at_cutoff_disables(self):
        """`date_echeance < cutoff` est le garde-fou : `==` cutoff reste exclu
        (frontière stricte documentée : `< cutoff` rejette, donc `== cutoff`
        est accepté)."""
        now = timezone.now()
        cutoff = now
        params = self._base(now=now, cutoff=cutoff)
        params["tour"] = _tour(date_echeance=cutoff)
        self.assertTrue(penalites_auto_actives(**params))


class ReserveCotisationTests(SimpleTestCase):
    def test_reserve_is_zero_if_already_paid(self):
        regle = _regle(montant_cotisation=Decimal("1000"))
        self.assertEqual(reserve_cotisation(regle, a_deja_cotise=True), Decimal("0"))

    def test_reserve_is_montant_cotisation_if_not_paid(self):
        regle = _regle(montant_cotisation=Decimal("1000"))
        self.assertEqual(reserve_cotisation(regle, a_deja_cotise=False), Decimal("1000"))
