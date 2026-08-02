"""Tests négatifs IDOR (Insecure Direct Object Reference) : un utilisateur B ne
doit jamais pouvoir lire/modifier/agir sur l'épargne d'un utilisateur A, même en
devinant/énumérant son id. Style calqué sur
apps/wallet/tests/test_deposit.py::test_deposit_does_not_affect_other_user_wallet.
"""

from decimal import Decimal

from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from apps.authn.models import User
from apps.savings.models import EpargnePersonnelle
from apps.wallet.models import Wallet

DETAIL_URL = reverse("savings-detail")
UPDATE_URL = reverse("savings-update")
DEPOSIT_URL = reverse("savings-deposit")
WITHDRAW_URL = reverse("savings-withdraw")
ARCHIVE_URL = reverse("savings-archive")
DELETE_URL = reverse("savings-delete")
TRANSACTIONS_URL = reverse("savings-transactions")

ETAT = EpargnePersonnelle.ETAT


def _user(username: str, phone: str) -> User:
    return User.objects.create_user(
        username=username, password="testpass123", code_pin="1234", numero_telephone=phone
    )


class SavingsIdorTests(APITestCase):
    def setUp(self):
        self.owner = _user("savings_owner", "22507080970")
        self.attacker = _user("savings_attacker", "22509080771")

        self.goal = EpargnePersonnelle.objects.create(
            hote=self.owner,
            nom_projet="Voyage",
            objectif_cotisation=100000,
            montant_courant=Decimal("50000"),
            categorie="Voyage",
            duree=6,
            etat=ETAT.ACTIF,
        )
        Wallet.objects.create(user=self.attacker, solde_courant=Decimal("100000"))
        self.client.force_authenticate(user=self.attacker)

    def test_detail_of_other_user_goal_is_not_leaked(self):
        response = self.client.get(DETAIL_URL, {"id": self.goal.id})
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertNotIn("nom_projet", response.data)

    def test_transactions_of_other_user_goal_are_not_leaked(self):
        response = self.client.get(TRANSACTIONS_URL, {"id": self.goal.id})
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_cannot_deposit_into_other_user_goal(self):
        response = self.client.post(
            DEPOSIT_URL,
            {"id": self.goal.id, "montant": 1000, "mode_de_paiement": "ORANGE"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.goal.refresh_from_db()
        self.assertEqual(self.goal.montant_courant, Decimal("50000"))
        # Le solde de l'attaquant ne doit pas non plus être débité.
        self.assertEqual(
            Wallet.objects.get(user=self.attacker).solde_courant, Decimal("100000")
        )

    def test_cannot_update_other_user_goal(self):
        response = self.client.patch(
            UPDATE_URL,
            {
                "id": self.goal.id,
                "nom_projet": "Détourné",
                "montant_cible": 1,
                "duree": 1,
                "categorie": "Autre",
                "value_categorie": "x",
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.goal.refresh_from_db()
        self.assertEqual(self.goal.nom_projet, "Voyage")

    def test_cannot_withdraw_from_other_user_goal(self):
        self.goal.montant_courant = Decimal("100000")
        self.goal.save(update_fields=["montant_courant"])
        response = self.client.post(WITHDRAW_URL, {"id": self.goal.id}, format="json")
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(
            Wallet.objects.get(user=self.attacker).solde_courant, Decimal("100000")
        )

    def test_cannot_archive_other_user_goal(self):
        self.goal.montant_courant = Decimal("0")
        self.goal.save(update_fields=["montant_courant"])
        response = self.client.post(ARCHIVE_URL, {"id": self.goal.id}, format="json")
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.goal.refresh_from_db()
        self.assertEqual(self.goal.etat, ETAT.ACTIF)

    def test_cannot_delete_other_user_goal(self):
        self.goal.montant_courant = Decimal("0")
        self.goal.save(update_fields=["montant_courant"])
        response = self.client.post(DELETE_URL, {"id": self.goal.id}, format="json")
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.goal.refresh_from_db()
        self.assertEqual(self.goal.etat, ETAT.ACTIF)
