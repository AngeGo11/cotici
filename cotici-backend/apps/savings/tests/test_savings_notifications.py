"""Tests des notifications de palier d'épargne (événementielles, anti-oscillation)."""
from decimal import Decimal

from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from apps.authn.models import User
from apps.notifications.models import Notifications
from apps.savings.models import EpargnePersonnelle
from apps.wallet.models import Wallet


def _create_user(username: str, phone: str) -> User:
    return User.objects.create_user(
        username=username, password="testpass123", code_pin="1234", numero_telephone=phone
    )


class SavingsPalierNotificationTests(APITestCase):
    def setUp(self):
        self.user = _create_user("savings_palier_user", "22507300001")
        self.client.force_authenticate(user=self.user)
        self.wallet, _ = Wallet.objects.get_or_create(user=self.user)
        self.wallet.solde_courant = Decimal("100000")
        self.wallet.save(update_fields=["solde_courant"])
        self.epargne = EpargnePersonnelle.objects.create(
            hote=self.user,
            nom_projet="Voyage",
            objectif_cotisation=1000,
            montant_courant=Decimal("0"),
            etat=EpargnePersonnelle.ETAT.ACTIF,
        )

    def _deposit(self, montant: str):
        return self.client.post(
            reverse("savings-deposit"),
            {"id": self.epargne.id, "montant": montant, "mode_de_paiement": "SOLDE_COTICI"},
            format="json",
        )

    def test_deposit_crossing_50_percent_emits_one_notification(self):
        response = self._deposit("600")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(
            Notifications.objects.filter(category="epargne", destinataire=self.user).count(), 1
        )

    def test_deposit_crossing_multiple_paliers_at_once_emits_all(self):
        response = self._deposit("1000")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(
            Notifications.objects.filter(category="epargne", destinataire=self.user).count(), 3
        )

    def test_palier_not_renotified_after_withdrawal_and_redeposit(self):
        """Anti-oscillation : un palier notifié une fois ne l'est jamais deux fois,
        même si le montant redescend (retrait) puis re-franchit le seuil."""
        self._deposit("600")  # franchit 50%
        self.assertEqual(
            Notifications.objects.filter(category="epargne", destinataire=self.user).count(), 1
        )

        # Retrait manuel simulé directement en base (pas de retrait partiel exposé
        # par l'API — seul un retrait total existe) pour redescendre sous 50%.
        self.epargne.refresh_from_db()
        self.epargne.montant_courant = Decimal("100")
        self.epargne.save(update_fields=["montant_courant"])

        response = self._deposit("500")  # re-franchit 50% (100 -> 600 = 60%)
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        # Toujours une seule notification pour le seuil 50 (idempotence dedup_key).
        self.assertEqual(
            Notifications.objects.filter(
                category="epargne", destinataire=self.user, dedup_key__contains="seuil=50"
            ).count(),
            1,
        )

    def test_small_deposit_not_crossing_any_palier_emits_nothing(self):
        response = self._deposit("100")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(
            Notifications.objects.filter(category="epargne", destinataire=self.user).count(), 0
        )
