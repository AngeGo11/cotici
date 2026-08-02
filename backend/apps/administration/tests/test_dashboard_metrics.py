"""Tableau de bord back-office : `/api/admin/dashboard/stats/` et
`/api/admin/dashboard/series/`.

Points vérifiés :

- le contrat de sortie est complet (toute clé manquante casse l'affichage) ;
- les agrégats ne comptent que ce qu'ils doivent : volume = transactions
  réussies uniquement, "aujourd'hui" = journée locale, comptes staff exclus
  des compteurs utilisateurs, cagnottes non comptées comme tontines ;
- la série renvoie un point par jour, y compris pour les jours vides ;
- l'accès reste refusé hors session staff, et la métrique est validée.
"""
from __future__ import annotations

from datetime import timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from apps.administration.domain.roles import StaffRole
from apps.administration.tests.helpers import create_staff_profile, login_staff_client
from apps.cagnotte.models import Cagnotte
from apps.tontine.models import Tontine
from apps.wallet.models import Transaction, Wallet

User = get_user_model()

STATS_URL = "/api/admin/dashboard/stats/"
SERIES_URL = "/api/admin/dashboard/series/"

EXPECTED_KEYS = {
    "users_total",
    "users_new_today",
    "kyc_pending",
    "wallets_balance_total",
    "transactions_today",
    "transactions_volume_today",
    "transactions_failed_today",
    "tontines_active",
    "cagnottes_active",
    "disputes_open",
}


def _create_user(username: str, phone: str) -> User:
    return User.objects.create_user(
        username=username,
        password="testpass123",
        code_pin="1234",
        numero_telephone=phone,
    )


def _create_transaction(wallet: Wallet, *, montant, statut, when=None) -> Transaction:
    tx = Transaction.objects.create(
        wallet=wallet,
        solde_courant=Decimal(0),
        ref_transaction=f"REF-{Transaction.objects.count() + 1:06d}",
        mode_de_paiement=Transaction.MODE_DE_PAIEMENT.ORANGE,
        montant_transaction=Decimal(montant),
        statut_transaction=statut,
        type_transaction=Transaction.TYPE_TRANSACTION.DEPOT,
    )
    if when is not None:
        # `date_transaction` est en auto_now_add : seul un UPDATE direct permet
        # d'antidater une transaction pour tester la série temporelle.
        Transaction.objects.filter(pk=tx.pk).update(date_transaction=when)
        tx.refresh_from_db()
    return tx


@override_settings(ADMIN_IP_ALLOWLIST="", DEBUG=True, ADMIN_TOTP_REQUIRED=True)
class DashboardStatsTests(TestCase):
    def setUp(self):
        cache.clear()
        self.client = APIClient()
        create_staff_profile(
            username="staff.dashboard",
            numero_telephone="2250700200001",
            password="Un-Mot-De-Passe-Dashboard-1",
            role=StaffRole.SUPPORT,
        )
        login_staff_client(
            self.client,
            username="staff.dashboard",
            password="Un-Mot-De-Passe-Dashboard-1",
        )

        self.user = _create_user("client.dashboard", "2250700200002")
        self.wallet = Wallet.objects.create(user=self.user, solde_courant=Decimal(7000))

    def test_contract_is_complete(self):
        resp = self.client.get(STATS_URL)
        self.assertEqual(resp.status_code, 200, resp.content)
        self.assertEqual(set(resp.data.keys()), EXPECTED_KEYS)

    def test_staff_accounts_excluded_from_user_counters(self):
        """Le compte staff créé en `setUp` ne doit pas apparaître dans
        `users_total` : ce n'est pas un utilisateur de la plateforme."""
        resp = self.client.get(STATS_URL)
        self.assertEqual(resp.data["users_total"], 1)
        self.assertEqual(resp.data["users_new_today"], 1)

    def test_wallets_balance_total_sums_all_wallets(self):
        other = _create_user("client.dashboard.2", "2250700200003")
        Wallet.objects.create(user=other, solde_courant=Decimal(3000))
        resp = self.client.get(STATS_URL)
        self.assertEqual(Decimal(str(resp.data["wallets_balance_total"])), Decimal(10000))

    def test_volume_counts_successful_transactions_only(self):
        _create_transaction(
            self.wallet,
            montant=5000,
            statut=Transaction.STATUT_TRANSACTION.REUSSIE,
        )
        _create_transaction(
            self.wallet,
            montant=9999,
            statut=Transaction.STATUT_TRANSACTION.EN_ATTENTE,
        )
        _create_transaction(
            self.wallet,
            montant=1234,
            statut=Transaction.STATUT_TRANSACTION.ECHOUEE,
        )

        resp = self.client.get(STATS_URL)
        self.assertEqual(resp.data["transactions_today"], 3)
        self.assertEqual(
            Decimal(str(resp.data["transactions_volume_today"])), Decimal(5000)
        )
        self.assertEqual(resp.data["transactions_failed_today"], 1)

    def test_yesterday_transactions_excluded_from_today(self):
        _create_transaction(
            self.wallet,
            montant=5000,
            statut=Transaction.STATUT_TRANSACTION.REUSSIE,
            when=timezone.now() - timedelta(days=1),
        )
        resp = self.client.get(STATS_URL)
        self.assertEqual(resp.data["transactions_today"], 0)
        self.assertEqual(
            Decimal(str(resp.data["transactions_volume_today"])), Decimal(0)
        )

    def test_cagnotte_is_not_counted_as_tontine(self):
        """`Cagnotte` hérite de `Tontine` (héritage multi-table) : sans filtre
        sur `type_tontine`, elle serait comptée deux fois."""
        Tontine.objects.create(
            hote=self.user,
            type_tontine=Tontine.TYPE_TONTINE.GROUPE,
            description="Tontine de groupe",
            qr_code="qr-groupe",
        )
        Cagnotte.objects.create(
            hote=self.user,
            nom_cagnotte="Cagnotte test",
            objectif_cotisation=100000,
            description="Cagnotte",
            qr_code="qr-cagnotte",
        )

        resp = self.client.get(STATS_URL)
        self.assertEqual(resp.data["tontines_active"], 1)
        self.assertEqual(resp.data["cagnottes_active"], 1)

    def test_archived_tontine_is_not_active(self):
        Tontine.objects.create(
            hote=self.user,
            type_tontine=Tontine.TYPE_TONTINE.GROUPE,
            description="Tontine archivée",
            qr_code="qr-archive",
            est_active=False,
            etat=Tontine.ETAT.ARCHIVE,
        )
        resp = self.client.get(STATS_URL)
        self.assertEqual(resp.data["tontines_active"], 0)


@override_settings(ADMIN_IP_ALLOWLIST="", DEBUG=True, ADMIN_TOTP_REQUIRED=True)
class DashboardSeriesTests(TestCase):
    def setUp(self):
        cache.clear()
        self.client = APIClient()
        create_staff_profile(
            username="staff.series",
            numero_telephone="2250700210001",
            password="Un-Mot-De-Passe-Series-1",
            role=StaffRole.AUDITEUR,
        )
        login_staff_client(
            self.client,
            username="staff.series",
            password="Un-Mot-De-Passe-Series-1",
        )
        self.user = _create_user("client.series", "2250700210002")
        self.wallet = Wallet.objects.create(user=self.user, solde_courant=Decimal(0))

    def test_returns_one_point_per_day_including_empty_days(self):
        resp = self.client.get(SERIES_URL, {"metric": "transactions_volume", "days": 7})
        self.assertEqual(resp.status_code, 200, resp.content)
        self.assertEqual(len(resp.data), 7)

        today = timezone.localdate()
        self.assertEqual(resp.data[0]["date"], (today - timedelta(days=6)).isoformat())
        self.assertEqual(resp.data[-1]["date"], today.isoformat())
        self.assertTrue(all(point["value"] == 0 for point in resp.data))

    def test_amount_lands_on_the_right_day(self):
        _create_transaction(
            self.wallet,
            montant=2500,
            statut=Transaction.STATUT_TRANSACTION.REUSSIE,
            when=timezone.now() - timedelta(days=2),
        )
        resp = self.client.get(SERIES_URL, {"metric": "transactions_volume", "days": 5})
        by_date = {point["date"]: point["value"] for point in resp.data}
        target = (timezone.localdate() - timedelta(days=2)).isoformat()
        self.assertEqual(Decimal(str(by_date[target])), Decimal(2500))
        self.assertEqual(
            sum(Decimal(str(v)) for v in by_date.values()), Decimal(2500)
        )

    def test_unknown_metric_is_rejected(self):
        resp = self.client.get(SERIES_URL, {"metric": "totp_secret"})
        self.assertEqual(resp.status_code, 400)

    def test_invalid_days_is_rejected(self):
        resp = self.client.get(SERIES_URL, {"days": "beaucoup"})
        self.assertEqual(resp.status_code, 400)

    def test_defaults_apply_without_query_params(self):
        resp = self.client.get(SERIES_URL)
        self.assertEqual(resp.status_code, 200, resp.content)
        self.assertEqual(len(resp.data), 30)


@override_settings(ADMIN_IP_ALLOWLIST="", DEBUG=True, ADMIN_TOTP_REQUIRED=True)
class DashboardAccessControlTests(TestCase):
    def setUp(self):
        cache.clear()
        self.client = APIClient()

    def test_anonymous_is_denied(self):
        for url in (STATS_URL, SERIES_URL):
            with self.subTest(url=url):
                self.assertEqual(self.client.get(url).status_code, 403)

    def test_authenticated_non_staff_is_denied(self):
        mobile_user = _create_user("mobile.dashboard", "2250700220001")
        self.client.force_login(mobile_user)
        for url in (STATS_URL, SERIES_URL):
            with self.subTest(url=url):
                self.assertEqual(self.client.get(url).status_code, 403)
