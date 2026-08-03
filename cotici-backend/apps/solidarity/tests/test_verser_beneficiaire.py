from decimal import Decimal

from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from apps.authn.models import User
from apps.solidarity.models import Solidarity
from apps.tontine.models import Tontine
from apps.wallet.models import Transaction, Wallet

ETAT = Tontine.ETAT


def _create_user(username: str, phone: str) -> User:
    return User.objects.create_user(
        username=username,
        password="testpass123",
        code_pin="1234",
        numero_telephone=phone,
    )


def _verser_url(tontine_id: int) -> str:
    return reverse("solidarity-verser", args=[tontine_id])


class VerserBeneficiaireTests(APITestCase):
    """Couvre l'endpoint POST /<tontine_id>/verser/ (verser_beneficiaire)."""

    def setUp(self):
        self.organizer = _create_user("organizer_v", "22507080950")
        # Bénéficiaire "cible" réel.
        self.beneficiary = _create_user("beneficiary_v", "22501020399")
        # Compte dont le numéro partage les 10 derniers chiffres du bénéficiaire
        # mais diffère par l'indicatif pays -> ne doit JAMAIS être confondu.
        self.similar_phone_user = _create_user("similar_phone_v", "33501020399")
        self.contributor = _create_user("contributor_v", "22509080799")
        self.stranger = _create_user("stranger_v", "22502020202")

        Wallet.objects.create(user=self.contributor, solde_courant=Decimal("10000"))

        self.solidarity = Solidarity.objects.create(
            hote=self.organizer,
            description="Frais médicaux",
            beneficiaire_telephone="22501020399",
            objectif_cotisation=2000,
            objectif_atteint=False,
            qr_code="x",
            etat=ETAT.ACTIF,
        )

    def _cotiser(self, montant):
        self.client.force_authenticate(user=self.contributor)
        url = reverse("solidarity-cotiser")
        response = self.client.post(
            url,
            {"tontine_id": self.solidarity.id, "montant": montant, "mode_de_paiement": "SOLDE_COTICI"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)

    def _atteindre_objectif(self):
        self._cotiser(2000)
        self.solidarity.refresh_from_db()
        self.assertTrue(self.solidarity.objectif_atteint)

    # ------------------------------------------------------------------
    # Cas nominal
    # ------------------------------------------------------------------
    def test_versement_nominal_credite_le_wallet_beneficiaire(self):
        self._atteindre_objectif()
        self.client.force_authenticate(user=self.organizer)

        response = self.client.post(_verser_url(self.solidarity.id), {}, format="json")

        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        self.assertEqual(response.data["montant_verse"], "2000")

        self.solidarity.refresh_from_db()
        self.assertTrue(self.solidarity.versement_effectue)
        self.assertFalse(self.solidarity.est_active)

        benef_wallet = Wallet.objects.get(user=self.beneficiary)
        self.assertEqual(benef_wallet.solde_courant, Decimal("2000"))

        self.assertTrue(
            Transaction.objects.filter(
                wallet=benef_wallet,
                type_transaction=Transaction.TYPE_TRANSACTION.VERSEMENT_SOLIDAIRE,
                montant_transaction=Decimal("2000"),
                statut_transaction=Transaction.STATUT_TRANSACTION.REUSSIE,
            ).exists()
        )

    def test_versement_ne_credite_pas_le_compte_au_numero_similaire(self):
        """La résolution EXACTE ne doit jamais créditer le compte dont seuls
        les 10 derniers chiffres coïncident avec le numéro du bénéficiaire."""
        self._atteindre_objectif()
        self.client.force_authenticate(user=self.organizer)

        response = self.client.post(_verser_url(self.solidarity.id), {}, format="json")

        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        self.assertFalse(Wallet.objects.filter(user=self.similar_phone_user).exists())
        benef_wallet = Wallet.objects.get(user=self.beneficiary)
        self.assertEqual(benef_wallet.solde_courant, Decimal("2000"))

    def test_versement_beneficiaire_introuvable(self):
        """Numéro de bénéficiaire ne correspondant à aucun compte -> erreur explicite,
        pas de résolution approximative."""
        self.solidarity.beneficiaire_telephone = "22500000000"
        self.solidarity.save(update_fields=["beneficiaire_telephone"])
        self._atteindre_objectif()
        self.client.force_authenticate(user=self.organizer)

        response = self.client.post(_verser_url(self.solidarity.id), {}, format="json")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data["detail"], "Le compte du bénéficiaire est introuvable.")

    # ------------------------------------------------------------------
    # Permission : non-organisateur
    # ------------------------------------------------------------------
    def test_non_organisateur_refuse(self):
        self._atteindre_objectif()
        self.client.force_authenticate(user=self.stranger)

        response = self.client.post(_verser_url(self.solidarity.id), {}, format="json")

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(
            response.data["detail"], "Seul l'organisateur peut valider le versement."
        )
        self.solidarity.refresh_from_db()
        self.assertFalse(self.solidarity.versement_effectue)

    def test_contributeur_ne_peut_pas_valider_son_propre_versement(self):
        """Un contributeur (non-admin) ne doit pas pouvoir déclencher le versement,
        même s'il a lui-même permis d'atteindre l'objectif."""
        self._atteindre_objectif()
        self.client.force_authenticate(user=self.contributor)

        response = self.client.post(_verser_url(self.solidarity.id), {}, format="json")

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    # ------------------------------------------------------------------
    # Objectif non atteint
    # ------------------------------------------------------------------
    def test_objectif_non_atteint_rejete(self):
        self._cotiser(500)  # objectif = 2000, non atteint
        self.client.force_authenticate(user=self.organizer)

        response = self.client.post(_verser_url(self.solidarity.id), {}, format="json")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data["detail"], "L'objectif n'est pas encore atteint.")

    # ------------------------------------------------------------------
    # Double versement
    # ------------------------------------------------------------------
    def test_double_versement_rejete_sans_double_credit(self):
        self._atteindre_objectif()
        self.client.force_authenticate(user=self.organizer)

        first = self.client.post(_verser_url(self.solidarity.id), {}, format="json")
        self.assertEqual(first.status_code, status.HTTP_201_CREATED)

        second = self.client.post(_verser_url(self.solidarity.id), {}, format="json")
        self.assertEqual(second.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(second.data["detail"], "Le versement a déjà été effectué.")

        benef_wallet = Wallet.objects.get(user=self.beneficiary)
        self.assertEqual(benef_wallet.solde_courant, Decimal("2000"))
        self.assertEqual(
            Transaction.objects.filter(
                wallet=benef_wallet,
                type_transaction=Transaction.TYPE_TRANSACTION.VERSEMENT_SOLIDAIRE,
            ).count(),
            1,
        )

    def test_solidarity_introuvable(self):
        self.client.force_authenticate(user=self.organizer)
        response = self.client.post(_verser_url(999999), {}, format="json")
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
