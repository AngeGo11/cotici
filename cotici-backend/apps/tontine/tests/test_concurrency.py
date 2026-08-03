"""Test de VRAIE concurrence (connexions DB séparées, requêtes qui se
chevauchent réellement) sur la cotisation d'un tour de tontine.

Pourquoi TransactionTestCase et pas TestCase :
------------------------------------------------
`django.test.TestCase` enveloppe chaque test dans une transaction DB unique,
annulée (rollback) à la fin du test, et toutes les requêtes du test partagent
cette même connexion/transaction. Deux threads qui appellent la vue "en même
temps" dans un `TestCase` n'exercent donc PAS un vrai scénario multi-connexion :
soit ils se sérialisent artificiellement sur la même transaction non validée,
soit le comportement de verrouillage (`select_for_update`) n'est tout
simplement pas représentatif de ce qui se passe en production (deux requêtes
HTTP distinctes = deux connexions DB distinctes = deux transactions
indépendantes qui peuvent réellement se disputer un verrou de ligne).

`TransactionTestCase` valide (commit) réellement les données en base et laisse
chaque thread ouvrir sa propre connexion (Django gère les connexions DB par
thread), ce qui permet de reproduire une vraie course : les deux requêtes
concurrentes tentent d'acquérir le même verrou `select_for_update()` sur le
wallet du cotisant, et une seule doit gagner la course, l'autre devant être
rejetée proprement par le recontrôle "déjà cotisé" fait sous verrou.

Contrepartie : TransactionTestCase est plus lent (flush de la base entre
tests plutôt que rollback), donc réservé à ce test spécifique.
"""

import threading

from decimal import Decimal

from django.test import TransactionTestCase
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient

from apps.authn.models import User
from apps.tontine.models import Tontine, TontineMembre, TontineRegle, TourTontine
from apps.wallet.models import Transaction, Wallet


def _user(username: str, phone: str) -> User:
    return User.objects.create_user(
        username=username, password="testpass123", code_pin="1234", numero_telephone=phone
    )


class ConcurrentCotisationRaceTests(TransactionTestCase):
    """Deux requêtes de cotisation réellement simultanées, du même membre, sur
    le même tour : une seule doit passer, l'autre doit échouer proprement
    (pas de double débit du wallet, pas de double Transaction DEBIT réussie)."""

    # TransactionTestCase truncate les tables au lieu de rollback -> plus lent ;
    # reset_sequences n'est pas nécessaire ici.
    reset_sequences = False

    def setUp(self):
        self.host = _user("race_host", "22507080999")
        self.member2 = _user("race_member2", "22509080799")

        self.tontine = Tontine.objects.create(
            hote=self.host,
            type_tontine=Tontine.TYPE_TONTINE.GROUPE,
            description="Groupe course concurrente",
            qr_code="qr-race",
        )
        self.regle = TontineRegle.objects.create(
            tontine=self.tontine,
            objectif_cotisation=20000,
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
        self.tour = TourTontine.objects.create(
            tontine=self.tontine,
            user=self.host,
            numero_du_tour=1,
            montant_depose=Decimal("0"),
            statut_tour=TourTontine.STATUT_TOUR.EN_COURS,
        )
        # Solde largement suffisant pour une seule cotisation (10000) mais pas
        # pour deux (20000) : si la course est mal gérée, un double débit
        # ferait passer le solde en négatif ou permettrait deux Transactions.
        Wallet.objects.create(user=self.host, solde_courant=Decimal("15000"))

    def test_concurrent_double_cotisation_only_one_wins(self):
        cotiser_url = reverse("tontine-cotiser")
        payload = {"tontine_id": self.tontine.id, "montant": 10000}

        results = []
        results_lock = threading.Lock()
        barrier = threading.Barrier(2)

        def _fire():
            client = APIClient()
            client.force_authenticate(user=self.host)
            try:
                # Synchronise le départ des deux threads pour maximiser le
                # chevauchement réel des deux requêtes/transactions DB.
                barrier.wait(timeout=5)
            except threading.BrokenBarrierError:
                pass
            response = client.post(cotiser_url, payload, format="json")
            with results_lock:
                results.append(response.status_code)
            # Ferme la connexion DB ouverte par ce thread pour éviter les
            # connexions orphelines une fois le thread terminé.
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

        # Le wallet ne doit avoir été débité qu'une seule fois (10000, pas 20000).
        wallet = Wallet.objects.get(user=self.host)
        self.assertEqual(wallet.solde_courant, Decimal("5000"))

        # Une seule Transaction DEBIT réussie pour ce tour/wallet doit exister
        # (également garanti en filet de sécurité par la contrainte DB unique).
        debit_count = Transaction.objects.filter(
            tour=self.tour,
            wallet=wallet,
            type_transaction=Transaction.TYPE_TRANSACTION.DEBIT,
            statut_transaction=Transaction.STATUT_TRANSACTION.REUSSIE,
        ).count()
        self.assertEqual(debit_count, 1)

        self.tour.refresh_from_db()
        self.assertEqual(self.tour.montant_depose, Decimal("10000"))
