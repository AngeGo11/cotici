"""Edge cases financiers du module savings, complémentaires à
test_savings_endpoints.py et test_idor.py :

- montants/durées nuls ou négatifs à la création,
- montants nuls/négatifs au dépôt,
- conservation de la monnaie (rien n'est créé ni détruit) sur dépôt/retrait,
- frontières exactes de l'objectif (atteint pile, jamais dépassé),
- garde-fou division par zéro si `objectif_cotisation` est 0 (défense en
  profondeur : la création via l'API l'interdit déjà, mais un enregistrement
  peut exister via un autre chemin, ex. migration/admin/fixture).
"""
from decimal import Decimal

from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from apps.authn.models import User
from apps.savings.models import EpargnePersonnelle
from apps.wallet.models import Transaction, Wallet

CREATE_URL = reverse("savings-create")
DEPOSIT_URL = reverse("savings-deposit")
WITHDRAW_URL = reverse("savings-withdraw")

ETAT = EpargnePersonnelle.ETAT


def _create_user(username: str, phone: str) -> User:
    return User.objects.create_user(
        username=username, password="testpass123", code_pin="1234", numero_telephone=phone
    )


class CreateSavingsAmountEdgeCasesTests(APITestCase):
    """La création passe par SavingsPayloadSerializer -> _parse_positive_int, qui
    rejette déjà 0/négatif/non numérique. On verrouille ce comportement ici pour
    ne jamais régresser silencieusement sur un invariant aussi critique."""

    def setUp(self):
        self.user = _create_user("edge_create_user", "22507300101")
        self.client.force_authenticate(user=self.user)

    def test_montant_cible_zero_rejected(self):
        response = self.client.post(
            CREATE_URL,
            {"nom_projet": "Voyage", "montant_cible": 0, "duree": 6, "categorie": "Voyage"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data["detail"], "Entrez le montant cible.")
        self.assertEqual(EpargnePersonnelle.objects.filter(hote=self.user).count(), 0)

    def test_montant_cible_negative_rejected(self):
        response = self.client.post(
            CREATE_URL,
            {"nom_projet": "Voyage", "montant_cible": -5000, "duree": 6, "categorie": "Voyage"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data["detail"], "Entrez le montant cible.")
        self.assertEqual(EpargnePersonnelle.objects.filter(hote=self.user).count(), 0)

    def test_duree_negative_rejected(self):
        response = self.client.post(
            CREATE_URL,
            {"nom_projet": "Voyage", "montant_cible": 1000, "duree": -1, "categorie": "Voyage"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data["detail"], "Veuillez préciser la durée.")
        self.assertEqual(EpargnePersonnelle.objects.filter(hote=self.user).count(), 0)


class SavingsGoalTestMixin:
    def _create_goal(self, **kwargs):
        defaults = dict(
            hote=self.user,
            nom_projet="Voyage",
            objectif_cotisation=5000,
            montant_courant=Decimal("0"),
            categorie="Voyage",
            duree=12,
            etat=ETAT.ACTIF,
        )
        defaults.update(kwargs)
        return EpargnePersonnelle.objects.create(**defaults)


class DepositAmountEdgeCasesTests(SavingsGoalTestMixin, APITestCase):
    def setUp(self):
        self.user = _create_user("edge_deposit_user", "22507300102")
        self.client.force_authenticate(user=self.user)
        self.goal = self._create_goal(objectif_cotisation=5000)
        self.wallet = Wallet.objects.create(user=self.user, solde_courant=Decimal("10000"))

    def test_deposit_montant_zero_rejected(self):
        response = self.client.post(DEPOSIT_URL, {"id": self.goal.id, "montant": 0}, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data["detail"], "Montant invalide.")
        self.goal.refresh_from_db()
        self.assertEqual(self.goal.montant_courant, Decimal("0"))
        self.wallet.refresh_from_db()
        self.assertEqual(self.wallet.solde_courant, Decimal("10000"))

    def test_deposit_montant_negative_rejected(self):
        response = self.client.post(
            DEPOSIT_URL, {"id": self.goal.id, "montant": -1000}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data["detail"], "Montant invalide.")
        self.goal.refresh_from_db()
        self.assertEqual(self.goal.montant_courant, Decimal("0"))
        self.wallet.refresh_from_db()
        self.assertEqual(self.wallet.solde_courant, Decimal("10000"))

    def test_deposit_missing_montant_rejected(self):
        response = self.client.post(DEPOSIT_URL, {"id": self.goal.id}, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data["detail"], "Montant invalide.")

    def test_deposit_into_archived_goal_rejected(self):
        """Le filtre etat=ACTIF de la vue doit exclure les objectifs archivés :
        on ne peut pas verser sur un objectif clos."""
        self.goal.etat = ETAT.ARCHIVE
        self.goal.save(update_fields=["etat"])
        response = self.client.post(DEPOSIT_URL, {"id": self.goal.id, "montant": 100}, format="json")
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.wallet.refresh_from_db()
        self.assertEqual(self.wallet.solde_courant, Decimal("10000"))


class MoneyConservationTests(SavingsGoalTestMixin, APITestCase):
    """Invariant financier central : la somme (solde_wallet + montant_courant de
    l'épargne) ne doit jamais changer sur un dépôt ou un retrait -- la monnaie ne
    fait que se déplacer d'une poche à l'autre, jamais créée ni détruite."""

    def setUp(self):
        self.user = _create_user("edge_conservation_user", "22507300103")
        self.client.force_authenticate(user=self.user)
        self.goal = self._create_goal(objectif_cotisation=5000)
        self.wallet = Wallet.objects.create(user=self.user, solde_courant=Decimal("10000"))

    def _total(self):
        self.wallet.refresh_from_db()
        self.goal.refresh_from_db()
        return self.wallet.solde_courant + self.goal.montant_courant

    def test_deposit_conserves_total_money(self):
        total_before = self._total()
        response = self.client.post(
            DEPOSIT_URL,
            {"id": self.goal.id, "montant": 2000, "mode_de_paiement": "ORANGE"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        total_after = self._total()
        self.assertEqual(total_before, total_after)
        self.assertEqual(self.wallet.solde_courant, Decimal("8000"))
        self.assertEqual(self.goal.montant_courant, Decimal("2000"))

        # Une seule transaction, montant exactement débité == montant crédité.
        tx = Transaction.objects.get(epargne=self.goal)
        self.assertEqual(tx.montant_transaction, Decimal("2000"))
        self.assertEqual(
            tx.type_transaction, Transaction.TYPE_TRANSACTION.VERSEMENT_EPARGNE_PERSONNELLE
        )

    def test_withdraw_conserves_total_money(self):
        self.goal.montant_courant = Decimal("5000")
        self.goal.save(update_fields=["montant_courant"])
        total_before = self._total()

        response = self.client.post(WITHDRAW_URL, {"id": self.goal.id}, format="json")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        total_after = self._total()
        self.assertEqual(total_before, total_after)
        self.assertEqual(self.wallet.solde_courant, Decimal("15000"))
        self.assertEqual(self.goal.montant_courant, Decimal("0"))

    def test_cannot_withdraw_more_than_saved_amount(self):
        """Défense en profondeur : même si l'objectif est atteint, le retrait ne
        transfère jamais plus que `montant_courant` réellement épargné."""
        self.goal.montant_courant = Decimal("5000")
        self.goal.save(update_fields=["montant_courant"])
        response = self.client.post(WITHDRAW_URL, {"id": self.goal.id}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["montant_retire"], "5000")
        # Un second retrait immédiat doit être refusé (plus rien à retirer /
        # objectif retombé sous le seuil car montant_courant est maintenant 0).
        second = self.client.post(WITHDRAW_URL, {"id": self.goal.id}, format="json")
        self.assertEqual(second.status_code, status.HTTP_400_BAD_REQUEST)
        self.wallet.refresh_from_db()
        self.assertEqual(self.wallet.solde_courant, Decimal("15000"))


class ObjectifBoundaryTests(SavingsGoalTestMixin, APITestCase):
    """Progression / atteinte de l'objectif aux bornes exactes."""

    def setUp(self):
        self.user = _create_user("edge_boundary_user", "22507300104")
        self.client.force_authenticate(user=self.user)
        self.goal = self._create_goal(objectif_cotisation=1000)
        self.wallet = Wallet.objects.create(user=self.user, solde_courant=Decimal("10000"))

    def test_deposit_exactly_reaching_objectif_flags_atteint_and_blocks_overshoot(self):
        response = self.client.post(DEPOSIT_URL, {"id": self.goal.id, "montant": 999}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.goal.refresh_from_db()
        self.assertFalse(self.goal.objectif_atteint)

        # Un dépôt qui dépasserait l'objectif (999 + 2 > 1000) est refusé, pas
        # tronqué : l'utilisateur ne peut jamais épargner plus que la cible.
        overshoot = self.client.post(DEPOSIT_URL, {"id": self.goal.id, "montant": 2}, format="json")
        self.assertEqual(overshoot.status_code, status.HTTP_400_BAD_REQUEST)

        exact = self.client.post(DEPOSIT_URL, {"id": self.goal.id, "montant": 1}, format="json")
        self.assertEqual(exact.status_code, status.HTTP_200_OK)
        self.goal.refresh_from_db()
        self.assertEqual(self.goal.montant_courant, Decimal("1000"))
        self.assertTrue(self.goal.objectif_atteint)

    def test_deposit_zero_objectif_goal_cannot_crash_or_overfund(self):
        """Défense en profondeur : un objectif à 0 (créé hors API, ex. donnée
        historique/migration) ne doit ni planter (division par zéro dans le
        calcul de palier) ni permettre un dépôt (reste à épargner = 0)."""
        zero_goal = self._create_goal(nom_projet="Legacy", objectif_cotisation=0)
        response = self.client.post(
            DEPOSIT_URL, {"id": zero_goal.id, "montant": 100}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(
            response.data["detail"], "Le montant ne peut pas dépasser le reste à épargner."
        )
        zero_goal.refresh_from_db()
        self.assertEqual(zero_goal.montant_courant, Decimal("0"))
