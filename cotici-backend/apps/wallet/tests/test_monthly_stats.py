from datetime import timedelta
from decimal import Decimal

from django.test import TestCase
from django.utils import timezone

from apps.authn.models import User
from apps.tontine.models import Tontine, TourTontine
from apps.wallet.models import Transaction, Wallet
from apps.wallet.services.monthly_stats import get_monthly_entrees_sorties
from apps.wallet.services.user_payload import build_user_wallet_payload


def _user(username: str) -> User:
    return User.objects.create_user(
        username=username,
        password="testpass123",
        code_pin="1234",
        numero_telephone="22507000001",
    )


class MonthlyStatsTests(TestCase):
    def setUp(self):
        self.user = _user("stats_user")
        self.wallet = Wallet.objects.create(user=self.user, solde_courant=Decimal("0"))
        self.tontine = Tontine.objects.create(
            hote=self.user,
            type_tontine=Tontine.TYPE_TONTINE.GROUPE,
            description="Stats",
            qr_code="qr-stats",
        )
        self.tour = TourTontine.objects.create(
            tontine=self.tontine,
            user=self.user,
            montant_depose=Decimal("2000"),
            numero_du_tour=1,
        )

    def _tx(self, **kwargs):
        defaults = {
            "wallet": self.wallet,
            "solde_courant": Decimal("0"),
            "ref_transaction": "REF-STATS-01",
            "mode_de_paiement": Transaction.MODE_DE_PAIEMENT.ORANGE,
            "montant_transaction": Decimal("1000"),
            "statut_transaction": Transaction.STATUT_TRANSACTION.REUSSIE,
            "type_transaction": Transaction.TYPE_TRANSACTION.DEPOT,
        }
        defaults.update(kwargs)
        return Transaction.objects.create(**defaults)

    def test_entrees_sorties_current_month_only(self):
        self._tx(
            ref_transaction="D1",
            type_transaction=Transaction.TYPE_TRANSACTION.DEPOT,
            montant_transaction=Decimal("10000"),
        )
        self._tx(
            ref_transaction="R1",
            type_transaction=Transaction.TYPE_TRANSACTION.RETRAIT,
            montant_transaction=Decimal("3000"),
        )
        self._tx(
            ref_transaction="B1",
            type_transaction=Transaction.TYPE_TRANSACTION.DEBIT,
            montant_transaction=Decimal("2000"),
            tontine=self.tontine,
            tour=self.tour,
        )
        old_tx = self._tx(
            ref_transaction="D-old",
            type_transaction=Transaction.TYPE_TRANSACTION.DEPOT,
            montant_transaction=Decimal("50000"),
        )
        Transaction.objects.filter(pk=old_tx.pk).update(
            date_transaction=timezone.now() - timedelta(days=40),
        )

        entrees, sorties = get_monthly_entrees_sorties(self.user)
        self.assertEqual(entrees, Decimal("10000"))
        self.assertEqual(sorties, Decimal("5000"))

    def test_pending_transactions_excluded(self):
        self._tx(
            ref_transaction="D-pending",
            statut_transaction=Transaction.STATUT_TRANSACTION.EN_ATTENTE,
            montant_transaction=Decimal("9000"),
        )
        entrees, sorties = get_monthly_entrees_sorties(self.user)
        self.assertEqual(entrees, Decimal("0"))
        self.assertEqual(sorties, Decimal("0"))

    def test_user_payload_includes_monthly_fields(self):
        self._tx(ref_transaction="D2", montant_transaction=Decimal("7500"))
        payload = build_user_wallet_payload(self.user)
        self.assertEqual(payload["entrees_ce_mois"], Decimal("7500"))
        self.assertEqual(payload["sorties_ce_mois"], Decimal("0"))
        self.assertIn("solde_courant", payload)
