from decimal import Decimal

from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from apps.audits.models import AuditLog
from apps.authn.models import User
from apps.tontine.models import Tontine, TontineMembre, TontineRegle, TourTontine
from apps.wallet.models import Transaction, Wallet

CHANGER_URL = reverse("tontine-changer-tour")
COTISER_URL = reverse("tontine-cotiser")


def _user(username: str, phone: str) -> User:
    return User.objects.create_user(
        username=username, password="testpass123", code_pin="1234", numero_telephone=phone
    )


class ChangerTourBaseTests(APITestCase):
    """Groupe à 2 membres, ordre défini par l'admin (host=1, member2=2),
    2 tours (1 cycle complet), cotisation de 10000 F chacun -> pot de 20000 F/tour."""

    def setUp(self):
        self.host = _user("ct_host", "22507080960")
        self.member2 = _user("ct_member2", "22509080761")

        self.tontine = Tontine.objects.create(
            hote=self.host,
            type_tontine=Tontine.TYPE_TONTINE.GROUPE,
            description="Groupe changer_tour",
            qr_code="qr-changer-tour",
        )
        self.regle = TontineRegle.objects.create(
            tontine=self.tontine,
            objectif_cotisation=40000,
            montant_cotisation=10000,
            montant_penalite=0,
            nombre_max=2,
            nombre_tours=2,
            ordre_ramassage=TontineRegle.ORDRE_RAMASSAGE.DEFINI_PAR_ADMIN,
            frequence=TontineRegle.FREQUENCE_COTISATION.MENSUEL,
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
            membre=self.member2,
            role_membre=TontineMembre.ROLE_MEMBRE.PARTICIPANT,
            statut_membre=TontineMembre.STATUT_MEMBRE.ACTIF,
            ordre_ramassage=2,
        )
        Wallet.objects.create(user=self.host, solde_courant=Decimal("50000"))
        Wallet.objects.create(user=self.member2, solde_courant=Decimal("50000"))

    def _changer_tour(self, as_user):
        self.client.force_authenticate(user=as_user)
        return self.client.post(
            CHANGER_URL, {"tontine_id": self.tontine.id}, format="json"
        )

    def _cotiser(self, as_user, montant=10000):
        self.client.force_authenticate(user=as_user)
        return self.client.post(
            COTISER_URL,
            {"tontine_id": self.tontine.id, "montant": montant},
            format="json",
        )

    # ------------------------------------------------------------------
    # Démarrage du tour 1
    # ------------------------------------------------------------------
    def test_demarrage_tour_1_attribue_le_bon_beneficiaire(self):
        response = self._changer_tour(self.host)

        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        self.assertEqual(response.data["detail"], "Tour 1 démarré.")
        self.assertEqual(response.data["numero_tour_actuel"], 1)
        self.assertIsNone(response.data["tour_cloture"])
        self.assertEqual(response.data["tour_suivant"]["beneficiaire_id"], self.host.id)

        tour = TourTontine.objects.get(tontine=self.tontine, numero_du_tour=1)
        self.assertEqual(tour.statut_tour, TourTontine.STATUT_TOUR.EN_COURS)
        self.assertEqual(tour.user_id, self.host.id)

    def test_permission_non_admin_refuse(self):
        """Un membre non-admin (participant) ne peut pas déclencher changer_tour."""
        response = self._changer_tour(self.member2)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(
            response.data["detail"],
            "Seul l'hôte ou un administrateur peut changer de tour.",
        )
        self.assertFalse(TourTontine.objects.filter(tontine=self.tontine).exists())

    def test_permission_etranger_refuse(self):
        stranger = _user("ct_stranger", "22502020299")
        response = self._changer_tour(stranger)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    # ------------------------------------------------------------------
    # Rejet si toutes les cotisations ne sont pas réglées
    # ------------------------------------------------------------------
    def test_rejet_si_cotisations_incompletes(self):
        self._changer_tour(self.host)  # démarre le tour 1
        self._cotiser(self.host)  # seul l'ordre 1 (host) a payé

        response = self._changer_tour(self.host)

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("ne sont pas encore réglées", response.data["detail"])

        tour = TourTontine.objects.get(tontine=self.tontine, numero_du_tour=1)
        self.assertEqual(tour.statut_tour, TourTontine.STATUT_TOUR.EN_COURS)

    # ------------------------------------------------------------------
    # Clôture d'un tour + crédit exact + exclusion + fin de cycle
    # ------------------------------------------------------------------
    def test_cloture_credite_beneficiaire_puis_tour_suivant_exclut_le_beneficiaire_precedent(self):
        self._changer_tour(self.host)  # démarre tour 1 (bénéficiaire = host)

        host_balance_before_close = Wallet.objects.get(user=self.host).solde_courant
        self._cotiser(self.host)
        self._cotiser(self.member2)
        host_balance_after_cotisations = Wallet.objects.get(user=self.host).solde_courant
        self.assertEqual(
            host_balance_after_cotisations, host_balance_before_close - Decimal("10000")
        )

        response = self._changer_tour(self.host)

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(response.data["detail"], "Passage au tour 2.")
        self.assertEqual(response.data["tour_cloture"]["statut_tour"], TourTontine.STATUT_TOUR.TERMINE)
        self.assertEqual(response.data["tour_cloture"]["montant_depose"], "20000")
        # Le tour 2 doit être attribué à member2 (ordre 2), pas au bénéficiaire déjà servi.
        self.assertEqual(response.data["tour_suivant"]["beneficiaire_id"], self.member2.id)
        self.assertFalse(response.data["tontine_terminee"])

        # Crédit EXACT du montant du pot (20000) au bénéficiaire du tour 1 (host).
        host_wallet = Wallet.objects.get(user=self.host)
        self.assertEqual(
            host_wallet.solde_courant, host_balance_after_cotisations + Decimal("20000")
        )
        self.assertTrue(
            Transaction.objects.filter(
                wallet=host_wallet,
                type_transaction=Transaction.TYPE_TRANSACTION.DEPOT,
                montant_transaction=Decimal("20000"),
                statut_transaction=Transaction.STATUT_TRANSACTION.REUSSIE,
            ).exists()
        )

        tour1 = TourTontine.objects.get(tontine=self.tontine, numero_du_tour=1)
        self.assertEqual(tour1.statut_tour, TourTontine.STATUT_TOUR.TERMINE)
        self.assertEqual(tour1.montant_depose, Decimal("20000"))

        tour2 = TourTontine.objects.get(tontine=self.tontine, numero_du_tour=2)
        self.assertEqual(tour2.statut_tour, TourTontine.STATUT_TOUR.EN_COURS)
        self.assertEqual(tour2.user_id, self.member2.id)

    def test_fin_de_cycle_complet_marque_la_tontine_terminee(self):
        # Tour 1
        self._changer_tour(self.host)
        self._cotiser(self.host)
        self._cotiser(self.member2)
        self._changer_tour(self.host)  # clôture tour 1, démarre tour 2

        # Tour 2 (dernier tour, nombre_tours=2)
        self._cotiser(self.host)
        self._cotiser(self.member2)
        response = self._changer_tour(self.host)

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(response.data["detail"], "Tontine terminée.")
        self.assertTrue(response.data["tontine_terminee"])
        self.assertIsNone(response.data["numero_tour_actuel"])

        self.tontine.refresh_from_db()
        self.assertFalse(self.tontine.est_active)

        tour2 = TourTontine.objects.get(tontine=self.tontine, numero_du_tour=2)
        self.assertEqual(tour2.statut_tour, TourTontine.STATUT_TOUR.TERMINE)
        # Bénéficiaire du dernier tour (member2) crédité du pot.
        member2_wallet = Wallet.objects.get(user=self.member2)
        # Solde de départ 50000 - 2x10000 cotisations + 2x20000 pots reçus.
        self.assertEqual(member2_wallet.solde_courant, Decimal("50000") - Decimal("20000") + Decimal("20000"))

        # Aucun tour 3 ne doit exister.
        self.assertFalse(TourTontine.objects.filter(tontine=self.tontine, numero_du_tour=3).exists())


class ChangerTourOrdreAleatoireTests(APITestCase):
    """Groupe à 3 membres, ordre ALÉATOIRE : vérifie le tirage, sa traçabilité
    (AuditLog) et la persistance du rang réellement obtenu (pas de régression
    sur `next_member_to_pay` / l'affichage du rang)."""

    def setUp(self):
        self.host = _user("ra_host", "22507080963")
        self.member2 = _user("ra_member2", "22509080764")
        self.member3 = _user("ra_member3", "22509080765")

        self.tontine = Tontine.objects.create(
            hote=self.host,
            type_tontine=Tontine.TYPE_TONTINE.GROUPE,
            description="Groupe ordre aléatoire",
            qr_code="qr-changer-tour-aleatoire",
        )
        self.regle = TontineRegle.objects.create(
            tontine=self.tontine,
            objectif_cotisation=90000,
            montant_cotisation=10000,
            montant_penalite=0,
            nombre_max=3,
            nombre_tours=3,
            ordre_ramassage=TontineRegle.ORDRE_RAMASSAGE.ALEATOIRE,
            frequence=TontineRegle.FREQUENCE_COTISATION.MENSUEL,
        )
        # Rangs provisoires d'adhésion (non significatifs en mode aléatoire :
        # ils ne doivent PAS déterminer le bénéficiaire réel du tirage).
        TontineMembre.objects.create(
            tontine=self.tontine,
            membre=self.host,
            role_membre=TontineMembre.ROLE_MEMBRE.ADMIN,
            statut_membre=TontineMembre.STATUT_MEMBRE.ACTIF,
            ordre_ramassage=1,
        )
        TontineMembre.objects.create(
            tontine=self.tontine,
            membre=self.member2,
            role_membre=TontineMembre.ROLE_MEMBRE.PARTICIPANT,
            statut_membre=TontineMembre.STATUT_MEMBRE.ACTIF,
            ordre_ramassage=2,
        )
        TontineMembre.objects.create(
            tontine=self.tontine,
            membre=self.member3,
            role_membre=TontineMembre.ROLE_MEMBRE.PARTICIPANT,
            statut_membre=TontineMembre.STATUT_MEMBRE.ACTIF,
            ordre_ramassage=3,
        )
        for u in (self.host, self.member2, self.member3):
            Wallet.objects.create(user=u, solde_courant=Decimal("50000"))

    def _changer_tour(self, as_user):
        self.client.force_authenticate(user=as_user)
        return self.client.post(
            CHANGER_URL, {"tontine_id": self.tontine.id}, format="json"
        )

    def _cotiser(self, as_user, montant=10000):
        self.client.force_authenticate(user=as_user)
        return self.client.post(
            COTISER_URL,
            {"tontine_id": self.tontine.id, "montant": montant},
            format="json",
        )

    def test_tirage_journalise_dans_audit_log(self):
        response = self._changer_tour(self.host)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)

        beneficiaire_id = response.data["tour_suivant"]["beneficiaire_id"]
        entry = AuditLog.objects.filter(
            action=AuditLog.Action.RANDOM_DRAW_PERFORMED,
        ).latest("timestamp")
        self.assertEqual(entry.user_id, self.host.id)
        self.assertIn(f"tontine:{self.tontine.pk}", entry.resource)
        self.assertIn("tour:1", entry.resource)
        self.assertIn(f"beneficiaire:{beneficiaire_id}", entry.resource)
        self.assertIn("vivier=3", entry.resource)

    def test_rang_persiste_apres_tirage_egal_au_numero_du_tour(self):
        response = self._changer_tour(self.host)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        beneficiaire_id = response.data["tour_suivant"]["beneficiaire_id"]

        tm = TontineMembre.objects.get(tontine=self.tontine, membre_id=beneficiaire_id)
        self.assertEqual(tm.ordre_ramassage, 1)

        # La colonne reste une permutation dense de 1..3 (aucune violation
        # de la contrainte unique, aucun trou ni doublon).
        ordres = sorted(
            TontineMembre.objects.filter(tontine=self.tontine).values_list(
                "ordre_ramassage", flat=True
            )
        )
        self.assertEqual(ordres, [1, 2, 3])

    def test_next_member_to_pay_coherent_avec_le_rang_reel_apres_tirage(self):
        """Après le tirage du tour 1, le bénéficiaire doit payer sa cotisation
        pour permettre le passage au tour 2 : si `ordre_ramassage` n'était pas
        mis à jour, `next_member_to_pay` pourrait pointer sur le mauvais
        membre et bloquer indéfiniment la clôture du tour."""
        response = self._changer_tour(self.host)
        beneficiaire_id = response.data["tour_suivant"]["beneficiaire_id"]

        # `cotiser` impose l'ordre de paiement selon le rang réel
        # (`ordre_ramassage` mis à jour par le tirage), pas l'ordre
        # provisoire d'adhésion : on paie donc dans l'ordre des rangs.
        membres_par_rang = TontineMembre.objects.filter(
            tontine=self.tontine
        ).order_by("ordre_ramassage")
        for tm in membres_par_rang:
            r = self._cotiser(tm.membre)
            self.assertEqual(r.status_code, status.HTTP_201_CREATED, r.data)

        response = self._changer_tour(self.host)
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(response.data["detail"], "Passage au tour 2.")
        # Le bénéficiaire du tour 2 ne peut pas être celui déjà servi au tour 1.
        self.assertNotEqual(response.data["tour_suivant"]["beneficiaire_id"], beneficiaire_id)
