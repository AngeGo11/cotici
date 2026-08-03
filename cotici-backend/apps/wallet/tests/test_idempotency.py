"""Tests de non-régression pour l'idempotence des opérations financières
(deposit/withdrawal) via une clé cliente optionnelle (idempotency_key).

Style aligné sur apps/tontine/tests/test_concurrency.py pour le test de vraie
concurrence (TransactionTestCase + threading + connexions DB distinctes)."""

import threading
import uuid
from decimal import Decimal

from django.test import TransactionTestCase
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient, APITestCase

from apps.authn.models import User
from apps.wallet.models import Transaction, Wallet

DEPOSIT_URL = reverse("wallet-deposit")
WITHDRAWAL_URL = reverse("wallet-withdrawal")


def _create_user(username: str, phone: str) -> User:
    return User.objects.create_user(
        username=username, password="testpass123", code_pin="1234", numero_telephone=phone
    )


class DepositIdempotencyTests(APITestCase):
    def setUp(self):
        self.user = _create_user("dep_idem_user", "22507070701")
        self.client.force_authenticate(user=self.user)

    def test_retry_with_same_key_does_not_double_credit(self):
        key = str(uuid.uuid4())
        payload = {"montant_depose": 5000, "mode_de_paiement": "ORANGE", "idempotency_key": key}

        first = self.client.post(DEPOSIT_URL, payload, format="json")
        self.assertEqual(first.status_code, status.HTTP_200_OK)
        self.assertEqual(first.data["nouveau_solde"], "5000")

        second = self.client.post(DEPOSIT_URL, payload, format="json")
        self.assertEqual(second.status_code, status.HTTP_200_OK)
        self.assertTrue(second.data.get("idempotent_replay"))
        # Réponse identique à la première (même ref, même montant, même solde).
        self.assertEqual(second.data["ref_transaction"], first.data["ref_transaction"])
        self.assertEqual(second.data["nouveau_solde"], "5000")

        wallet = Wallet.objects.get(user=self.user)
        self.assertEqual(wallet.solde_courant, Decimal("5000"))
        self.assertEqual(
            Transaction.objects.filter(wallet=wallet, client_ref=key).count(), 1
        )

    def test_without_key_behaves_as_before(self):
        payload = {"montant_depose": 1000, "mode_de_paiement": "ORANGE"}
        first = self.client.post(DEPOSIT_URL, payload, format="json")
        second = self.client.post(DEPOSIT_URL, payload, format="json")
        self.assertEqual(first.status_code, status.HTTP_200_OK)
        self.assertEqual(second.status_code, status.HTTP_200_OK)

        wallet = Wallet.objects.get(user=self.user)
        self.assertEqual(wallet.solde_courant, Decimal("2000"))
        self.assertEqual(Transaction.objects.filter(wallet=wallet).count(), 2)

    def test_same_key_reused_for_different_amount_returns_original_transaction(self):
        """Une clé rejouée doit toujours renvoyer l'opération d'origine, même si
        le client renvoie (par erreur ou bug) un montant différent : on ne doit
        jamais recréditer un montant différent pour une clé déjà consommée."""
        key = str(uuid.uuid4())
        first = self.client.post(
            DEPOSIT_URL,
            {"montant_depose": 3000, "mode_de_paiement": "ORANGE", "idempotency_key": key},
            format="json",
        )
        self.assertEqual(first.status_code, status.HTTP_200_OK)

        second = self.client.post(
            DEPOSIT_URL,
            {"montant_depose": 9999, "mode_de_paiement": "ORANGE", "idempotency_key": key},
            format="json",
        )
        self.assertEqual(second.status_code, status.HTTP_200_OK)
        self.assertEqual(second.data["montant_depot"], "3000")

        wallet = Wallet.objects.get(user=self.user)
        self.assertEqual(wallet.solde_courant, Decimal("3000"))


class WithdrawalIdempotencyTests(APITestCase):
    def setUp(self):
        self.user = _create_user("wd_idem_user", "22507070702")
        self.client.force_authenticate(user=self.user)
        Wallet.objects.create(user=self.user, solde_courant=Decimal("10000"))

    def test_retry_with_same_key_does_not_double_debit(self):
        key = str(uuid.uuid4())
        payload = {"montant_a_retirer": 4000, "mode_de_paiement": "ORANGE", "idempotency_key": key}

        first = self.client.post(WITHDRAWAL_URL, payload, format="json")
        self.assertEqual(first.status_code, status.HTTP_200_OK)
        self.assertEqual(first.data["nouveau_solde"], "6000")

        second = self.client.post(WITHDRAWAL_URL, payload, format="json")
        self.assertEqual(second.status_code, status.HTTP_200_OK)
        self.assertTrue(second.data.get("idempotent_replay"))
        self.assertEqual(second.data["ref_transaction"], first.data["ref_transaction"])
        self.assertEqual(second.data["nouveau_solde"], "6000")

        wallet = Wallet.objects.get(user=self.user)
        self.assertEqual(wallet.solde_courant, Decimal("6000"))
        self.assertEqual(
            Transaction.objects.filter(wallet=wallet, client_ref=key).count(), 1
        )


class ConcurrentDepositIdempotencyRaceTests(TransactionTestCase):
    """Deux requêtes de dépôt réellement simultanées, portant la même clé
    d'idempotence : une seule doit écrire une Transaction, l'autre doit
    rejouer la réponse existante sans recréditer le wallet."""

    reset_sequences = False

    def setUp(self):
        self.user = _create_user("race_dep_user", "22507070703")

    def test_concurrent_same_key_only_one_write(self):
        key = str(uuid.uuid4())
        payload = {"montant_depose": 5000, "mode_de_paiement": "ORANGE", "idempotency_key": key}

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
            response = client.post(DEPOSIT_URL, payload, format="json")
            with results_lock:
                results.append(response.status_code)
            from django.db import connections

            connections.close_all()

        threads = [threading.Thread(target=_fire) for _ in range(2)]
        for t in threads:
            t.start()
        for t in threads:
            t.join(timeout=10)

        self.assertEqual(len(results), 2)
        self.assertTrue(all(code == status.HTTP_200_OK for code in results), results)

        wallet = Wallet.objects.get(user=self.user)
        # Un seul crédit de 5000, pas 10000.
        self.assertEqual(wallet.solde_courant, Decimal("5000"))
        self.assertEqual(
            Transaction.objects.filter(wallet=wallet, client_ref=key).count(), 1
        )
