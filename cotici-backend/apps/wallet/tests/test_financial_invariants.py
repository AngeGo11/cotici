"""Tests des invariants financiers critiques du module wallet, au-delà de la
couverture fonctionnelle existante (deposit/withdrawal/idempotency/cinetpay) :

- impossibilité de faire passer deux retraits concurrents qui, ensemble,
  dépasseraient le solde disponible (double-spend), en l'absence de toute
  clé d'idempotence (donc en s'appuyant uniquement sur `select_for_update`) ;
- conservation de la masse monétaire sur les opérations qui ne font que
  déplacer de l'argent entre deux enveloppes (ici : dépôt + retrait sur des
  wallets distincts ne doivent jamais se répercuter sur le solde d'un tiers) ;
- BOLA : un utilisateur ne doit jamais pouvoir lire les transactions d'un
  autre utilisateur via `GET /wallet/transactions/`.

Style aligné sur apps/wallet/tests/test_idempotency.py et
apps/tontine/tests/test_concurrency.py pour la partie vraie concurrence
(TransactionTestCase + threads + connexions DB distinctes)."""

import threading
from decimal import Decimal

from django.db import connections
from django.test import TransactionTestCase
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient, APITestCase

from apps.authn.models import User
from apps.wallet.models import Transaction, Wallet

DEPOSIT_URL = reverse("wallet-deposit")
WITHDRAWAL_URL = reverse("wallet-withdrawal")
TRANSACTIONS_URL = reverse("wallet-transactions")


def _create_user(username: str, phone: str) -> User:
    return User.objects.create_user(
        username=username, password="testpass123", code_pin="1234", numero_telephone=phone
    )


class ConcurrentWithdrawalDoubleSpendRaceTests(TransactionTestCase):
    """Deux retraits réellement simultanés, SANS clé d'idempotence (donc deux
    Transactions RETRAIT distinctes attendues), portant chacun sur un montant
    inférieur au solde mais dont la somme le dépasse. Le `select_for_update()`
    sur le wallet doit sérialiser les deux requêtes : une seule doit réussir,
    l'autre doit être refusée pour solde insuffisant. Le solde final ne doit
    jamais devenir négatif."""

    reset_sequences = False

    def setUp(self):
        self.user = _create_user("race_wd_user", "22507070799")
        Wallet.objects.create(user=self.user, solde_courant=Decimal("6000"))

    def test_only_one_of_two_concurrent_withdrawals_succeeds(self):
        payload = {"montant_a_retirer": 5000, "mode_de_paiement": "ORANGE"}

        results = []
        results_lock = threading.Lock()
        barrier = threading.Barrier(2)

        def _fire():
            client = APIClient()
            client.force_authenticate(user=self.user)
            try:
                barrier.wait(timeout=5)
            except threading.BrokenBarrierError:
                pass
            response = client.post(WITHDRAWAL_URL, payload, format="json")
            with results_lock:
                results.append(response.status_code)
            connections.close_all()

        threads = [threading.Thread(target=_fire) for _ in range(2)]
        for t in threads:
            t.start()
        for t in threads:
            t.join(timeout=10)

        self.assertEqual(len(results), 2)
        # Exactement un 200 (succès) et un 400 (solde insuffisant) : jamais les
        # deux à 200 (double dépense), jamais les deux refusés.
        self.assertEqual(sorted(results), [status.HTTP_200_OK, status.HTTP_400_BAD_REQUEST], results)

        wallet = Wallet.objects.get(user=self.user)
        # Un seul débit de 5000 a pu passer : solde final 1000, jamais négatif.
        self.assertEqual(wallet.solde_courant, Decimal("1000"))
        self.assertGreaterEqual(wallet.solde_courant, Decimal("0"))

        self.assertEqual(
            Transaction.objects.filter(
                wallet=wallet,
                type_transaction=Transaction.TYPE_TRANSACTION.RETRAIT,
                statut_transaction=Transaction.STATUT_TRANSACTION.REUSSIE,
            ).count(),
            1,
        )


class MassConservationTests(APITestCase):
    """La somme des soldes de deux wallets distincts ne doit jamais varier
    autrement que par le montant exact des opérations effectuées sur CHACUN
    d'eux : un dépôt/retrait sur le wallet A ne doit avoir strictement aucun
    effet sur le solde du wallet B (pas de fuite, pas de double comptage)."""

    def setUp(self):
        self.user_a = _create_user("mass_user_a", "22507070710")
        self.user_b = _create_user("mass_user_b", "22507070711")
        Wallet.objects.create(user=self.user_a, solde_courant=Decimal("2000"))
        Wallet.objects.create(user=self.user_b, solde_courant=Decimal("3000"))

    def _total_solde(self) -> Decimal:
        return sum(
            (w.solde_courant for w in Wallet.objects.filter(user__in=[self.user_a, self.user_b])),
            Decimal("0"),
        )

    def test_deposit_on_a_only_increases_total_by_exact_amount_and_leaves_b_untouched(self):
        total_before = self._total_solde()

        client = APIClient()
        client.force_authenticate(user=self.user_a)
        response = client.post(
            DEPOSIT_URL, {"montant_depose": 1500, "mode_de_paiement": "MTN"}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        wallet_b = Wallet.objects.get(user=self.user_b)
        self.assertEqual(wallet_b.solde_courant, Decimal("3000"))

        total_after = self._total_solde()
        self.assertEqual(total_after - total_before, Decimal("1500"))

    def test_withdrawal_on_a_only_decreases_total_by_exact_amount_and_leaves_b_untouched(self):
        total_before = self._total_solde()

        client = APIClient()
        client.force_authenticate(user=self.user_a)
        response = client.post(
            WITHDRAWAL_URL, {"montant_a_retirer": 800, "mode_de_paiement": "WAVE"}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        wallet_b = Wallet.objects.get(user=self.user_b)
        self.assertEqual(wallet_b.solde_courant, Decimal("3000"))

        total_after = self._total_solde()
        self.assertEqual(total_before - total_after, Decimal("800"))


class TransactionListAuthorizationTests(APITestCase):
    """BOLA : `GET /wallet/transactions/` doit être strictement scopé à
    `request.user`, jamais exposer les transactions d'un tiers."""

    def setUp(self):
        self.user = _create_user("tx_list_user", "22507070720")
        self.other = _create_user("tx_list_other", "22507070721")
        self.client.force_authenticate(user=self.user)

    def test_requires_authentication(self):
        self.client.force_authenticate(user=None)
        response = self.client.get(TRANSACTIONS_URL)
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_only_returns_own_transactions(self):
        other_client = APIClient()
        other_client.force_authenticate(user=self.other)
        other_deposit = other_client.post(
            DEPOSIT_URL, {"montant_depose": 4242, "mode_de_paiement": "ORANGE"}, format="json"
        )
        self.assertEqual(other_deposit.status_code, status.HTTP_200_OK)
        other_ref = other_deposit.data["ref_transaction"]

        own_deposit = self.client.post(
            DEPOSIT_URL, {"montant_depose": 1111, "mode_de_paiement": "ORANGE"}, format="json"
        )
        self.assertEqual(own_deposit.status_code, status.HTTP_200_OK)
        own_ref = own_deposit.data["ref_transaction"]

        response = self.client.get(TRANSACTIONS_URL)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        refs = {tx["ref_transaction"] for tx in response.data["results"]}
        self.assertIn(own_ref, refs)
        self.assertNotIn(other_ref, refs)
