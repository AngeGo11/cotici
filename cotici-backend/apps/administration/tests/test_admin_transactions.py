"""`/api/admin/transactions/` : consultation et forçage de statut.

Points vérifiés :

- l'accès est refusé hors session staff, et refusé sans `Perm.TX_READ` /
  `Perm.TX_FORCE_STATUS` selon l'action ;
- le forçage de statut sans motif est rejeté (400) ;
- une transition interdite (statut source différent de EN ATTENTE, ou statut
  cible non autorisé) est refusée (400) et ne modifie rien ;
- un forçage nominal change le statut ET écrit une entrée `AdminActionLog` ;
- les filtres de liste (statut, type, mode, dates, recherche) fonctionnent.
"""
from __future__ import annotations

from datetime import timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.db import connection
from django.test import TestCase, override_settings
from django.test.utils import CaptureQueriesContext
from django.utils import timezone
from rest_framework.test import APIClient

from apps.administration.domain.roles import StaffRole
from apps.administration.tests.helpers import create_staff_profile, login_staff_client
from apps.audits.models import AdminActionLog
from apps.wallet.models import Transaction, Wallet

User = get_user_model()

LIST_URL = "/api/admin/transactions/"


def _detail_url(pk: int) -> str:
    return f"{LIST_URL}{pk}/"


def _force_status_url(pk: int) -> str:
    return f"{LIST_URL}{pk}/force-status/"


def _create_user(username: str, phone: str) -> User:
    return User.objects.create_user(
        username=username,
        password="testpass123",
        code_pin="1234",
        numero_telephone=phone,
    )


def _create_transaction(
    wallet: Wallet,
    *,
    montant=5000,
    statut=Transaction.STATUT_TRANSACTION.EN_ATTENTE,
    mode=Transaction.MODE_DE_PAIEMENT.ORANGE,
    type_transaction=Transaction.TYPE_TRANSACTION.DEPOT,
    ref=None,
    when=None,
) -> Transaction:
    tx = Transaction.objects.create(
        wallet=wallet,
        solde_courant=Decimal(0),
        ref_transaction=ref or f"REF-{Transaction.objects.count() + 1:06d}",
        mode_de_paiement=mode,
        montant_transaction=Decimal(montant),
        statut_transaction=statut,
        type_transaction=type_transaction,
    )
    if when is not None:
        # `date_transaction` est en auto_now_add : seul un UPDATE direct
        # permet d'antidater une transaction pour tester les filtres de date.
        Transaction.objects.filter(pk=tx.pk).update(date_transaction=when)
        tx.refresh_from_db()
    return tx


@override_settings(ADMIN_IP_ALLOWLIST="", DEBUG=True, ADMIN_TOTP_REQUIRED=True)
class TransactionAdminAccessControlTests(TestCase):
    def setUp(self):
        cache.clear()
        self.client = APIClient()
        self.user = _create_user("client.tx.access", "2250700300001")
        self.wallet = Wallet.objects.create(user=self.user, solde_courant=Decimal(0))
        self.tx = _create_transaction(self.wallet)

    def test_anonymous_is_denied(self):
        resp = self.client.get(LIST_URL)
        self.assertEqual(resp.status_code, 403)

    def test_authenticated_non_staff_is_denied(self):
        mobile_user = _create_user("mobile.tx.access", "2250700300002")
        self.client.force_login(mobile_user)
        resp = self.client.get(LIST_URL)
        self.assertEqual(resp.status_code, 403)

    def test_staff_with_tx_read_but_without_tx_force_status_is_denied_on_force(self):
        # AUDITEUR a Perm.TX_READ (lecture) mais pas Perm.TX_FORCE_STATUS :
        # seul SUPER_ADMIN détient aujourd'hui cette permission (voir
        # `domain/roles.py`) — le forçage doit donc être refusé pour ce rôle,
        # même si la lecture des transactions lui reste ouverte.
        create_staff_profile(
            username="staff.tx.norights",
            numero_telephone="2250700300003",
            password="Un-Mot-De-Passe-Tx-1",
            role=StaffRole.AUDITEUR,
        )
        login_staff_client(
            self.client, username="staff.tx.norights", password="Un-Mot-De-Passe-Tx-1"
        )

        list_resp = self.client.get(LIST_URL)
        self.assertEqual(list_resp.status_code, 200, list_resp.content)

        force_resp = self.client.post(
            _force_status_url(self.tx.pk),
            {"new_status": Transaction.STATUT_TRANSACTION.REUSSIE, "reason": "Motif suffisant."},
            format="json",
        )
        self.assertEqual(force_resp.status_code, 403, force_resp.content)


@override_settings(ADMIN_IP_ALLOWLIST="", DEBUG=True, ADMIN_TOTP_REQUIRED=True)
class TransactionAdminListTests(TestCase):
    def setUp(self):
        cache.clear()
        self.client = APIClient()
        create_staff_profile(
            username="staff.tx.list",
            numero_telephone="2250700310001",
            password="Un-Mot-De-Passe-Tx-2",
            role=StaffRole.SUPPORT,
        )
        login_staff_client(self.client, username="staff.tx.list", password="Un-Mot-De-Passe-Tx-2")

        self.user_a = _create_user("client.tx.a", "2250700310002")
        self.user_b = _create_user("client.tx.b", "2250700310003")
        self.wallet_a = Wallet.objects.create(user=self.user_a, solde_courant=Decimal(0))
        self.wallet_b = Wallet.objects.create(user=self.user_b, solde_courant=Decimal(0))

        self.tx_reussie = _create_transaction(
            self.wallet_a,
            statut=Transaction.STATUT_TRANSACTION.REUSSIE,
            mode=Transaction.MODE_DE_PAIEMENT.ORANGE,
            type_transaction=Transaction.TYPE_TRANSACTION.DEPOT,
            ref="REF-AAA001",
        )
        self.tx_en_attente = _create_transaction(
            self.wallet_b,
            statut=Transaction.STATUT_TRANSACTION.EN_ATTENTE,
            mode=Transaction.MODE_DE_PAIEMENT.MTN,
            type_transaction=Transaction.TYPE_TRANSACTION.RETRAIT,
            ref="REF-BBB002",
        )
        self.tx_ancienne = _create_transaction(
            self.wallet_a,
            statut=Transaction.STATUT_TRANSACTION.REUSSIE,
            ref="REF-CCC003",
            when=timezone.now() - timedelta(days=10),
        )

    def test_list_is_paginated_and_ordered_by_date_desc(self):
        resp = self.client.get(LIST_URL)
        self.assertEqual(resp.status_code, 200, resp.content)
        self.assertEqual(resp.data["count"], 3)
        ids = [row["id"] for row in resp.data["results"]]
        self.assertEqual(ids[0], self.tx_en_attente.pk)  # la plus récente en premier

    def test_filter_by_statut(self):
        resp = self.client.get(LIST_URL, {"statut": Transaction.STATUT_TRANSACTION.EN_ATTENTE})
        self.assertEqual(resp.status_code, 200, resp.content)
        ids = {row["id"] for row in resp.data["results"]}
        self.assertEqual(ids, {self.tx_en_attente.pk})

    def test_filter_by_type(self):
        resp = self.client.get(LIST_URL, {"type": Transaction.TYPE_TRANSACTION.RETRAIT})
        ids = {row["id"] for row in resp.data["results"]}
        self.assertEqual(ids, {self.tx_en_attente.pk})

    def test_filter_by_mode(self):
        resp = self.client.get(LIST_URL, {"mode": Transaction.MODE_DE_PAIEMENT.MTN})
        ids = {row["id"] for row in resp.data["results"]}
        self.assertEqual(ids, {self.tx_en_attente.pk})

    def test_filter_by_date_range_excludes_older_transaction(self):
        today = timezone.localdate()
        resp = self.client.get(
            LIST_URL,
            {"date_from": today.isoformat(), "date_to": today.isoformat()},
        )
        ids = {row["id"] for row in resp.data["results"]}
        self.assertNotIn(self.tx_ancienne.pk, ids)
        self.assertIn(self.tx_reussie.pk, ids)

    def test_search_by_ref_transaction(self):
        resp = self.client.get(LIST_URL, {"search": "BBB002"})
        ids = {row["id"] for row in resp.data["results"]}
        self.assertEqual(ids, {self.tx_en_attente.pk})

    def test_search_by_titulaire_phone(self):
        resp = self.client.get(LIST_URL, {"search": "2250700310003"})
        ids = {row["id"] for row in resp.data["results"]}
        self.assertEqual(ids, {self.tx_en_attente.pk})

    def test_retrieve_returns_detail_payload(self):
        resp = self.client.get(_detail_url(self.tx_reussie.pk))
        self.assertEqual(resp.status_code, 200, resp.content)
        self.assertEqual(resp.data["ref_transaction"], "REF-AAA001")
        # Numero masque, comme sur tous les ecrans de consultation.
        self.assertEqual(
            resp.data["titulaire"]["numero_telephone_masque"], "225••••••••02"
        )
        self.assertNotIn("2250700310002", resp.content.decode())

    def test_no_n_plus_one_query_on_list(self):
        """Le nombre de requêtes ne doit PAS croître avec le nombre de lignes
        renvoyées : preuve que `select_related("wallet", "wallet__user")`
        évite bien le N+1 (sans figer un nombre absolu de requêtes, qui
        inclut aussi l'authentification de session, hors périmètre ici)."""
        with CaptureQueriesContext(connection) as small:
            self.client.get(LIST_URL, {"page_size": 50})

        for i in range(10):
            _create_transaction(self.wallet_a, ref=f"REF-BULK-{i:03d}")

        with CaptureQueriesContext(connection) as large:
            resp = self.client.get(LIST_URL, {"page_size": 50})

        self.assertEqual(resp.status_code, 200, resp.content)
        self.assertEqual(len(small.captured_queries), len(large.captured_queries))


@override_settings(ADMIN_IP_ALLOWLIST="", DEBUG=True, ADMIN_TOTP_REQUIRED=True)
class TransactionForceStatusTests(TestCase):
    def setUp(self):
        cache.clear()
        self.client = APIClient()
        self.profile = create_staff_profile(
            username="staff.tx.force",
            numero_telephone="2250700320001",
            password="Un-Mot-De-Passe-Tx-3",
            role=StaffRole.SUPER_ADMIN,
        )
        login_staff_client(
            self.client, username="staff.tx.force", password="Un-Mot-De-Passe-Tx-3"
        )

        self.user = _create_user("client.tx.force", "2250700320002")
        self.wallet = Wallet.objects.create(user=self.user, solde_courant=Decimal(1000))
        self.tx = _create_transaction(self.wallet, statut=Transaction.STATUT_TRANSACTION.EN_ATTENTE)

    def test_force_status_without_reason_is_rejected(self):
        resp = self.client.post(
            _force_status_url(self.tx.pk),
            {"new_status": Transaction.STATUT_TRANSACTION.REUSSIE},
            format="json",
        )
        self.assertEqual(resp.status_code, 400, resp.content)
        self.tx.refresh_from_db()
        self.assertEqual(self.tx.statut_transaction, Transaction.STATUT_TRANSACTION.EN_ATTENTE)

    def test_force_status_with_blank_reason_is_rejected(self):
        resp = self.client.post(
            _force_status_url(self.tx.pk),
            {"new_status": Transaction.STATUT_TRANSACTION.REUSSIE, "reason": "   "},
            format="json",
        )
        self.assertEqual(resp.status_code, 400, resp.content)

    def test_force_status_nominal_updates_status_and_writes_audit_log(self):
        resp = self.client.post(
            _force_status_url(self.tx.pk),
            {
                "new_status": Transaction.STATUT_TRANSACTION.ECHOUEE,
                "reason": "Callback opérateur jamais reçu, confirmé par le support Orange.",
            },
            format="json",
        )
        self.assertEqual(resp.status_code, 200, resp.content)
        self.assertEqual(resp.data["statut_transaction"], Transaction.STATUT_TRANSACTION.ECHOUEE)

        self.tx.refresh_from_db()
        self.assertEqual(self.tx.statut_transaction, Transaction.STATUT_TRANSACTION.ECHOUEE)

        entry = AdminActionLog.objects.filter(
            action="transaction_forced_status", target_id=str(self.tx.pk)
        ).latest("timestamp")
        self.assertEqual(entry.actor, self.profile.user)
        self.assertEqual(entry.target_user, self.user)
        self.assertTrue(entry.reason)
        self.assertEqual(entry.before, {"statut_transaction": "EN ATTENTE"})
        self.assertEqual(entry.after, {"statut_transaction": "ÉCHOUÉE"})

    def test_force_status_does_not_touch_wallet_balance(self):
        self.client.post(
            _force_status_url(self.tx.pk),
            {
                "new_status": Transaction.STATUT_TRANSACTION.REUSSIE,
                "reason": "Confirmation manuelle après vérification du relevé opérateur.",
            },
            format="json",
        )
        self.wallet.refresh_from_db()
        self.assertEqual(self.wallet.solde_courant, Decimal(1000))

    def test_forbidden_transition_from_non_pending_status_is_rejected(self):
        self.tx.statut_transaction = Transaction.STATUT_TRANSACTION.REUSSIE
        self.tx.save(update_fields=["statut_transaction"])

        resp = self.client.post(
            _force_status_url(self.tx.pk),
            {
                "new_status": Transaction.STATUT_TRANSACTION.ANNULE,
                "reason": "Tentative de forcer une transaction déjà terminale.",
            },
            format="json",
        )
        self.assertEqual(resp.status_code, 400, resp.content)
        self.tx.refresh_from_db()
        self.assertEqual(self.tx.statut_transaction, Transaction.STATUT_TRANSACTION.REUSSIE)

    def test_unknown_transaction_returns_404(self):
        resp = self.client.post(
            _force_status_url(999999),
            {"new_status": Transaction.STATUT_TRANSACTION.REUSSIE, "reason": "Motif suffisant."},
            format="json",
        )
        self.assertEqual(resp.status_code, 404)
