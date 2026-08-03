"""Tests API (DRF `APITestCase`) pour `regler_penalite`, `annuler_penalite`,
`list_my_penalites` — autorisations, garde-fous de solde, anti-IDOR/BOLA,
et absence de N+1 dans `serialize_member` (via `tontine-detail`).
"""
from datetime import timedelta
from decimal import Decimal

from django.test import override_settings
from django.test.utils import CaptureQueriesContext
from django.db import connection
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from apps.authn.models import User
from apps.tontine.models import Penalite, Tontine, TontineMembre, TontineRegle, TourTontine
from apps.wallet.models import Wallet

REGLER_PENALITE_URL = reverse("tontine-regler-penalite")
ANNULER_PENALITE_URL = reverse("tontine-annuler-penalite")
MES_PENALITES_URL = reverse("tontine-list-my-penalites")
TONTINE_DETAIL_URL = reverse("tontine-detail")


def _user(suffix: str) -> User:
    return User.objects.create_user(
        username=f"pen_api_{suffix}",
        password="testpass123",
        code_pin="1234",
        numero_telephone=f"22507500{suffix}",
    )


def _tontine_avec_regle(host, *, nombre_max=2, montant_cotisation=Decimal("1000")):
    tontine = Tontine.objects.create(
        hote=host,
        type_tontine=Tontine.TYPE_TONTINE.GROUPE,
        description="Tontine API pénalités",
        qr_code="qr-pen-api",
    )
    regle = TontineRegle.objects.create(
        tontine=tontine,
        objectif_cotisation=montant_cotisation * nombre_max * nombre_max,
        montant_cotisation=montant_cotisation,
        montant_penalite=Decimal("500"),
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


class ReglerPenaliteApiTests(APITestCase):
    def setUp(self):
        self.host = _user("host")
        self.member2 = _user("mem2")
        self.tontine, self.regle = _tontine_avec_regle(self.host)
        _add_member(self.tontine, self.member2, 2)
        self.tour = TourTontine.objects.create(
            tontine=self.tontine,
            user=self.host,
            numero_du_tour=1,
            montant_depose=Decimal("0"),
            statut_tour=TourTontine.STATUT_TOUR.TERMINE,
        )
        self.penalite = Penalite.objects.create(
            tontine=self.tontine,
            user=self.member2,
            tour=self.tour,
            montant_penalite=Decimal("500"),
            montant_due=Decimal("500"),
            type_penalite=Penalite.TYPE_PENALITE.RETARD_PAIEMENT,
            est_automatique=True,
        )

    def test_solde_insuffisant_retourne_400_avec_solde_et_montant_due(self):
        Wallet.objects.create(user=self.member2, solde_courant=Decimal("100"))
        Wallet.objects.create(user=self.host, solde_courant=Decimal("0"))
        self.client.force_authenticate(user=self.member2)
        response = self.client.post(
            REGLER_PENALITE_URL, {"penalite_id": self.penalite.id}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data["solde"], "100")
        self.assertEqual(response.data["montant_due"], "500")

    def test_admin_qui_regle_pour_autrui_ne_voit_pas_son_propre_solde_bouger(self):
        """`regler_penalite` en mode wallet débite TOUJOURS le débiteur, jamais
        l'acteur (admin), même quand l'admin agit pour un tiers."""
        Wallet.objects.create(user=self.member2, solde_courant=Decimal("2000"))
        host_wallet = Wallet.objects.create(user=self.host, solde_courant=Decimal("10000"))
        self.client.force_authenticate(user=self.host)
        response = self.client.post(
            REGLER_PENALITE_URL, {"penalite_id": self.penalite.id}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)

        member2_wallet = Wallet.objects.get(user=self.member2)
        host_wallet.refresh_from_db()
        self.assertEqual(member2_wallet.solde_courant, Decimal("1500"))
        # host est aussi bénéficiaire du tour ici -> crédité du montant reçu,
        # jamais débité en tant qu'acteur.
        self.assertEqual(host_wallet.solde_courant, Decimal("10500"))

    def test_proprietaire_peut_regler_sa_propre_penalite_en_mode_wallet(self):
        Wallet.objects.create(user=self.member2, solde_courant=Decimal("2000"))
        Wallet.objects.create(user=self.host, solde_courant=Decimal("0"))
        self.client.force_authenticate(user=self.member2)
        response = self.client.post(
            REGLER_PENALITE_URL, {"penalite_id": self.penalite.id}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)

    def test_hors_application_reserve_admin_hote(self):
        self.client.force_authenticate(user=self.member2)
        response = self.client.post(
            REGLER_PENALITE_URL,
            {"penalite_id": self.penalite.id, "mode": "hors_application", "motif": "Espèces"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_hors_application_exige_motif(self):
        self.client.force_authenticate(user=self.host)
        response = self.client.post(
            REGLER_PENALITE_URL,
            {"penalite_id": self.penalite.id, "mode": "hors_application"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_hors_application_ne_debite_rien(self):
        Wallet.objects.create(user=self.member2, solde_courant=Decimal("2000"))
        self.client.force_authenticate(user=self.host)
        response = self.client.post(
            REGLER_PENALITE_URL,
            {"penalite_id": self.penalite.id, "mode": "hors_application", "motif": "Espèces"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(Wallet.objects.get(user=self.member2).solde_courant, Decimal("2000"))

    def test_tiers_non_admin_non_proprietaire_refuse(self):
        tiers = _user("tiers")
        self.client.force_authenticate(user=tiers)
        response = self.client.post(
            REGLER_PENALITE_URL, {"penalite_id": self.penalite.id}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_penalite_introuvable_404(self):
        self.client.force_authenticate(user=self.host)
        response = self.client.post(REGLER_PENALITE_URL, {"penalite_id": 999999}, format="json")
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_penalite_deja_annulee_refuse(self):
        self.penalite.est_annulee = True
        self.penalite.save(update_fields=["est_annulee"])
        Wallet.objects.create(user=self.member2, solde_courant=Decimal("2000"))
        self.client.force_authenticate(user=self.member2)
        response = self.client.post(
            REGLER_PENALITE_URL, {"penalite_id": self.penalite.id}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_sans_tour_mode_wallet_refuse_explicitement(self):
        penalite_sans_tour = Penalite.objects.create(
            tontine=self.tontine,
            user=self.member2,
            tour=None,
            montant_penalite=Decimal("500"),
            montant_due=Decimal("500"),
            type_penalite=Penalite.TYPE_PENALITE.RETARD_PAIEMENT,
            est_automatique=False,
        )
        Wallet.objects.create(user=self.member2, solde_courant=Decimal("2000"))
        self.client.force_authenticate(user=self.member2)
        response = self.client.post(
            REGLER_PENALITE_URL, {"penalite_id": penalite_sans_tour.id}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)


class AnnulerPenaliteApiTests(APITestCase):
    def setUp(self):
        self.host = _user("host2")
        self.member2 = _user("mem2c")
        self.tontine, self.regle = _tontine_avec_regle(self.host)
        _add_member(self.tontine, self.member2, 2)
        self.tour = TourTontine.objects.create(
            tontine=self.tontine,
            user=self.host,
            numero_du_tour=1,
            montant_depose=Decimal("0"),
            statut_tour=TourTontine.STATUT_TOUR.TERMINE,
        )

    def test_annulation_apres_reglement_declenche_remboursement(self):
        penalite = Penalite.objects.create(
            tontine=self.tontine,
            user=self.member2,
            tour=self.tour,
            montant_penalite=Decimal("500"),
            montant_due=Decimal("0"),
            type_penalite=Penalite.TYPE_PENALITE.RETARD_PAIEMENT,
            est_automatique=True,
            est_reglee=True,
        )
        Wallet.objects.create(user=self.member2, solde_courant=Decimal("1500"))
        Wallet.objects.create(user=self.host, solde_courant=Decimal("500"))
        self.client.force_authenticate(user=self.host)
        response = self.client.post(
            ANNULER_PENALITE_URL, {"penalite_id": penalite.id, "motif": "Erreur"}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(Wallet.objects.get(user=self.member2).solde_courant, Decimal("2000"))
        self.assertEqual(Wallet.objects.get(user=self.host).solde_courant, Decimal("0"))

    def test_remboursement_insolvable_retourne_400_et_aucun_mouvement_partiel(self):
        penalite = Penalite.objects.create(
            tontine=self.tontine,
            user=self.member2,
            tour=self.tour,
            montant_penalite=Decimal("500"),
            montant_due=Decimal("0"),
            type_penalite=Penalite.TYPE_PENALITE.RETARD_PAIEMENT,
            est_automatique=True,
            est_reglee=True,
        )
        Wallet.objects.create(user=self.member2, solde_courant=Decimal("1500"))
        # Le bénéficiaire (host) a déjà retiré les fonds reçus.
        Wallet.objects.create(user=self.host, solde_courant=Decimal("50"))
        self.client.force_authenticate(user=self.host)
        response = self.client.post(
            ANNULER_PENALITE_URL, {"penalite_id": penalite.id, "motif": "Erreur"}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("solde_beneficiaire", response.data)
        self.assertIn("montant_manquant", response.data)
        # Rollback complet : aucun wallet n'a bougé.
        self.assertEqual(Wallet.objects.get(user=self.member2).solde_courant, Decimal("1500"))
        self.assertEqual(Wallet.objects.get(user=self.host).solde_courant, Decimal("50"))
        penalite.refresh_from_db()
        self.assertTrue(penalite.est_reglee)
        self.assertFalse(penalite.est_annulee)

    def test_non_admin_ne_peut_pas_annuler(self):
        penalite = Penalite.objects.create(
            tontine=self.tontine,
            user=self.member2,
            tour=self.tour,
            montant_penalite=Decimal("500"),
            montant_due=Decimal("500"),
            type_penalite=Penalite.TYPE_PENALITE.RETARD_PAIEMENT,
            est_automatique=False,
        )
        self.client.force_authenticate(user=self.member2)
        response = self.client.post(
            ANNULER_PENALITE_URL, {"penalite_id": penalite.id}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_annulation_simple_sans_reglement_prealable(self):
        penalite = Penalite.objects.create(
            tontine=self.tontine,
            user=self.member2,
            tour=self.tour,
            montant_penalite=Decimal("500"),
            montant_due=Decimal("500"),
            type_penalite=Penalite.TYPE_PENALITE.RETARD_PAIEMENT,
            est_automatique=False,
        )
        self.client.force_authenticate(user=self.host)
        response = self.client.post(
            ANNULER_PENALITE_URL, {"penalite_id": penalite.id}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        penalite.refresh_from_db()
        self.assertTrue(penalite.est_annulee)
        self.assertFalse(penalite.est_reglee)


class ListMyPenalitesBolaTests(APITestCase):
    """Anti-IDOR/BOLA : `list_my_penalites` ne renvoie jamais les pénalités
    d'un autre utilisateur, et `regler_penalite`/`annuler_penalite` refusent
    tout accès croisé sans droits admin."""

    def setUp(self):
        self.host = _user("host3")
        self.victime = _user("victime")
        self.attaquant = _user("atk")
        self.tontine, self.regle = _tontine_avec_regle(self.host, nombre_max=3)
        _add_member(self.tontine, self.victime, 2)
        _add_member(self.tontine, self.attaquant, 3)
        self.tour = TourTontine.objects.create(
            tontine=self.tontine,
            user=self.host,
            numero_du_tour=1,
            montant_depose=Decimal("0"),
            statut_tour=TourTontine.STATUT_TOUR.TERMINE,
        )
        self.penalite_victime = Penalite.objects.create(
            tontine=self.tontine,
            user=self.victime,
            tour=self.tour,
            montant_penalite=Decimal("500"),
            montant_due=Decimal("500"),
            type_penalite=Penalite.TYPE_PENALITE.RETARD_PAIEMENT,
            est_automatique=False,
        )

    def test_list_my_penalites_ne_montre_que_les_siennes(self):
        self.client.force_authenticate(user=self.attaquant)
        response = self.client.get(MES_PENALITES_URL)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], 0)

        self.client.force_authenticate(user=self.victime)
        response = self.client.get(MES_PENALITES_URL)
        self.assertEqual(response.data["count"], 1)
        self.assertEqual(response.data["results"][0]["id"], self.penalite_victime.id)

    def test_attaquant_ne_peut_pas_regler_la_penalite_de_la_victime(self):
        Wallet.objects.create(user=self.victime, solde_courant=Decimal("2000"))
        self.client.force_authenticate(user=self.attaquant)
        response = self.client.post(
            REGLER_PENALITE_URL, {"penalite_id": self.penalite_victime.id}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(Wallet.objects.get(user=self.victime).solde_courant, Decimal("2000"))

    def test_attaquant_ne_peut_pas_annuler_la_penalite_de_la_victime(self):
        self.client.force_authenticate(user=self.attaquant)
        response = self.client.post(
            ANNULER_PENALITE_URL, {"penalite_id": self.penalite_victime.id}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.penalite_victime.refresh_from_db()
        self.assertFalse(self.penalite_victime.est_annulee)


@override_settings(PENALITES_AUTO_CUTOFF=None)
class SerializeMemberNoNPlusOneTests(APITestCase):
    """`serialize_member` (via `tontine-detail`) ne doit jamais scaler
    linéairement avec le nombre de membres : les caches de `apps.tontine.
    helpers.serialize_tontine_detail` (paid_ids/next_user_id/phase) doivent
    éliminer le N+1 historique."""

    def setUp(self):
        self.host = _user("nqhost")
        self.tontine, self.regle = _tontine_avec_regle(self.host, nombre_max=5)
        self.membres = [self.host]
        for i in range(2, 6):
            u = _user(f"nqm{i}")
            _add_member(self.tontine, u, i)
            self.membres.append(u)
        self.tour = TourTontine.objects.create(
            tontine=self.tontine,
            user=self.host,
            numero_du_tour=1,
            montant_depose=Decimal("0"),
            statut_tour=TourTontine.STATUT_TOUR.EN_COURS,
        )
        TourTontine.objects.filter(pk=self.tour.pk).update(
            date_echeance=timezone.now() + timedelta(days=5)
        )
        self.client.force_authenticate(user=self.host)

    def _num_queries(self):
        with CaptureQueriesContext(connection) as ctx:
            response = self.client.get(TONTINE_DETAIL_URL, {"tontine_id": self.tontine.id})
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        return len(ctx.captured_queries), response

    def test_query_count_ne_scale_pas_avec_le_nombre_de_membres(self):
        n_before, response_before = self._num_queries()
        self.assertEqual(len(response_before.data["membres"]), 5)

        # Ajoute 5 membres supplémentaires à une SECONDE tontine identique et
        # compare le coût : un vrai N+1 ferait grimper le nombre de requêtes
        # proportionnellement au nombre de membres.
        tontine2, regle2 = _tontine_avec_regle(self.host, nombre_max=10)
        for i in range(2, 11):
            u = _user(f"nq2_{i}")
            _add_member(tontine2, u, i)
        tour2 = TourTontine.objects.create(
            tontine=tontine2,
            user=self.host,
            numero_du_tour=1,
            montant_depose=Decimal("0"),
            statut_tour=TourTontine.STATUT_TOUR.EN_COURS,
        )
        TourTontine.objects.filter(pk=tour2.pk).update(
            date_echeance=timezone.now() + timedelta(days=5)
        )
        with CaptureQueriesContext(connection) as ctx:
            response_after = self.client.get(TONTINE_DETAIL_URL, {"tontine_id": tontine2.id})
        self.assertEqual(response_after.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response_after.data["membres"]), 10)
        n_after = len(ctx.captured_queries)

        # 10 membres au lieu de 5 (doublé) ne doit PAS doubler le nombre de
        # requêtes (tolérance de +3 pour l'éventuel membre "late" recalculé).
        self.assertLessEqual(n_after, n_before + 3, f"{n_before} -> {n_after} requêtes : N+1 suspect")
