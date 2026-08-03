from decimal import Decimal

from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from apps.authn.models import User
from apps.tontine.models import Invitations, Penalite, Tontine, TontineMembre, TontineRegle
from apps.wallet.models import Wallet

CREATE_URL = reverse("tontine-create")
REGLES_URL = reverse("tontine-define-regles")
INVITATIONS_URL = reverse("tontine-send-invitation")
INVITATIONS_PREVIEW_URL = reverse("tontine-preview-invitation")
INVITATIONS_ACCEPT_URL = reverse("tontine-accept-invitation")
INVITATIONS_REFUSE_URL = reverse("tontine-refuse-invitation")
ORDRE_URL = reverse("tontine-set-ordre")
COTISER_URL = reverse("tontine-cotiser")
DEMARRER_URL = reverse("tontine-demarrer")
ATTRIBUE_PENALITE_URL = reverse("tontine-attribute-penalite")
CHANGER_TOUR_URL = reverse("tontine-changer-tour")
ARCHIVE_URL = reverse("tontine-archive")
DELETE_URL = reverse("tontine-delete")
CHAT_SEND_URL = reverse("tontine-chat-send")


def _user(username: str, phone: str) -> User:
    return User.objects.create_user(
        username=username, password="testpass123", code_pin="1234", numero_telephone=phone
    )


def _groupe(host, **kwargs):
    defaults = dict(
        hote=host,
        type_tontine=Tontine.TYPE_TONTINE.GROUPE,
        description="Groupe test",
        qr_code="qr-groupe",
    )
    defaults.update(kwargs)
    tontine = Tontine.objects.create(**defaults)
    TontineMembre.objects.create(
        tontine=tontine,
        membre=host,
        role_membre=TontineMembre.ROLE_MEMBRE.ADMIN,
        statut_membre=TontineMembre.STATUT_MEMBRE.ACTIF,
        ordre_ramassage=1,
    )
    return tontine


class CreateTontineTests(APITestCase):
    def setUp(self):
        self.user = _user("host1", "22507080910")
        self.client.force_authenticate(user=self.user)

    def test_requires_authentication(self):
        self.client.force_authenticate(user=None)
        response = self.client.post(CREATE_URL, {}, format="json")
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_invalid_type(self):
        response = self.client.post(
            CREATE_URL, {"type_tontine": "BIDON", "description": "x"}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data["detail"], "Type de tontine invalide.")
        self.assertIn("GROUPE", response.data["allowed"])

    def test_missing_description(self):
        response = self.client.post(CREATE_URL, {}, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data["detail"], "La description est obligatoire.")

    def test_description_too_long(self):
        response = self.client.post(CREATE_URL, {"description": "x" * 301}, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data["detail"], "Description trop longue (300 caractères max).")

    def test_create_success_defaults_to_groupe(self):
        response = self.client.post(CREATE_URL, {"description": "Ma tontine"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["type_tontine"], Tontine.TYPE_TONTINE.GROUPE)
        tontine = Tontine.objects.get(pk=response.data["id"])
        self.assertEqual(tontine.hote, self.user)
        self.assertTrue(
            TontineMembre.objects.filter(
                tontine=tontine, membre=self.user, role_membre=TontineMembre.ROLE_MEMBRE.ADMIN
            ).exists()
        )


class DefineTontineRegleTests(APITestCase):
    def setUp(self):
        self.host = _user("host2", "22507080911")
        self.client.force_authenticate(user=self.host)
        self.tontine = _groupe(self.host)

    def _payload(self, **overrides):
        payload = {
            "tontine_id": self.tontine.id,
            "montant_cotisation": 10000,
            "nombre_max": 4,
            "ordre_choisie": "aleatoire",
            "frequence": TontineRegle.FREQUENCE_COTISATION.MENSUEL,
        }
        payload.update(overrides)
        return payload

    def test_missing_tontine_id(self):
        payload = self._payload()
        del payload["tontine_id"]
        response = self.client.post(REGLES_URL, payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data["detail"], "tontine_id requis.")

    def test_invalid_montant_cotisation(self):
        response = self.client.post(
            REGLES_URL, self._payload(montant_cotisation="abc"), format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data["detail"], "Montant par participant invalide ou absent.")

    def test_invalid_ordre(self):
        response = self.client.post(
            REGLES_URL, self._payload(ordre_choisie="BIDON"), format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data["detail"], "Mode d'ordre de ramassage invalide.")
        self.assertIn("allowed", response.data)

    def test_invalid_frequence(self):
        response = self.client.post(REGLES_URL, self._payload(frequence="BIDON"), format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data["detail"], "Fréquence invalide.")

    def test_penalite_requires_type(self):
        response = self.client.post(
            REGLES_URL, self._payload(penalite=True, montant_penalite=500), format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data["detail"], "Type de pénalité invalide.")

    def test_define_success(self):
        response = self.client.post(REGLES_URL, self._payload(), format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertTrue(TontineRegle.objects.filter(tontine=self.tontine).exists())

    def test_cannot_redefine(self):
        self.client.post(REGLES_URL, self._payload(), format="json")
        response = self.client.post(REGLES_URL, self._payload(), format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(
            response.data["detail"], "Les règles de cette tontine sont déjà définies."
        )


class SendInvitationTests(APITestCase):
    def setUp(self):
        self.host = _user("host3", "22507080912")
        self.client.force_authenticate(user=self.host)
        self.tontine = _groupe(self.host)

    def test_missing_tontine_id(self):
        response = self.client.post(
            INVITATIONS_URL, {"numero_telephone_invite": "22501020304"}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data["detail"], "tontine_id requis.")

    def test_invalid_phone(self):
        response = self.client.post(
            INVITATIONS_URL,
            {"tontine_id": self.tontine.id, "numero_telephone_invite": "123"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data["detail"], "Numéro de téléphone invalide.")

    def test_send_success(self):
        response = self.client.post(
            INVITATIONS_URL,
            {"tontine_id": self.tontine.id, "numero_telephone_invite": "22501020304"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertTrue(Invitations.objects.filter(tontine=self.tontine).exists())


class InvitationFlowTests(APITestCase):
    def setUp(self):
        self.host = _user("host4", "22507080913")
        self.invitee = _user("invitee4", "22501020305")
        self.tontine = _groupe(self.host)
        self.regle = TontineRegle.objects.create(
            tontine=self.tontine,
            objectif_cotisation=40000,
            montant_cotisation=10000,
            montant_penalite=0,
            nombre_max=4,
            nombre_tours=4,
            ordre_ramassage=TontineRegle.ORDRE_RAMASSAGE.ALEATOIRE,
            frequence=TontineRegle.FREQUENCE_COTISATION.MENSUEL,
        )
        self.invitation = Invitations.objects.create(
            tontine=self.tontine, numero_telephone_invite="22501020305", token="tok123"
        )
        self.client.force_authenticate(user=self.invitee)

    def test_preview_missing_token(self):
        response = self.client.get(INVITATIONS_PREVIEW_URL, {})
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data["detail"], "token requis.")

    def test_preview_success(self):
        response = self.client.get(INVITATIONS_PREVIEW_URL, {"token": "tok123"})
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_accept_missing_token_and_tontine_id(self):
        response = self.client.post(INVITATIONS_ACCEPT_URL, {}, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data["detail"], "token ou tontine_id requis.")

    def test_accept_success_via_token(self):
        response = self.client.post(
            INVITATIONS_ACCEPT_URL,
            {"token": "tok123", "accepte_regles": True},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertTrue(
            TontineMembre.objects.filter(tontine=self.tontine, membre=self.invitee).exists()
        )

    def test_refuse_missing_token(self):
        response = self.client.post(INVITATIONS_REFUSE_URL, {}, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data["detail"], "token requis.")

    def test_refuse_success(self):
        response = self.client.post(INVITATIONS_REFUSE_URL, {"token": "tok123"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.invitation.refresh_from_db()
        self.assertTrue(self.invitation.est_utilisee)


class ChatMessageTests(APITestCase):
    def setUp(self):
        self.host = _user("host5", "22507080914")
        self.client.force_authenticate(user=self.host)
        self.tontine = _groupe(self.host)

    def test_missing_tontine_id(self):
        response = self.client.post(CHAT_SEND_URL, {"contenu": "salut"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data["detail"], "tontine_id requis.")

    def test_empty_contenu(self):
        response = self.client.post(
            CHAT_SEND_URL, {"tontine_id": self.tontine.id, "contenu": "   "}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data["detail"], "Le message ne peut pas être vide.")

    def test_contenu_too_long(self):
        response = self.client.post(
            CHAT_SEND_URL,
            {"tontine_id": self.tontine.id, "contenu": "x" * 256},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data["detail"], "Message trop long (255 caractères max).")

    def test_send_success(self):
        response = self.client.post(
            CHAT_SEND_URL, {"tontine_id": self.tontine.id, "contenu": "salut"}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)


class AttributePenaliteTests(APITestCase):
    def setUp(self):
        self.host = _user("host6", "22507080915")
        self.member = _user("member6", "22501020306")
        self.client.force_authenticate(user=self.host)
        self.tontine = _groupe(self.host)
        TontineMembre.objects.create(
            tontine=self.tontine,
            membre=self.member,
            role_membre=TontineMembre.ROLE_MEMBRE.PARTICIPANT,
            statut_membre=TontineMembre.STATUT_MEMBRE.ACTIF,
            ordre_ramassage=2,
        )
        self.regle = TontineRegle.objects.create(
            tontine=self.tontine,
            objectif_cotisation=40000,
            montant_cotisation=10000,
            montant_penalite=1000,
            nombre_max=2,
            nombre_tours=2,
            ordre_ramassage=TontineRegle.ORDRE_RAMASSAGE.ALEATOIRE,
            frequence=TontineRegle.FREQUENCE_COTISATION.MENSUEL,
        )

    def test_missing_tontine_id(self):
        response = self.client.post(
            ATTRIBUE_PENALITE_URL,
            {"type_penalite": Penalite.TYPE_PENALITE.RETARD_PAIEMENT, "user_id": self.member.id},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data["detail"], "tontine_id requis.")

    def test_invalid_type_penalite(self):
        response = self.client.post(
            ATTRIBUE_PENALITE_URL,
            {
                "tontine_id": self.tontine.id,
                "type_penalite": "BIDON",
                "user_id": self.member.id,
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data["detail"], "Type de pénalité invalide.")
        self.assertIn("allowed", response.data)

    def test_attribute_success(self):
        response = self.client.post(
            ATTRIBUE_PENALITE_URL,
            {
                "tontine_id": self.tontine.id,
                "type_penalite": Penalite.TYPE_PENALITE.RETARD_PAIEMENT,
                "user_id": self.member.id,
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertTrue(Penalite.objects.filter(tontine=self.tontine, user=self.member).exists())


class ChangerTourAndCotiserTests(APITestCase):
    def setUp(self):
        self.host = _user("host7", "22507080916")
        self.client.force_authenticate(user=self.host)
        self.tontine = _groupe(self.host)

    def test_demarrer_missing_tontine_id(self):
        response = self.client.post(DEMARRER_URL, {}, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data["detail"], "tontine_id requis.")

    def test_changer_tour_missing_tontine_id(self):
        response = self.client.post(CHANGER_TOUR_URL, {}, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data["detail"], "tontine_id requis.")

    def test_cotiser_missing_tontine_id(self):
        response = self.client.post(COTISER_URL, {}, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data["detail"], "tontine_id requis.")

    def test_ordre_missing_tontine_id(self):
        response = self.client.post(ORDRE_URL, {}, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data["detail"], "tontine_id requis.")


class ArchiveAndDeleteGroupeTests(APITestCase):
    def setUp(self):
        self.host = _user("host8", "22507080917")
        self.client.force_authenticate(user=self.host)

    def test_archive_invalid_id(self):
        response = self.client.post(ARCHIVE_URL, {"id": "abc"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data["detail"], "Identifiant de tontine invalide.")

    def test_archive_success(self):
        tontine = _groupe(self.host)
        response = self.client.post(ARCHIVE_URL, {"id": tontine.id}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        tontine.refresh_from_db()
        self.assertEqual(tontine.etat, Tontine.ETAT.ARCHIVE)

    def test_delete_invalid_id(self):
        response = self.client.post(DELETE_URL, {"id": "abc"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data["detail"], "Identifiant de tontine invalide.")

    def test_delete_success(self):
        tontine = _groupe(self.host)
        response = self.client.post(DELETE_URL, {"id": tontine.id}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        tontine.refresh_from_db()
        self.assertEqual(tontine.etat, Tontine.ETAT.SUPPRIME)
