from decimal import Decimal

from django.core.exceptions import ValidationError
from django.test import TestCase

from apps.authn.models import User
from apps.savings.models import EpargnePersonnelle
from apps.tontine.models import Tontine, TourTontine
from apps.wallet.models import Transaction, Wallet


def _user(username: str) -> User:
    return User.objects.create_user(
        username=username,
        password="testpass123",
        code_pin="1234",
        numero_telephone="+22501000000",
    )


class TransactionCleanTests(TestCase):
    def setUp(self):
        self.user = _user("alice")
        self.wallet = Wallet.objects.create(user=self.user, solde_courant=Decimal("10000"))
        self.epargne = EpargnePersonnelle.objects.create(
            hote=self.user,
            nom_projet="Vacances",
            objectif_cotisation=500_000,
            montant_courant=Decimal("0"),
        )
        self.tontine = Tontine.objects.create(
            hote=self.user,
            type_tontine=Tontine.TYPE_TONTINE.GROUPE,
            description="Test",
            qr_code="qr-test",
        )
        self.tour = TourTontine.objects.create(
            tontine=self.tontine,
            user=self.user,
            montant_depose=Decimal("5000"),
            numero_du_tour=1,
        )

    def _base_tx(self, **kwargs):
        defaults = {
            "wallet": self.wallet,
            "solde_courant": Decimal("10000"),
            "ref_transaction": "REF-001",
            "mode_de_paiement": Transaction.MODE_DE_PAIEMENT.ORANGE,
            "montant_transaction": Decimal("1000"),
            "type_transaction": Transaction.TYPE_TRANSACTION.DEPOT,
            "tontine": None,
            "epargne": None,
            "tour": None,
        }
        defaults.update(kwargs)
        return Transaction(**defaults)

    def test_depot_sans_contexte_ok(self):
        tx = self._base_tx(type_transaction=Transaction.TYPE_TRANSACTION.DEPOT)
        tx.full_clean()
        tx.save()

    def test_versement_epargne_ok(self):
        tx = self._base_tx(
            type_transaction=Transaction.TYPE_TRANSACTION.VERSEMENT_EPARGNE_PERSONNELLE,
            epargne=self.epargne,
        )
        tx.full_clean()
        tx.save()

    def test_versement_epargne_refuse_si_tontine(self):
        tx = self._base_tx(
            type_transaction=Transaction.TYPE_TRANSACTION.VERSEMENT_EPARGNE_PERSONNELLE,
            epargne=self.epargne,
            tontine=self.tontine,
        )
        with self.assertRaises(ValidationError):
            tx.full_clean()

    def test_versement_epargne_refuse_si_autre_utilisateur(self):
        autre = _user("bob")
        wallet_bob = Wallet.objects.create(user=autre, solde_courant=Decimal("5000"))
        tx = self._base_tx(
            wallet=wallet_bob,
            type_transaction=Transaction.TYPE_TRANSACTION.VERSEMENT_EPARGNE_PERSONNELLE,
            epargne=self.epargne,
        )
        with self.assertRaises(ValidationError):
            tx.full_clean()

    def test_debit_ok_avec_tontine_et_tour(self):
        tx = self._base_tx(
            type_transaction=Transaction.TYPE_TRANSACTION.DEBIT,
            tontine=self.tontine,
            tour=self.tour,
        )
        tx.full_clean()
        tx.save()

    def test_debit_refuse_sans_tour(self):
        tx = self._base_tx(
            type_transaction=Transaction.TYPE_TRANSACTION.DEBIT,
            tontine=self.tontine,
            tour=None,
        )
        with self.assertRaises(ValidationError):
            tx.full_clean()

    def test_tour_sans_tontine_refuse(self):
        tx = self._base_tx(
            type_transaction=Transaction.TYPE_TRANSACTION.DEBIT,
            tontine=None,
            tour=self.tour,
        )
        with self.assertRaises(ValidationError):
            tx.full_clean()

    def test_tour_hors_tontine_refuse(self):
        other = Tontine.objects.create(
            hote=self.user,
            type_tontine=Tontine.TYPE_TONTINE.GROUPE,
            description="Autre",
            qr_code="qr-2",
        )
        tx = self._base_tx(
            type_transaction=Transaction.TYPE_TRANSACTION.DEBIT,
            tontine=other,
            tour=self.tour,
        )
        with self.assertRaises(ValidationError):
            tx.full_clean()

    def test_save_appelle_validation(self):
        tx = self._base_tx(
            type_transaction=Transaction.TYPE_TRANSACTION.DEBIT,
            tontine=self.tontine,
            tour=None,
        )
        with self.assertRaises(ValidationError):
            tx.save()
