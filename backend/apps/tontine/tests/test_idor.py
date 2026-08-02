"""Tests négatifs IDOR : un utilisateur qui n'est ni membre actif ni admin
d'une tontine de groupe ne doit pouvoir ni lire son détail, ni lire/écrire
dans son chat. Repose sur `_get_tontine_for_member` (apps/utils/utilitaires.py).
"""

from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from apps.authn.models import User
from apps.tontine.models import Tontine, TontineMembre, Chat

DETAIL_URL = reverse("tontine-detail")
CHAT_LIST_URL = reverse("tontine-chat-list")
CHAT_SEND_URL = reverse("tontine-chat-send")


def _user(username: str, phone: str) -> User:
    return User.objects.create_user(
        username=username, password="testpass123", code_pin="1234", numero_telephone=phone
    )


class TontineIdorTests(APITestCase):
    def setUp(self):
        self.host = _user("idor_host", "22507080995")
        self.member = _user("idor_member", "22509080796")
        self.stranger = _user("idor_stranger", "22502020210")

        self.tontine = Tontine.objects.create(
            hote=self.host,
            type_tontine=Tontine.TYPE_TONTINE.GROUPE,
            description="Groupe privé",
            qr_code="qr-idor",
        )
        TontineMembre.objects.create(
            tontine=self.tontine,
            membre=self.host,
            role_membre=TontineMembre.ROLE_MEMBRE.ADMIN,
            statut_membre=TontineMembre.STATUT_MEMBRE.ACTIF,
            ordre_ramassage=1,
        )
        TontineMembre.objects.create(
            tontine=self.tontine,
            membre=self.member,
            role_membre=TontineMembre.ROLE_MEMBRE.PARTICIPANT,
            statut_membre=TontineMembre.STATUT_MEMBRE.ACTIF,
            ordre_ramassage=2,
        )
        Chat.objects.create(tontine=self.tontine, expediteur=self.host, contenu="Message privé")

        self.client.force_authenticate(user=self.stranger)

    def test_non_member_cannot_read_tontine_detail(self):
        response = self.client.get(DETAIL_URL, {"id": self.tontine.id})
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertNotIn("membres", response.data)

    def test_non_member_cannot_read_chat(self):
        response = self.client.get(CHAT_LIST_URL, {"tontine_id": self.tontine.id})
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_non_member_cannot_post_chat_message(self):
        response = self.client.post(
            CHAT_SEND_URL,
            {"tontine_id": self.tontine.id, "contenu": "Injection"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertFalse(
            Chat.objects.filter(tontine=self.tontine, contenu="Injection").exists()
        )

    def test_member_can_read_detail_and_chat(self):
        """Contrôle positif : un membre actif légitime, lui, a bien accès."""
        self.client.force_authenticate(user=self.member)
        detail_response = self.client.get(DETAIL_URL, {"id": self.tontine.id})
        self.assertEqual(detail_response.status_code, status.HTTP_200_OK)

        chat_response = self.client.get(CHAT_LIST_URL, {"tontine_id": self.tontine.id})
        self.assertEqual(chat_response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(chat_response.data["results"]), 1)
