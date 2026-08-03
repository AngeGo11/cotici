"""Tests de VRAIE concurrence (connexions DB séparées, requêtes qui se
chevauchent réellement) sur le dépôt et le retrait d'épargne personnelle.

Voir apps/tontine/tests/test_concurrency.py pour la justification détaillée du
choix de TransactionTestCase (rollback-par-test de TestCase ne recrée pas un
vrai scénario multi-connexion, indispensable pour exercer select_for_update()).
"""

import threading

from decimal import Decimal

from django.db import connections
from django.test import TransactionTestCase
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient

from apps.authn.models import User
from apps.savings.models import EpargnePersonnelle
from apps.wallet.models import Transaction, Wallet

DEPOSIT_URL = reverse("savings-deposit")
WITHDRAW_URL = reverse("savings-withdraw")

ETAT = EpargnePersonnelle.ETAT


def _user(username: str, phone: str) -> User:
    return User.objects.create_user(
        username=username, password="testpass123", code_pin="1234", numero_telephone=phone
    )


def _fire_concurrently(user, url, payload, n=2):
    """Envoie `n` requêtes réellement simultanées (threads + Barrier, chacun sa
    propre connexion DB/APIClient) et renvoie la liste des status codes."""
    results = []
    results_lock = threading.Lock()
    barrier = threading.Barrier(n)

    def _fire():
        client = APIClient()
        client.force_authenticate(user=user)
        try:
            barrier.wait(timeout=5)
        except threading.BrokenBarrierError:
            pass
        response = client.post(url, payload, format="json")
        with results_lock:
            results.append(response.status_code)
        connections.close_all()

    threads = [threading.Thread(target=_fire) for _ in range(n)]
    for t in threads:
        t.start()
    for t in threads:
        t.join(timeout=10)
    return results


class ConcurrentDepositRaceTests(TransactionTestCase):
    """Deux dépôts simultanés qui, pris ensemble, dépasseraient le reste à
    épargner : un seul doit passer (verrouillage epargne + wallet via
    select_for_update), l'autre doit être rejeté proprement, sans double
    crédit ni double débit."""

    reset_sequences = False

    def setUp(self):
        self.user = _user("race_deposit_user", "22507300201")
        self.goal = EpargnePersonnelle.objects.create(
            hote=self.user,
            nom_projet="Voyage",
            objectif_cotisation=1000,
            montant_courant=Decimal("0"),
            categorie="Voyage",
            duree=6,
            etat=ETAT.ACTIF,
        )
        # Solde suffisant pour un seul dépôt de 700 (reste=1000), pas pour deux
        # (1400 > solde ET > reste) : si la course est mal gérée, on pourrait
        # créditer l'épargne au-delà de l'objectif ou débiter deux fois.
        Wallet.objects.create(user=self.user, solde_courant=Decimal("2000"))

    def test_concurrent_double_deposit_only_one_wins(self):
        payload = {"id": self.goal.id, "montant": 700, "mode_de_paiement": "SOLDE_COTICI"}
        results = _fire_concurrently(self.user, DEPOSIT_URL, payload)

        self.assertEqual(len(results), 2)
        self.assertEqual(
            sorted(results),
            sorted([status.HTTP_200_OK, status.HTTP_400_BAD_REQUEST]),
            f"Attendu un succès et un rejet, obtenu : {results}",
        )

        self.goal.refresh_from_db()
        # Un seul dépôt de 700 doit avoir été appliqué, jamais 1400 (dépasserait
        # l'objectif de 1000) ni un montant partiel incohérent.
        self.assertEqual(self.goal.montant_courant, Decimal("700"))

        wallet = Wallet.objects.get(user=self.user)
        self.assertEqual(wallet.solde_courant, Decimal("1300"))

        deposit_count = Transaction.objects.filter(
            epargne=self.goal,
            type_transaction=Transaction.TYPE_TRANSACTION.VERSEMENT_EPARGNE_PERSONNELLE,
            statut_transaction=Transaction.STATUT_TRANSACTION.REUSSIE,
        ).count()
        self.assertEqual(deposit_count, 1)

        # Invariant de conservation : rien créé, rien détruit.
        self.assertEqual(wallet.solde_courant + self.goal.montant_courant, Decimal("2000"))


class ConcurrentWithdrawRaceTests(TransactionTestCase):
    """Deux retraits simultanés sur le même objectif déjà atteint : un seul doit
    réussir (l'objectif retombe à 0 après le premier, donc le second échoue au
    recontrôle "objectif non atteint" fait sous verrou), aucun double crédit du
    wallet."""

    reset_sequences = False

    def setUp(self):
        self.user = _user("race_withdraw_user", "22507300202")
        self.goal = EpargnePersonnelle.objects.create(
            hote=self.user,
            nom_projet="Voyage",
            objectif_cotisation=1000,
            montant_courant=Decimal("1000"),
            categorie="Voyage",
            duree=6,
            etat=ETAT.ACTIF,
        )
        Wallet.objects.create(user=self.user, solde_courant=Decimal("0"))

    def test_concurrent_double_withdraw_only_one_wins(self):
        payload = {"id": self.goal.id}
        results = _fire_concurrently(self.user, WITHDRAW_URL, payload)

        self.assertEqual(len(results), 2)
        self.assertEqual(
            sorted(results),
            sorted([status.HTTP_200_OK, status.HTTP_400_BAD_REQUEST]),
            f"Attendu un succès et un rejet, obtenu : {results}",
        )

        self.goal.refresh_from_db()
        self.assertEqual(self.goal.montant_courant, Decimal("0"))

        wallet = Wallet.objects.get(user=self.user)
        # Un seul retrait de 1000 doit avoir été crédité, jamais 2000.
        self.assertEqual(wallet.solde_courant, Decimal("1000"))

        withdraw_count = Transaction.objects.filter(
            epargne=self.goal,
            type_transaction=Transaction.TYPE_TRANSACTION.RETRAIT_EPARGNE_PERSONNELLE,
            statut_transaction=Transaction.STATUT_TRANSACTION.REUSSIE,
        ).count()
        self.assertEqual(withdraw_count, 1)
