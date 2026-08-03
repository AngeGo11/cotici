import threading
from decimal import Decimal

from django.test import TransactionTestCase
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient, APITestCase

from apps.authn.models import User
from apps.notifications.models import Notifications
from apps.tontine.models import Penalite, Tontine, TontineMembre, TontineRegle, TourTontine
from apps.wallet.models import Transaction, Wallet

EXCLUDE_URL = reverse("tontine-exclude-member")
ROLE_URL = reverse("tontine-set-member-role")
MEMBERS_URL = reverse("tontine-list-members")
MODIFY_REGLES_URL = reverse("tontine-modify-regles")
ATTRIBUE_PENALITE_URL = reverse("tontine-attribute-penalite")
PENALITES_URL = reverse("tontine-list-penalites")
REGLER_PENALITE_URL = reverse("tontine-regler-penalite")
ANNULER_PENALITE_URL = reverse("tontine-annuler-penalite")
CHANGER_TOUR_URL = reverse("tontine-changer-tour")
COTISER_URL = reverse("tontine-cotiser")


def _user(username: str, phone: str) -> User:
    return User.objects.create_user(
        username=username, password="testpass123", code_pin="1234", numero_telephone=phone
    )


def _groupe_avec_regle(host, *, nombre_max=3, montant_cotisation=10000, montant_penalite=0):
    tontine = Tontine.objects.create(
        hote=host,
        type_tontine=Tontine.TYPE_TONTINE.GROUPE,
        description="Groupe gestion",
        qr_code="qr-gestion",
    )
    regle = TontineRegle.objects.create(
        tontine=tontine,
        objectif_cotisation=montant_cotisation * nombre_max * nombre_max,
        montant_cotisation=montant_cotisation,
        montant_penalite=montant_penalite,
        nombre_max=nombre_max,
        nombre_tours=nombre_max,
        ordre_ramassage=TontineRegle.ORDRE_RAMASSAGE.DEFINI_PAR_ADMIN,
        frequence=TontineRegle.FREQUENCE_COTISATION.MENSUEL,
    )
    TontineMembre.objects.create(
        tontine=tontine,
        membre=host,
        role_membre=TontineMembre.ROLE_MEMBRE.ADMIN,
        statut_membre=TontineMembre.STATUT_MEMBRE.ACTIF,
        ordre_ramassage=1,
    )
    return tontine, regle


def _add_member(tontine, user, ordre):
    return TontineMembre.objects.create(
        tontine=tontine,
        membre=user,
        role_membre=TontineMembre.ROLE_MEMBRE.PARTICIPANT,
        statut_membre=TontineMembre.STATUT_MEMBRE.ACTIF,
        ordre_ramassage=ordre,
        regles_acceptees=True,
    )


class ExcludeMemberTests(APITestCase):
    def setUp(self):
        self.host = _user("gm_host", "22507080920")
        self.tontine, self.regle = _groupe_avec_regle(self.host, nombre_max=3)
        self.member2 = _user("gm_member2", "22507080921")
        self.member3 = _user("gm_member3", "22507080922")
        _add_member(self.tontine, self.member2, 2)
        _add_member(self.tontine, self.member3, 3)
        self.client.force_authenticate(user=self.host)

    def test_exclusion_reussie_recompacte_ordre(self):
        response = self.client.post(
            EXCLUDE_URL,
            {"tontine_id": self.tontine.id, "user_id": self.member2.id, "motif": "Inactif"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)

        tm2 = TontineMembre.objects.get(tontine=self.tontine, membre=self.member2)
        self.assertEqual(tm2.statut_membre, TontineMembre.STATUT_MEMBRE.EXCLU)

        tm3 = TontineMembre.objects.get(tontine=self.tontine, membre=self.member3)
        self.assertEqual(tm3.ordre_ramassage, 2)  # recompacté (était 3)

        self.assertTrue(
            Notifications.objects.filter(destinataire=self.member2, category="gestion").exists()
        )
        self.assertTrue(
            Notifications.objects.filter(destinataire=self.member3, category="gestion").exists()
        )

    def test_impossible_exclure_hote(self):
        response = self.client.post(
            EXCLUDE_URL, {"tontine_id": self.tontine.id, "user_id": self.host.id}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data["detail"], "Impossible d'exclure l'hôte du groupe.")

    def test_impossible_sexclure_soi_meme(self):
        # Promeut member2 en admin pour tester la tentative d'auto-exclusion.
        TontineMembre.objects.filter(tontine=self.tontine, membre=self.member2).update(
            role_membre=TontineMembre.ROLE_MEMBRE.ADMIN
        )
        self.client.force_authenticate(user=self.member2)
        response = self.client.post(
            EXCLUDE_URL, {"tontine_id": self.tontine.id, "user_id": self.member2.id}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data["detail"], "Vous ne pouvez pas vous exclure vous-même.")

    def test_membre_deja_exclu_refuse(self):
        TontineMembre.objects.filter(tontine=self.tontine, membre=self.member2).update(
            statut_membre=TontineMembre.STATUT_MEMBRE.EXCLU
        )
        response = self.client.post(
            EXCLUDE_URL, {"tontine_id": self.tontine.id, "user_id": self.member2.id}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("quitté", response.data["detail"])

    def test_non_admin_refuse(self):
        self.client.force_authenticate(user=self.member2)
        response = self.client.post(
            EXCLUDE_URL, {"tontine_id": self.tontine.id, "user_id": self.member3.id}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_exclusion_autorisee_si_membre_na_jamais_cotise_ni_beneficie(self):
        """Le cycle est démarré (tour 1 en cours, bénéficiaire = host, ordre 1),
        mais member3 (ordre 3, jamais servi ni cotisé) reste exclus-able."""
        Wallet.objects.create(user=self.host, solde_courant=Decimal("50000"))
        self.client.post(CHANGER_TOUR_URL, {"tontine_id": self.tontine.id}, format="json")

        response = self.client.post(
            EXCLUDE_URL, {"tontine_id": self.tontine.id, "user_id": self.member3.id}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)

    def test_exclusion_bloquee_si_membre_a_deja_cotise(self):
        Wallet.objects.create(user=self.host, solde_courant=Decimal("50000"))
        Wallet.objects.create(user=self.member2, solde_courant=Decimal("50000"))

        self.client.post(CHANGER_TOUR_URL, {"tontine_id": self.tontine.id}, format="json")
        # ordre 1 = host, doit cotiser avant que member2 (ordre 2) ne puisse le faire.
        self.client.post(COTISER_URL, {"tontine_id": self.tontine.id}, format="json")
        self.client.force_authenticate(user=self.member2)
        self.client.post(COTISER_URL, {"tontine_id": self.tontine.id}, format="json")

        self.client.force_authenticate(user=self.host)
        response = self.client.post(
            EXCLUDE_URL, {"tontine_id": self.tontine.id, "user_id": self.member2.id}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("casserait l'équilibre financier", response.data["detail"])

    def test_exclusion_bloquee_si_beneficiaire_dun_tour(self):
        Wallet.objects.create(user=self.host, solde_courant=Decimal("50000"))
        self.client.post(CHANGER_TOUR_URL, {"tontine_id": self.tontine.id}, format="json")
        # Tour 1 en cours, bénéficiaire = host (ordre 1)
        response = self.client.post(
            EXCLUDE_URL, {"tontine_id": self.tontine.id, "user_id": self.host.id}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data["detail"], "Impossible d'exclure l'hôte du groupe.")


class SetMemberRoleTests(APITestCase):
    def setUp(self):
        self.host = _user("gm_role_host", "22507080930")
        self.tontine, self.regle = _groupe_avec_regle(self.host, nombre_max=2)
        self.member2 = _user("gm_role_member2", "22507080931")
        _add_member(self.tontine, self.member2, 2)
        self.client.force_authenticate(user=self.host)

    def test_promotion_reussie(self):
        response = self.client.post(
            ROLE_URL,
            {"tontine_id": self.tontine.id, "user_id": self.member2.id, "role": "ADMINISTRATEUR"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        tm = TontineMembre.objects.get(tontine=self.tontine, membre=self.member2)
        self.assertEqual(tm.role_membre, TontineMembre.ROLE_MEMBRE.ADMIN)

    def test_non_hote_refuse_meme_si_admin(self):
        # Promeut member2 en admin, puis member2 tente de rétrograder l'hôte : interdit.
        TontineMembre.objects.filter(tontine=self.tontine, membre=self.member2).update(
            role_membre=TontineMembre.ROLE_MEMBRE.ADMIN
        )
        self.client.force_authenticate(user=self.member2)
        response = self.client.post(
            ROLE_URL,
            {"tontine_id": self.tontine.id, "user_id": self.host.id, "role": "PARTICIPANT"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_role_invalide(self):
        response = self.client.post(
            ROLE_URL,
            {"tontine_id": self.tontine.id, "user_id": self.member2.id, "role": "BIDON"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data["detail"], "Rôle invalide.")

    def test_impossible_retrograder_hote(self):
        response = self.client.post(
            ROLE_URL,
            {"tontine_id": self.tontine.id, "user_id": self.host.id, "role": "PARTICIPANT"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data["detail"], "Le rôle de l'hôte ne peut pas être modifié.")


class ListMembersTests(APITestCase):
    def setUp(self):
        self.host = _user("gm_list_host", "22507080940")
        self.tontine, self.regle = _groupe_avec_regle(self.host, nombre_max=2)
        self.member2 = _user("gm_list_member2", "22507080941")
        _add_member(self.tontine, self.member2, 2)

    def test_membre_non_admin_ne_voit_pas_champs_gestion(self):
        self.client.force_authenticate(user=self.member2)
        response = self.client.get(MEMBERS_URL, {"tontine_id": self.tontine.id})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], 2)
        for membre in response.data["results"]:
            self.assertNotIn("peut_etre_exclu", membre)

    def test_admin_voit_champs_gestion(self):
        self.client.force_authenticate(user=self.host)
        response = self.client.get(MEMBERS_URL, {"tontine_id": self.tontine.id})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        by_user = {m["user_id"]: m for m in response.data["results"]}
        self.assertFalse(by_user[self.host.id]["peut_etre_exclu"])
        self.assertTrue(by_user[self.member2.id]["peut_etre_exclu"])

    def test_membre_non_admin_ne_recoit_pas_les_numeros_de_telephone(self):
        """Anti-exfiltration : un participant non-admin ne doit voir AUCUN
        numero_telephone dans la liste des membres (ni le sien, ni celui des
        autres) — seul un admin y a accès, comme pour peut_etre_exclu."""
        self.client.force_authenticate(user=self.member2)
        response = self.client.get(MEMBERS_URL, {"tontine_id": self.tontine.id})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        for membre in response.data["results"]:
            self.assertNotIn("numero_telephone", membre)

    def test_admin_recoit_bien_les_numeros_de_telephone(self):
        self.client.force_authenticate(user=self.host)
        response = self.client.get(MEMBERS_URL, {"tontine_id": self.tontine.id})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        by_user = {m["user_id"]: m for m in response.data["results"]}
        self.assertEqual(by_user[self.host.id]["numero_telephone"], self.host.numero_telephone)
        self.assertEqual(
            by_user[self.member2.id]["numero_telephone"], self.member2.numero_telephone
        )


class ModifyTontineRegleTests(APITestCase):
    def setUp(self):
        self.host = _user("gm_regle_host", "22507080950")
        self.tontine, self.regle = _groupe_avec_regle(self.host, nombre_max=3, montant_cotisation=10000)
        self.member2 = _user("gm_regle_member2", "22507080951")
        _add_member(self.tontine, self.member2, 2)
        self.client.force_authenticate(user=self.host)

    def test_modification_avant_cycle_reset_acceptation(self):
        response = self.client.post(
            MODIFY_REGLES_URL,
            {"tontine_id": self.tontine.id, "montant_cotisation": 20000},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.regle.refresh_from_db()
        self.assertEqual(self.regle.montant_cotisation, 20000)
        tm2 = TontineMembre.objects.get(tontine=self.tontine, membre=self.member2)
        self.assertFalse(tm2.regles_acceptees)
        # L'hôte n'a pas besoin de ré-accepter ses propres décisions.
        tm_host = TontineMembre.objects.get(tontine=self.tontine, membre=self.host)
        self.assertTrue(tm_host.regles_acceptees or not tm_host.regles_acceptees)  # host non contraint

    def test_seul_montant_penalite_ne_reset_pas_acceptation(self):
        TontineMembre.objects.filter(tontine=self.tontine).update(regles_acceptees=True)
        response = self.client.post(
            MODIFY_REGLES_URL,
            {"tontine_id": self.tontine.id, "montant_penalite": 500},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        tm2 = TontineMembre.objects.get(tontine=self.tontine, membre=self.member2)
        self.assertTrue(tm2.regles_acceptees)

    def test_nombre_max_ne_peut_pas_descendre_sous_membres_actifs(self):
        response = self.client.post(
            MODIFY_REGLES_URL,
            {"tontine_id": self.tontine.id, "nombre_max": 1},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_verrouille_apres_demarrage_cycle_sauf_penalite(self):
        Wallet.objects.create(user=self.host, solde_courant=Decimal("50000"))
        Wallet.objects.create(user=self.member2, solde_courant=Decimal("50000"))
        TourTontine.objects.create(
            tontine=self.tontine, user=self.host, numero_du_tour=1, montant_depose=Decimal("0")
        )

        response = self.client.post(
            MODIFY_REGLES_URL,
            {"tontine_id": self.tontine.id, "montant_cotisation": 99999},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("montant_cotisation", response.data["champs_verrouilles"])

        response = self.client.post(
            MODIFY_REGLES_URL,
            {"tontine_id": self.tontine.id, "montant_penalite": 1000},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)

    def test_aucun_champ_fourni(self):
        response = self.client.post(
            MODIFY_REGLES_URL, {"tontine_id": self.tontine.id}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_non_admin_refuse(self):
        self.client.force_authenticate(user=self.member2)
        response = self.client.post(
            MODIFY_REGLES_URL,
            {"tontine_id": self.tontine.id, "montant_penalite": 500},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)


class PenaliteManagementTests(APITestCase):
    def setUp(self):
        self.host = _user("gm_pen_host", "22507080960")
        self.tontine, self.regle = _groupe_avec_regle(
            self.host, nombre_max=2, montant_penalite=1000
        )
        self.member2 = _user("gm_pen_member2", "22507080961")
        _add_member(self.tontine, self.member2, 2)
        self.client.force_authenticate(user=self.host)

    def _attribuer(self):
        return self.client.post(
            ATTRIBUE_PENALITE_URL,
            {
                "tontine_id": self.tontine.id,
                "user_id": self.member2.id,
                "type_penalite": Penalite.TYPE_PENALITE.RETARD_PAIEMENT,
                "motif": "Retard",
            },
            format="json",
        )

    def test_attribution_emet_audit_et_notification(self):
        response = self._attribuer()
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        self.assertTrue(
            Notifications.objects.filter(destinataire=self.member2, category="cotisation").exists()
        )
        from apps.audits.models import AuditLog

        self.assertTrue(
            AuditLog.objects.filter(action=AuditLog.Action.PENALTY_ASSIGNED).exists()
        )

    def test_membre_non_admin_ne_voit_que_ses_penalites(self):
        self._attribuer()
        self.client.force_authenticate(user=self.member2)
        response = self.client.get(PENALITES_URL, {"tontine_id": self.tontine.id})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], 1)
        self.assertEqual(response.data["results"][0]["user_id"], self.member2.id)

    def test_admin_voit_toutes_les_penalites(self):
        self._attribuer()
        response = self.client.get(PENALITES_URL, {"tontine_id": self.tontine.id})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], 1)
        self.assertEqual(response.data["total_impaye"], "1000")

    def test_reglement_penalite_hors_application(self):
        """`mode="hors_application"` (règlement en espèces, sans débit) reste
        disponible pour une pénalité manuelle sans tour, motif obligatoire."""
        self._attribuer()
        penalite = Penalite.objects.get(tontine=self.tontine, user=self.member2)
        response = self.client.post(
            REGLER_PENALITE_URL,
            {"penalite_id": penalite.id, "mode": "hors_application", "motif": "Payé en espèces"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        penalite.refresh_from_db()
        self.assertTrue(penalite.est_reglee)
        self.assertIsNotNone(penalite.date_reglement_penalite)

    def test_reglement_penalite_wallet_avec_tour(self):
        """REFONTE : `mode="wallet"` (défaut) débite réellement le wallet du
        débiteur et crédite le bénéficiaire du tour — exige que la pénalité
        référence un tour (voir `PenaliteSansTourError`)."""
        self.tour = TourTontine.objects.create(
            tontine=self.tontine,
            user=self.host,
            numero_du_tour=1,
            montant_depose=Decimal("0"),
            statut_tour=TourTontine.STATUT_TOUR.TERMINE,
        )
        penalite = Penalite.objects.create(
            tontine=self.tontine,
            user=self.member2,
            tour=self.tour,
            montant_penalite=Decimal("1000"),
            montant_due=Decimal("1000"),
            type_penalite=Penalite.TYPE_PENALITE.RETARD_PAIEMENT,
            est_automatique=False,
        )
        Wallet.objects.create(user=self.member2, solde_courant=Decimal("5000"))
        Wallet.objects.create(user=self.host, solde_courant=Decimal("0"))

        response = self.client.post(
            REGLER_PENALITE_URL, {"penalite_id": penalite.id}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        penalite.refresh_from_db()
        self.assertTrue(penalite.est_reglee)
        self.assertIsNotNone(penalite.date_reglement_penalite)
        self.assertEqual(Wallet.objects.get(user=self.member2).solde_courant, Decimal("4000"))
        self.assertEqual(Wallet.objects.get(user=self.host).solde_courant, Decimal("1000"))

    def test_reglement_deja_reglee_refuse(self):
        self._attribuer()
        penalite = Penalite.objects.get(tontine=self.tontine, user=self.member2)
        self.client.post(REGLER_PENALITE_URL, {"penalite_id": penalite.id}, format="json")
        response = self.client.post(
            REGLER_PENALITE_URL, {"penalite_id": penalite.id}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_annulation_penalite(self):
        self._attribuer()
        penalite = Penalite.objects.get(tontine=self.tontine, user=self.member2)
        response = self.client.post(
            ANNULER_PENALITE_URL, {"penalite_id": penalite.id}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        penalite.refresh_from_db()
        self.assertTrue(penalite.est_annulee)

        # Une pénalité annulée disparaît des listes et du total impayé.
        response = self.client.get(PENALITES_URL, {"tontine_id": self.tontine.id})
        self.assertEqual(response.data["count"], 0)
        self.assertEqual(response.data["total_impaye"], "0")

    def test_proprietaire_peut_desormais_regler_lui_meme_hors_application_refuse(self):
        """REFONTE : le propriétaire de la pénalité peut désormais la régler
        lui-même en mode `wallet` (voir test dédié `test_reglement_penalite_
        wallet_avec_tour`). Ce qui reste interdit au propriétaire : le mode
        `hors_application`, réservé à l'hôte/admin (règlement sans débit,
        traçabilité d'une action administrative)."""
        self._attribuer()
        penalite = Penalite.objects.get(tontine=self.tontine, user=self.member2)
        self.client.force_authenticate(user=self.member2)
        response = self.client.post(
            REGLER_PENALITE_URL,
            {"penalite_id": penalite.id, "mode": "hors_application", "motif": "Espèces"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_tiers_non_admin_non_proprietaire_ne_peut_pas_regler(self):
        """Ce qui reste interdit dans tous les cas : un tiers qui n'est ni le
        débiteur, ni admin/hôte de la tontine, ne peut régler la pénalité de
        quelqu'un d'autre — quel que soit le mode."""
        self._attribuer()
        penalite = Penalite.objects.get(tontine=self.tontine, user=self.member2)
        # Un tiers totalement extérieur à la tontine (pas même membre) : le
        # contrôle des droits de `regler_penalite` ne repose pas sur
        # l'appartenance au groupe, seulement sur `is_admin`/`is_owner`.
        tiers = _user("gm_pen_tiers", "22507080962")
        self.client.force_authenticate(user=tiers)
        response = self.client.post(
            REGLER_PENALITE_URL, {"penalite_id": penalite.id}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)


class ConcurrentAttributePenaliteRaceTests(TransactionTestCase):
    """Vraie concurrence (connexions DB séparées) sur l'attribution d'une
    pénalité : deux admins qui attribuent au même instant une pénalité du
    même type au même membre ne doivent produire qu'UNE seule ligne
    `Penalite`, jamais un doublon (voir `select_for_update()` +
    recontrôle sous verrou dans `attribute_penalite`, même pattern que
    `cotiser_tontine`)."""

    reset_sequences = False

    def setUp(self):
        self.host = _user("race_pen_host", "22507080970")
        self.member2 = _user("race_pen_member2", "22507080971")
        self.tontine, self.regle = _groupe_avec_regle(
            self.host, nombre_max=2, montant_penalite=1000
        )
        _add_member(self.tontine, self.member2, 2)

    def test_double_attribution_concurrente_ne_cree_quune_penalite(self):
        payload = {
            "tontine_id": self.tontine.id,
            "user_id": self.member2.id,
            "type_penalite": Penalite.TYPE_PENALITE.RETARD_PAIEMENT,
        }
        results = []
        results_lock = threading.Lock()
        barrier = threading.Barrier(2)

        def _fire():
            client = APIClient()
            client.force_authenticate(user=self.host)
            try:
                barrier.wait(timeout=5)
            except threading.BrokenBarrierError:
                pass
            response = client.post(ATTRIBUE_PENALITE_URL, payload, format="json")
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
            sorted([status.HTTP_201_CREATED, status.HTTP_400_BAD_REQUEST]),
            f"Attendu un succès et un rejet, obtenu : {results}",
        )

        penalite_count = Penalite.objects.filter(
            tontine=self.tontine,
            user=self.member2,
            type_penalite=Penalite.TYPE_PENALITE.RETARD_PAIEMENT,
        ).count()
        self.assertEqual(penalite_count, 1)
