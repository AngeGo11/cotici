"""Tests négatifs IDOR / permissions pour l'app solidarity.

Note : `solidarity_preview` est intentionnellement public à tout utilisateur
Cotici authentifié (cf. docstring de la vue) — pas testé en négatif ici.
`verser_beneficiaire` est déjà couvert par test_verser_beneficiaire.py. Ce
fichier couvre le scoping de `list_my_solidarity` et les actions réservées à
l'hôte (`archive_solidarity` / `delete_solidarity`).
"""

from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from apps.authn.models import User
from apps.solidarity.models import Solidarity
from apps.tontine.models import Tontine

ETAT = Tontine.ETAT

MINE_URL = reverse("solidarity-mine")
ARCHIVE_URL = reverse("solidarity-archive")
DELETE_URL = reverse("solidarity-delete")


def _user(username: str, phone: str) -> User:
    return User.objects.create_user(
        username=username, password="testpass123", code_pin="1234", numero_telephone=phone
    )


class SolidarityIdorTests(APITestCase):
    def setUp(self):
        self.owner = _user("solidarity_owner", "22507080990")
        self.attacker = _user("solidarity_attacker", "22509080791")

        self.solidarity = Solidarity.objects.create(
            hote=self.owner,
            description="Aide médicale",
            beneficiaire_telephone="22501020300",
            objectif_cotisation=5000,
            objectif_atteint=False,
            qr_code="x",
            etat=ETAT.ACTIF,
        )

    def test_list_my_solidarity_does_not_leak_other_users_collectes(self):
        self.client.force_authenticate(user=self.attacker)
        response = self.client.get(MINE_URL)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        ids = [item["id"] for item in response.data["results"]]
        self.assertNotIn(self.solidarity.id, ids)

    def test_non_owner_cannot_archive_others_collecte(self):
        self.client.force_authenticate(user=self.attacker)
        response = self.client.post(ARCHIVE_URL, {"id": self.solidarity.id}, format="json")
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.solidarity.refresh_from_db()
        self.assertEqual(self.solidarity.etat, ETAT.ACTIF)

    def test_non_owner_cannot_delete_others_collecte(self):
        self.client.force_authenticate(user=self.attacker)
        response = self.client.post(DELETE_URL, {"id": self.solidarity.id}, format="json")
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.solidarity.refresh_from_db()
        self.assertEqual(self.solidarity.etat, ETAT.ACTIF)
