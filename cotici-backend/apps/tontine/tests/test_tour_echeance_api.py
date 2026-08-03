"""Exposition de `TourTontine.date_echeance` dans les réponses API.

L'app mobile affiche « Échéance : dans 3 jours » sur la carte et le détail
d'une tontine. Elle dépend donc de la présence de `date_echeance` dans les
deux sérialiseurs de tour (`views._serialize_tour` et
`helpers.serialize_tour_brief`) et du fait que sa valeur suive bien la
fréquence de cotisation. Ces tests verrouillent ce contrat.
"""
from datetime import timedelta
from decimal import Decimal

from django.urls import reverse
from django.utils.dateparse import parse_datetime
from rest_framework import status
from rest_framework.test import APITestCase

from apps.authn.models import User
from apps.tontine.models import Tontine, TontineMembre, TontineRegle, TourTontine
from apps.wallet.models import Wallet

CHANGER_URL = reverse("tontine-changer-tour")
DETAIL_URL = reverse("tontine-detail")


class TourEcheanceApiTests(APITestCase):
    """Groupe à 2 membres, ordre défini par l'admin, 2 tours."""

    #: Surchargé par les sous-classes pour balayer les fréquences.
    frequence = TontineRegle.FREQUENCE_COTISATION.MENSUEL
    frequence_personalise = None
    #: Durée attendue d'un tour, ou None si l'échéance n'est pas calculable.
    delta_attendu = timedelta(days=30)

    def setUp(self):
        suffixe = self.frequence[:4].lower()
        self.host = User.objects.create_user(
            username=f"ech_host_{suffixe}",
            password="testpass123",
            code_pin="1234",
            numero_telephone=f"2250711{abs(hash(self.frequence)) % 10000:04d}",
        )
        self.member2 = User.objects.create_user(
            username=f"ech_m2_{suffixe}",
            password="testpass123",
            code_pin="1234",
            numero_telephone=f"2250722{abs(hash(self.frequence)) % 10000:04d}",
        )

        self.tontine = Tontine.objects.create(
            hote=self.host,
            type_tontine=Tontine.TYPE_TONTINE.GROUPE,
            description="Groupe échéance",
            qr_code=f"qr-echeance-{suffixe}",
        )
        TontineRegle.objects.create(
            tontine=self.tontine,
            objectif_cotisation=40000,
            montant_cotisation=10000,
            montant_penalite=0,
            nombre_max=2,
            nombre_tours=2,
            ordre_ramassage=TontineRegle.ORDRE_RAMASSAGE.DEFINI_PAR_ADMIN,
            frequence=self.frequence,
            frequence_personalise=self.frequence_personalise,
        )
        for user, rang, role in (
            (self.host, 1, TontineMembre.ROLE_MEMBRE.ADMIN),
            (self.member2, 2, TontineMembre.ROLE_MEMBRE.PARTICIPANT),
        ):
            TontineMembre.objects.create(
                tontine=self.tontine,
                membre=user,
                role_membre=role,
                statut_membre=TontineMembre.STATUT_MEMBRE.ACTIF,
                ordre_ramassage=rang,
            )
            Wallet.objects.create(user=user, solde_courant=Decimal("50000"))

    def _demarrer_tour_1(self):
        self.client.force_authenticate(user=self.host)
        return self.client.post(CHANGER_URL, {"tontine_id": self.tontine.id}, format="json")

    def test_changer_tour_expose_une_echeance_conforme_a_la_frequence(self):
        response = self._demarrer_tour_1()
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)

        tour_suivant = response.data["tour_suivant"]
        self.assertIn("date_echeance", tour_suivant)

        tour = TourTontine.objects.get(tontine=self.tontine, numero_du_tour=1)
        if self.delta_attendu is None:
            self.assertIsNone(tour_suivant["date_echeance"])
            self.assertIsNone(tour.date_echeance)
            return

        self.assertIsNotNone(tour_suivant["date_echeance"])
        self.assertEqual(parse_datetime(tour_suivant["date_echeance"]), tour.date_echeance)
        self.assertEqual(tour.date_echeance - tour.date, self.delta_attendu)

    def test_detail_expose_l_echeance_du_tour_courant(self):
        self.assertEqual(self._demarrer_tour_1().status_code, status.HTTP_201_CREATED)

        self.client.force_authenticate(user=self.member2)
        response = self.client.get(DETAIL_URL, {"id": self.tontine.id})
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)

        tour_courant = response.data["tour_courant"]
        self.assertIsNotNone(tour_courant)
        self.assertIn("date_echeance", tour_courant)

        tour = TourTontine.objects.get(tontine=self.tontine, numero_du_tour=1)
        if self.delta_attendu is None:
            self.assertIsNone(tour_courant["date_echeance"])
        else:
            self.assertEqual(parse_datetime(tour_courant["date_echeance"]), tour.date_echeance)

    def test_detail_expose_la_frequence_dans_les_regles(self):
        """Le mobile lit `regles.frequence` pour composer « Cotisation <fréquence> »."""
        self.client.force_authenticate(user=self.host)
        response = self.client.get(DETAIL_URL, {"id": self.tontine.id})
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(response.data["regles"]["frequence"], self.frequence)
        self.assertEqual(
            response.data["regles"]["frequence_personnalise"], self.frequence_personalise
        )


class TourEcheanceJournalierTests(TourEcheanceApiTests):
    frequence = TontineRegle.FREQUENCE_COTISATION.JOURNALIER
    delta_attendu = timedelta(days=1)


class TourEcheanceHebdomadaireTests(TourEcheanceApiTests):
    frequence = TontineRegle.FREQUENCE_COTISATION.HEBDOMADAIRE
    delta_attendu = timedelta(days=7)


class TourEcheancePersonnaliseeTests(TourEcheanceApiTests):
    frequence = TontineRegle.FREQUENCE_COTISATION.PERSONNALISE
    frequence_personalise = 5
    delta_attendu = timedelta(days=5)


class TourEcheanceNonCalculableTests(TourEcheanceApiTests):
    """Fréquence personnalisée sans nombre de jours : l'échéance reste nulle.

    Le client doit gérer ce cas — c'est la raison pour laquelle `date_echeance`
    est déclarée nullable côté mobile.
    """

    frequence = TontineRegle.FREQUENCE_COTISATION.PERSONNALISE
    frequence_personalise = None
    delta_attendu = None
