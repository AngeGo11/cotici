"""Tests de non-régression pour l'idempotence de la cotisation libre à une
collecte solidaire (idempotency_key optionnelle)."""

import threading
import uuid
from decimal import Decimal

from django.test import TransactionTestCase
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient, APITestCase

from apps.authn.models import User
from apps.solidarity.models import Solidarity
from apps.tontine.models import Tontine
from apps.wallet.models import Transaction, Wallet

COTISER_URL = reverse("solidarity-cotiser")
ETAT = Tontine.ETAT


def _create_user(username: str, phone: str) -> User:
    return User.objects.create_user(
        username=username, password="testpass123", code_pin="1234", numero_telephone=phone
    )


class CotiserSolidarityIdempotencyTests(APITestCase):
    def setUp(self):
        self.organizer = _create_user("solidarity_organizer_idem", "22507080920")
        self.beneficiary = _create_user("solidarity_beneficiary_idem", "22501020321")
        self.contributor = _create_user("solidarity_contributor_idem", "22509080721")
        self.client.force_authenticate(user=self.contributor)
        Wallet.objects.create(user=self.contributor, solde_courant=Decimal("10000"))

        self.solidarity = Solidarity.objects.create(
            hote=self.organizer,
            description="Aide idempotence",
            beneficiaire_telephone="22501020321",
            objectif_cotisation=50000,
            objectif_atteint=False,
            qr_code="x",
            etat=ETAT.ACTIF,
        )

    def test_retry_with_same_key_does_not_double_contribute(self):
        key = str(uuid.uuid4())
        payload = {
            "tontine_id": self.solidarity.id,
            "montant": 2000,
            "mode_de_paiement": "ORANGE",
            "idempotency_key": key,
        }

        first = self.client.post(COTISER_URL, payload, format="json")
        self.assertEqual(first.status_code, status.HTTP_201_CREATED)

        second = self.client.post(COTISER_URL, payload, format="json")
        self.assertEqual(second.status_code, status.HTTP_200_OK)
        self.assertTrue(second.data.get("idempotent_replay"))
        self.assertEqual(second.data["ref_transaction"], first.data["ref_transaction"])

        wallet = Wallet.objects.get(user=self.contributor)
        self.assertEqual(wallet.solde_courant, Decimal("8000"))
        self.assertEqual(
            Transaction.objects.filter(wallet=wallet, client_ref=key).count(), 1
        )


class ConcurrentCotiserSolidarityIdempotencyRaceTests(TransactionTestCase):
    """Deux requêtes de cotisation solidaire réellement simultanées, portant
    la même clé d'idempotence : une seule doit débiter le wallet et créer la
    Transaction, l'autre doit rejouer la réponse existante."""

    reset_sequences = False

    def setUp(self):
        self.organizer = _create_user("solidarity_race_organizer", "22507080921")
        self.beneficiary = _create_user("solidarity_race_beneficiary", "22501020322")
        self.contributor = _create_user("solidarity_race_contributor", "22509080722")
        Wallet.objects.create(user=self.contributor, solde_courant=Decimal("10000"))
        self.solidarity = Solidarity.objects.create(
            hote=self.organizer,
            description="Aide course concurrente",
            beneficiaire_telephone="22501020322",
            objectif_cotisation=50000,
            objectif_atteint=False,
            qr_code="x",
            etat=ETAT.ACTIF,
        )

    def test_concurrent_same_key_only_one_write(self):
        key = str(uuid.uuid4())
        payload = {
            "tontine_id": self.solidarity.id,
            "montant": 5000,
            "mode_de_paiement": "ORANGE",
            "idempotency_key": key,
        }

        results = []
        results_lock = threading.Lock()
        barrier = threading.Barrier(2)

        def _fire():
            client = APIClient()
            client.force_authenticate(user=self.contributor)
            try:
                barrier.wait(timeout=5)
            except threading.BrokenBarrierError:
                pass
            response = client.post(COTISER_URL, payload, format="json")
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
        self.assertEqual(
            sorted(results),
            sorted([status.HTTP_201_CREATED, status.HTTP_200_OK]),
            f"Attendu un succès (création) et un rejeu (200), obtenu : {results}",
        )

        wallet = Wallet.objects.get(user=self.contributor)
        # Un seul débit de 5000, pas 10000.
        self.assertEqual(wallet.solde_courant, Decimal("5000"))
        self.assertEqual(
            Transaction.objects.filter(wallet=wallet, client_ref=key).count(), 1
        )
