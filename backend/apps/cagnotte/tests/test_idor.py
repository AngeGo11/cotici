"""Tests négatifs IDOR / permissions pour l'app cagnotte.

Note : `cagnotte_preview` est *intentionnellement* public à tout utilisateur
Cotici authentifié (cf. docstring de la vue) : ce n'est donc pas un cas d'IDOR
et n'est pas testé ici en négatif. En revanche `list_my_cagnotte` (scoping par
hôte) et `recuperation_collecte` (action réservée à l'organisateur) doivent
être prouvés étanches.
"""

from decimal import Decimal

from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from apps.authn.models import User
from apps.cagnotte.models import Cagnotte
from apps.tontine.models import Tontine, TontineMembre
from apps.wallet.models import Wallet

MINE_URL = reverse("cagnotte-mine")


def _user(username: str, phone: str) -> User:
    return User.objects.create_user(
        username=username, password="testpass123", code_pin="1234", numero_telephone=phone
    )


def _verser_url(tontine_id: int) -> str:
    return reverse("cagnotte-recuperation", args=[tontine_id])


class CagnotteIdorTests(APITestCase):
    def setUp(self):
        self.owner = _user("cagnotte_owner", "22507080980")
        self.attacker = _user("cagnotte_attacker", "22509080781")

        self.cagnotte = Cagnotte.objects.create(
            hote=self.owner,
            nom_cagnotte="22500011122",
            description="Cagnotte perso",
            objectif_cotisation=5000,
            objectif_atteint=True,
            qr_code="x",
        )
        TontineMembre.objects.create(
            tontine=self.cagnotte,
            membre=self.owner,
            role_membre=TontineMembre.ROLE_MEMBRE.ADMIN,
            statut_membre=TontineMembre.STATUT_MEMBRE.ACTIF,
            ordre_ramassage=1,
        )

    def test_list_my_cagnotte_does_not_leak_other_users_cagnottes(self):
        self.client.force_authenticate(user=self.attacker)
        response = self.client.get(MINE_URL)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        ids = [item["id"] for item in response.data["results"]]
        self.assertNotIn(self.cagnotte.id, ids)

    def test_non_organizer_cannot_trigger_recuperation(self):
        """Un non-organisateur ne doit pas pouvoir déclencher la récupération
        (et donc se faire créditer) de la cagnotte d'un autre utilisateur."""
        self.client.force_authenticate(user=self.attacker)
        response = self.client.post(_verser_url(self.cagnotte.id), {}, format="json")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

        self.cagnotte.refresh_from_db()
        self.assertFalse(self.cagnotte.recuperation_effectue)
        self.assertFalse(Wallet.objects.filter(user=self.attacker).exists())
