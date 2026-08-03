import json
import logging
from decimal import Decimal, InvalidOperation
from uuid import uuid4

from typing import Optional

from django.conf import settings
from django.contrib.auth import get_user_model
from django.db import transaction
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_POST
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.audits.models import AuditLog
from apps.notifications.domain.catalog import spec_paiement_valide
from apps.notifications.services.notification_service import NotificationService
from apps.solidarity.models import Solidarity
from apps.tontine.helpers import display_name_user
from apps.utils.utilitaires import (
    _parse_amount,
    _resolve_payment_mode,
    _resolve_user_by_phone_exact,
    _split_phone_prefix,
    _unique_ref,
)
from apps.wallet import cinetpay
from apps.wallet.models import Transaction, Wallet
from apps.wallet.serializers import DepositSerializer, WithdrawalSerializer

User = get_user_model()
logger = logging.getLogger(__name__)


def health(request):
    return JsonResponse({"module": "wallet", "status": "ok"})


def _solidarity_beneficiaire_nom(tontine_id) -> Optional[str]:
    try:
        solidarity = Solidarity.objects.get(pk=tontine_id)
    except Solidarity.DoesNotExist:
        return None
    beneficiaire = _resolve_user_by_phone_exact(solidarity.beneficiaire_telephone)
    if beneficiaire is None:
        return None
    return display_name_user(beneficiaire)


def _serialize_wallet_transaction(tx: Transaction) -> dict:
    payload = {
        "ref_transaction": tx.ref_transaction,
        "montant_transaction": str(tx.montant_transaction),
        "numero_telephone": getattr(tx.wallet.user, "numero_telephone", "") or "",
        "type_transaction": tx.type_transaction,
        "statut_transaction": tx.statut_transaction,
        "mode_de_paiement": tx.mode_de_paiement,
        "date_transaction": tx.date_transaction.isoformat(),
    }
    if tx.tontine_id:
        motif = (tx.tontine.description or "").strip()
        if motif:
            payload["motif_collecte"] = motif
    if tx.type_transaction == Transaction.TYPE_TRANSACTION.VALIDATION_VERSEMENT_SOLIDAIRE:
        beneficiaire_nom = _solidarity_beneficiaire_nom(tx.tontine_id)
        if beneficiaire_nom:
            payload["beneficiaire_nom"] = beneficiaire_nom
    return payload


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def get_transaction_for_user(request):
    txs = (
        Transaction.objects.filter(wallet__user=request.user)
        .select_related("wallet__user", "tontine")
        .order_by("-date_transaction")[:50]
    )
    data = [_serialize_wallet_transaction(t) for t in txs]
    return Response({"count": len(data), "results": data})

@api_view(["POST"])
@permission_classes([IsAuthenticated])
def deposit(request):
    """Point d'entrée public et stable `POST /wallet/deposit/`.

    Route vers l'ancien comportement sandbox (crédit direct, aucune
    vérification externe) ou vers la véritable intégration CinetPay, selon
    `settings.MOBILE_MONEY_SANDBOX`. Le contrat HTTP (payload attendu côté
    client) ne change pas pour le mode sandbox ; en mode CinetPay, la réponse
    contient en plus une `payment_url` à ouvrir côté client au lieu d'un
    crédit immédiat (le crédit réel n'a lieu qu'après confirmation via le
    webhook `cinetpay_notify`).
    """
    if settings.MOBILE_MONEY_SANDBOX:
        return _deposit_sandbox(request)
    return _deposit_cinetpay_init(request)


def _deposit_sandbox(request):
    user = request.user

    serializer = DepositSerializer(data=request.data)
    if not serializer.is_valid():
        return Response({"detail": serializer.errors["detail"][0]}, status=400)
    amount = serializer.validated_data["montant_depose"]
    mode = serializer.validated_data["mode_de_paiement"]
    idempotency_key = serializer.validated_data["idempotency_key"]

    logger.warning(
        "[SANDBOX] Dépôt Mobile Money simulé (aucune vérification externe) : "
        "user_id=%s montant=%s mode=%s",
        user.id,
        amount,
        mode,
    )

    with transaction.atomic():
        wallet, _ = Wallet.objects.select_for_update().get_or_create(user=user)

        # Idempotence : si cette clé client a déjà été traitée pour ce wallet (retry
        # réseau ou double-tap), on renvoie la transaction existante sans recréer
        # d'écriture ni rejouer le crédit. Vérification faite APRÈS le verrou sur le
        # wallet pour empêcher deux requêtes concurrentes avec la même clé de passer
        # toutes les deux avant qu'aucune n'ait encore écrit.
        if idempotency_key:
            existing = Transaction.objects.filter(
                wallet=wallet, client_ref=idempotency_key
            ).first()
            if existing is not None:
                ancien_existing = existing.solde_courant - existing.montant_transaction
                return Response(
                    {
                        "numero_telephone_utilise": getattr(user, "numero_telephone", "") or "",
                        "ancien_solde": str(ancien_existing),
                        "montant_depot": str(existing.montant_transaction),
                        "nouveau_solde": str(existing.solde_courant),
                        "ref_transaction": existing.ref_transaction,
                        "sandbox": True,
                        "idempotent_replay": True,
                    },
                    status=200,
                )

        ancien = wallet.solde_courant
        wallet.solde_courant = ancien + amount
        wallet.save(update_fields=["solde_courant"])

        ref = _unique_ref("DEP")
        Transaction.objects.create(
            wallet=wallet,
            solde_courant=wallet.solde_courant,
            ref_transaction=ref,
            client_ref=idempotency_key,
            mode_de_paiement=mode,
            montant_transaction=amount,
            statut_transaction=Transaction.STATUT_TRANSACTION.REUSSIE,
            type_transaction=Transaction.TYPE_TRANSACTION.DEPOT,
        )

        AuditLog.objects.create(
            user=user,
            user_display=display_name_user(user),
            action=AuditLog.Action.DEPOSIT_CONFIRMED,
            resource=f"wallet:{wallet.pk}:transaction:{ref}:montant={amount}",
            status=AuditLog.Status.SUCCESS,
        )

        NotificationService.emit(
            destinataire=user,
            spec=spec_paiement_valide(
                kind="dépôt",
                montant=amount,
                ref=ref,
                source_type="wallet",
                source_id=wallet.pk,
            ),
        )

    return Response(
        {
            "numero_telephone_utilise": getattr(user, "numero_telephone", "") or "",
            "ancien_solde": str(ancien),
            "montant_depot": str(amount),
            "nouveau_solde": str(wallet.solde_courant),
            "ref_transaction": ref,
            "sandbox": True,
        },
        status=200,
    )


def _idempotent_deposit_replay(user, existing: Transaction) -> Response:
    """Réponse renvoyée quand une clé d'idempotence a déjà été consommée par
    un dépôt CinetPay (init ou webhook rejoué). Ne rappelle jamais CinetPay."""
    payload = {
        "numero_telephone_utilise": getattr(user, "numero_telephone", "") or "",
        "montant_depot": str(existing.montant_transaction),
        "ref_transaction": existing.ref_transaction,
        "statut_transaction": existing.statut_transaction,
        "idempotent_replay": True,
    }
    if existing.statut_transaction == Transaction.STATUT_TRANSACTION.REUSSIE:
        ancien_existing = existing.solde_courant - existing.montant_transaction
        payload["ancien_solde"] = str(ancien_existing)
        payload["nouveau_solde"] = str(existing.solde_courant)
    return Response(payload, status=200)


def _deposit_cinetpay_init(request):
    """Initie un dépôt réel via CinetPay (Checkout API v2).

    Ne crédite JAMAIS le wallet ici : crée une `Transaction` EN_ATTENTE puis
    demande à CinetPay une URL de paiement à ouvrir côté client. Le crédit
    effectif n'a lieu que dans `cinetpay_notify`, après vérification du
    statut réel auprès de CinetPay (`check_payment`).
    """
    user = request.user

    if not settings.CINETPAY_API_KEY or not settings.CINETPAY_SITE_ID:
        return Response(
            {
                "detail": (
                    "Intégration Mobile Money non configurée. "
                    "Dépôt refusé pour éviter de créditer un solde fictif."
                ),
            },
            status=status.HTTP_503_SERVICE_UNAVAILABLE,
        )

    serializer = DepositSerializer(data=request.data)
    if not serializer.is_valid():
        return Response({"detail": serializer.errors["detail"][0]}, status=400)
    amount = serializer.validated_data["montant_depose"]
    mode = serializer.validated_data["mode_de_paiement"]
    idempotency_key = serializer.validated_data["idempotency_key"]

    with transaction.atomic():
        wallet, _ = Wallet.objects.select_for_update().get_or_create(user=user)

        # Idempotence (voir _deposit_sandbox pour la justification du verrou) :
        # si cette clé a déjà été utilisée, on ne rappelle jamais CinetPay ni
        # ne crée de nouvelle Transaction ; on renvoie l'état actuel connu.
        if idempotency_key:
            existing = Transaction.objects.filter(
                wallet=wallet, client_ref=idempotency_key
            ).first()
            if existing is not None:
                return _idempotent_deposit_replay(user, existing)

        ref = _unique_ref("DEP")
        tx = Transaction.objects.create(
            wallet=wallet,
            solde_courant=wallet.solde_courant,
            ref_transaction=ref,
            client_ref=idempotency_key,
            mode_de_paiement=mode,
            montant_transaction=amount,
            statut_transaction=Transaction.STATUT_TRANSACTION.EN_ATTENTE,
            type_transaction=Transaction.TYPE_TRANSACTION.DEPOT,
        )

        AuditLog.objects.create(
            user=user,
            user_display=display_name_user(user),
            action=AuditLog.Action.DEPOSIT_INITIATED,
            resource=f"wallet:{wallet.pk}:transaction:{ref}:montant={amount}",
            status=AuditLog.Status.SUCCESS,
        )

    # Appel réseau volontairement HORS transaction.atomic() : ne jamais garder
    # un verrou DB (select_for_update) ouvert le temps d'un aller-retour HTTP
    # externe.
    try:
        cinetpay_response = cinetpay.initiate_payment(
            transaction_id=ref,
            amount=amount,
            currency=settings.CINETPAY_CURRENCY,
            notify_url=settings.CINETPAY_NOTIFY_URL,
            return_url=settings.CINETPAY_RETURN_URL,
        )
    except cinetpay.CinetPayError as exc:
        logger.error(
            "Échec initiation CinetPay ref=%s user_id=%s : %s", ref, user.id, exc
        )
        # Ne pas laisser une Transaction EN_ATTENTE orpheline : le paiement n'a
        # jamais été proposé au client, donc il ne pourra jamais aboutir.
        with transaction.atomic():
            tx.refresh_from_db()
            if tx.statut_transaction == Transaction.STATUT_TRANSACTION.EN_ATTENTE:
                tx.statut_transaction = Transaction.STATUT_TRANSACTION.ECHOUEE
                tx.save(update_fields=["statut_transaction"])
        AuditLog.objects.create(
            user=user,
            user_display=display_name_user(user),
            action=AuditLog.Action.TRANSACTION_FAILED,
            resource=f"wallet:{wallet.pk}:transaction:{ref}:montant={amount}",
            status=AuditLog.Status.FAILURE,
        )
        return Response(
            {"detail": "Impossible d'initier le paiement Mobile Money. Réessayez plus tard."},
            status=status.HTTP_502_BAD_GATEWAY,
        )

    payment_data = cinetpay_response.get("data") or {}
    return Response(
        {
            "numero_telephone_utilise": getattr(user, "numero_telephone", "") or "",
            "montant_depot": str(amount),
            "ref_transaction": ref,
            "statut_transaction": tx.statut_transaction,
            "payment_url": payment_data.get("payment_url"),
            "sandbox": False,
        },
        status=200,
    )


def _cinetpay_montant_devise_conformes(data: dict, tx: Transaction) -> bool:
    """Vérifie que le paiement confirmé par CinetPay correspond bien à ce qui a
    été demandé à l'initiation (montant ET devise).

    Sans ce contrôle, on créditerait `tx.montant_transaction` dès que CinetPay
    répond ACCEPTED, sans vérifier ce qui a réellement été payé : un paiement
    partiel, ou accepté dans une autre devise (10 000 XOF demandés, 10 000 GNF
    payés), créditerait quand même le montant initial. Le montant crédité doit
    toujours être adossé au montant réellement encaissé.
    """
    montant_paye = _parse_amount(data.get("amount"))
    if montant_paye is None or montant_paye != tx.montant_transaction:
        logger.error(
            "Montant CinetPay non conforme ref=%s attendu=%s reçu=%r",
            tx.ref_transaction,
            tx.montant_transaction,
            data.get("amount"),
        )
        return False

    devise_payee = str(data.get("currency") or "").strip().upper()
    devise_attendue = str(settings.CINETPAY_CURRENCY or "").strip().upper()
    if devise_payee != devise_attendue:
        logger.error(
            "Devise CinetPay non conforme ref=%s attendue=%s reçue=%r",
            tx.ref_transaction,
            devise_attendue,
            data.get("currency"),
        )
        return False

    return True


@csrf_exempt
@require_POST
def cinetpay_notify(request):
    """Webhook public CinetPay (`notify_url`), appelé en POST par CinetPay.

    Aucune authentification JWT : c'est un appel serveur-à-serveur externe.
    CinetPay ne documente pas de signature HMAC sur ce POST : la protection
    contre la falsification n'est PAS le contenu du body, mais le fait qu'on
    rappelle systématiquement `check_payment` (source de vérité) avant tout
    crédit — le body du webhook ne sert qu'à retrouver la transaction
    concernée. Idempotent : peut être rejoué sans double crédit.
    """
    content_type = (request.content_type or "").split(";")[0].strip().lower()
    if content_type == "application/json":
        # CinetPay peut aussi poster en JSON selon la configuration marchande.
        # `request.body` n'est lisible que si `request.POST` n'a pas encore
        # été parsé (form-urlencoded/multipart consomme le flux du body) :
        # on ne le touche donc que pour ce content-type.
        try:
            body = json.loads(request.body or b"{}")
        except (ValueError, TypeError):
            body = {}
        cpm_trans_id = body.get("cpm_trans_id")
    else:
        cpm_trans_id = request.POST.get("cpm_trans_id")

    if not cpm_trans_id:
        return JsonResponse({"detail": "cpm_trans_id manquant."}, status=400)

    tx = (
        Transaction.objects.filter(
            ref_transaction=cpm_trans_id,
            type_transaction=Transaction.TYPE_TRANSACTION.DEPOT,
        )
        .select_related("wallet__user")
        .first()
    )
    if tx is None:
        logger.warning("Webhook CinetPay pour une transaction inconnue : %s", cpm_trans_id)
        return JsonResponse({"detail": "Transaction introuvable."}, status=404)

    try:
        check_response = cinetpay.check_payment(cpm_trans_id)
    except cinetpay.CinetPayError as exc:
        logger.error("Échec vérification CinetPay ref=%s : %s", cpm_trans_id, exc)
        # Statut inconnu : ne rien créditer, et répondre en erreur pour que
        # CinetPay retente le webhook plus tard plutôt que d'abandonner.
        return JsonResponse({"detail": "Vérification CinetPay indisponible."}, status=502)

    data = check_response.get("data") or {}
    is_accepted = str(check_response.get("code")) == "00" and data.get("status") == "ACCEPTED"

    # Un paiement accepté dont le montant ou la devise ne correspondent pas à
    # l'initiation est traité comme un échec : on ne crédite rien et on marque
    # la transaction ÉCHOUÉE, à investiguer manuellement via les logs/AuditLog.
    if is_accepted and not _cinetpay_montant_devise_conformes(data, tx):
        is_accepted = False

    with transaction.atomic():
        wallet = Wallet.objects.select_for_update().get(pk=tx.wallet_id)
        tx_locked = Transaction.objects.select_for_update().get(pk=tx.pk)

        # Idempotence : si cette transaction a déjà été traitée (webhook
        # rejoué, double appel CinetPay), on ne recrédite/ne re-marque jamais.
        if tx_locked.statut_transaction != Transaction.STATUT_TRANSACTION.EN_ATTENTE:
            return JsonResponse(
                {"detail": "Déjà traité.", "statut_transaction": tx_locked.statut_transaction},
                status=200,
            )

        user = wallet.user

        if is_accepted:
            ancien = wallet.solde_courant
            wallet.solde_courant = ancien + tx_locked.montant_transaction
            wallet.save(update_fields=["solde_courant"])

            tx_locked.statut_transaction = Transaction.STATUT_TRANSACTION.REUSSIE
            tx_locked.solde_courant = wallet.solde_courant
            tx_locked.save(update_fields=["statut_transaction", "solde_courant"])

            AuditLog.objects.create(
                user=user,
                user_display=display_name_user(user),
                action=AuditLog.Action.DEPOSIT_CONFIRMED,
                resource=(
                    f"wallet:{wallet.pk}:transaction:{tx_locked.ref_transaction}:"
                    f"montant={tx_locked.montant_transaction}"
                ),
                status=AuditLog.Status.SUCCESS,
            )

            NotificationService.emit(
                destinataire=user,
                spec=spec_paiement_valide(
                    kind="dépôt",
                    montant=tx_locked.montant_transaction,
                    ref=tx_locked.ref_transaction,
                    source_type="wallet",
                    source_id=wallet.pk,
                ),
            )
        else:
            tx_locked.statut_transaction = Transaction.STATUT_TRANSACTION.ECHOUEE
            tx_locked.save(update_fields=["statut_transaction"])

            AuditLog.objects.create(
                user=user,
                user_display=display_name_user(user),
                action=AuditLog.Action.TRANSACTION_FAILED,
                resource=f"wallet:{wallet.pk}:transaction:{tx_locked.ref_transaction}",
                status=AuditLog.Status.FAILURE,
            )

    return JsonResponse({"detail": "ok"}, status=200)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def withdrawal(request):
    """Point d'entrée public et stable `POST /wallet/withdrawal/`.

    Route vers l'ancien comportement sandbox (débit direct, transaction
    marquée RÉUSSIE immédiatement, aucun argent réel envoyé) ou vers la
    véritable intégration CinetPay (Transfer/PayOut API), selon
    `settings.MOBILE_MONEY_SANDBOX`. Le contrat HTTP ne change pas en mode
    sandbox ; en mode CinetPay, le wallet est débité immédiatement (fonds
    réservés) mais la transaction reste EN_ATTENTE jusqu'à confirmation du
    transfert via le webhook `cinetpay_transfer_notify` — en cas d'échec, le
    montant est intégralement recrédité.
    """
    if settings.MOBILE_MONEY_SANDBOX:
        return _withdrawal_sandbox(request)
    return _withdrawal_cinetpay_init(request)


def _withdrawal_sandbox(request):
    user = request.user
    serializer = WithdrawalSerializer(data=request.data)
    if not serializer.is_valid():
        return Response({"detail": serializer.errors["detail"][0]}, status=400)
    amount = serializer.validated_data["montant"]
    mode = serializer.validated_data["mode_de_paiement"]
    idempotency_key = serializer.validated_data["idempotency_key"]

    with transaction.atomic():
        wallet, _ = Wallet.objects.select_for_update().get_or_create(user=user)

        # Idempotence : voir deposit() pour la justification (vérification faite
        # APRÈS le verrou sur le wallet pour éviter un double débit en cas de course).
        if idempotency_key:
            existing = Transaction.objects.filter(
                wallet=wallet, client_ref=idempotency_key
            ).first()
            if existing is not None:
                ancien_existing = existing.solde_courant + existing.montant_transaction
                return Response(
                    {
                        "numero_telephone_utilise": getattr(user, "numero_telephone", "") or "",
                        "ancien_solde": str(ancien_existing),
                        "montant_retire": str(existing.montant_transaction),
                        "nouveau_solde": str(existing.solde_courant),
                        "ref_transaction": existing.ref_transaction,
                        "idempotent_replay": True,
                    },
                    status=200,
                )

        ancien = wallet.solde_courant
        if ancien < amount:
            return Response({"detail": "Solde insuffisant."}, status=400)
        wallet.solde_courant = ancien - amount
        wallet.save(update_fields=["solde_courant"])

        ref = _unique_ref("R")
        Transaction.objects.create(
            wallet=wallet,
            solde_courant=wallet.solde_courant,
            ref_transaction=ref,
            client_ref=idempotency_key,
            mode_de_paiement=mode,
            montant_transaction=amount,
            statut_transaction=Transaction.STATUT_TRANSACTION.REUSSIE,
            type_transaction=Transaction.TYPE_TRANSACTION.RETRAIT,
        )

        AuditLog.objects.create(
            user=user,
            user_display=display_name_user(user),
            action=AuditLog.Action.WITHDRAWAL_CONFIRMED,
            resource=f"wallet:{wallet.pk}:transaction:{ref}:montant={amount}",
            status=AuditLog.Status.SUCCESS,
        )

        NotificationService.emit(
            destinataire=user,
            spec=spec_paiement_valide(
                kind="retrait",
                montant=amount,
                ref=ref,
                source_type="wallet",
                source_id=wallet.pk,
            ),
        )

    return Response(
        {
            "numero_telephone_utilise": getattr(user, "numero_telephone", "") or "",
            "ancien_solde": str(ancien),
            "montant_retire": str(amount),
            "nouveau_solde": str(wallet.solde_courant),
            "ref_transaction": ref,
        },
        status=200,
    )


def _idempotent_withdrawal_replay(user, existing: Transaction) -> Response:
    """Réponse renvoyée quand une clé d'idempotence a déjà été consommée par
    un retrait CinetPay (init ou webhook rejoué). Ne rappelle jamais CinetPay."""
    payload = {
        "numero_telephone_utilise": getattr(user, "numero_telephone", "") or "",
        "montant_retire": str(existing.montant_transaction),
        "ref_transaction": existing.ref_transaction,
        "statut_transaction": existing.statut_transaction,
        "idempotent_replay": True,
    }
    if existing.statut_transaction != Transaction.STATUT_TRANSACTION.ECHOUEE:
        # EN_ATTENTE ou RÉUSSIE : le débit initial est (ou reste) actif.
        ancien_existing = existing.solde_courant + existing.montant_transaction
        payload["ancien_solde"] = str(ancien_existing)
        payload["nouveau_solde"] = str(existing.solde_courant)
    return Response(payload, status=200)


def _refund_failed_withdrawal(*, wallet_id: int, ref_transaction: str, raison: str) -> None:
    """Recrédite intégralement un wallet suite à l'échec d'un retrait
    CinetPay (init ou webhook rejeté), et marque la `Transaction` ÉCHOUÉE.

    Idempotent par construction : sous verrou, ne fait rien si la transaction
    n'est plus EN_ATTENTE (déjà remboursée ou déjà validée par ailleurs) —
    protège contre un double remboursement en cas d'appel concurrent
    (ex : échec réseau à l'init ET webhook de rejet reçu en parallèle).
    """
    with transaction.atomic():
        tx_locked = Transaction.objects.select_for_update().get(
            ref_transaction=ref_transaction, type_transaction=Transaction.TYPE_TRANSACTION.RETRAIT
        )
        if tx_locked.statut_transaction != Transaction.STATUT_TRANSACTION.EN_ATTENTE:
            return

        wallet = Wallet.objects.select_for_update().get(pk=wallet_id)
        user = wallet.user

        wallet.solde_courant = wallet.solde_courant + tx_locked.montant_transaction
        wallet.save(update_fields=["solde_courant"])

        tx_locked.statut_transaction = Transaction.STATUT_TRANSACTION.ECHOUEE
        tx_locked.solde_courant = wallet.solde_courant
        tx_locked.save(update_fields=["statut_transaction", "solde_courant"])

        AuditLog.objects.create(
            user=user,
            user_display=display_name_user(user),
            action=AuditLog.Action.WITHDRAWAL_REJECTED,
            resource=(
                f"wallet:{wallet.pk}:transaction:{tx_locked.ref_transaction}:"
                f"montant={tx_locked.montant_transaction}:raison={raison}"
            ),
            status=AuditLog.Status.FAILURE,
        )


def _withdrawal_cinetpay_init(request):
    """Initie un retrait réel via CinetPay (Transfer/PayOut API v1).

    Débite le wallet IMMÉDIATEMENT (fonds réservés, `Transaction` créée
    EN_ATTENTE) avant d'appeler CinetPay : évite qu'un utilisateur double son
    solde disponible pendant qu'un transfert est "en vol". Si l'appel
    CinetPay échoue (identifiants invalides, solde PayOut marchand
    insuffisant — code 602 —, réseau...), le montant est intégralement
    recrédité et la transaction marquée ÉCHOUÉE. Si l'appel réussit, la
    transaction reste EN_ATTENTE : la finalisation (RÉUSSIE ou remboursée)
    n'a lieu que via `cinetpay_transfer_notify`, après vérification du statut
    réel auprès de CinetPay (`check_transfer`).
    """
    user = request.user

    if not (settings.CINETPAY_API_KEY and settings.CINETPAY_SITE_ID and settings.CINETPAY_TRANSFER_PASSWORD):
        return Response(
            {
                "detail": (
                    "Intégration Mobile Money (retrait) non configurée. "
                    "Retrait refusé pour éviter une perte de fonds."
                ),
            },
            status=status.HTTP_503_SERVICE_UNAVAILABLE,
        )

    serializer = WithdrawalSerializer(data=request.data)
    if not serializer.is_valid():
        return Response({"detail": serializer.errors["detail"][0]}, status=400)
    amount = serializer.validated_data["montant"]
    mode = serializer.validated_data["mode_de_paiement"]
    idempotency_key = serializer.validated_data["idempotency_key"]

    with transaction.atomic():
        wallet, _ = Wallet.objects.select_for_update().get_or_create(user=user)

        # Idempotence (voir _withdrawal_sandbox pour la justification du verrou) :
        # si cette clé a déjà été utilisée, on ne rappelle jamais CinetPay ni
        # ne crée/débite de nouvelle Transaction.
        if idempotency_key:
            existing = Transaction.objects.filter(
                wallet=wallet, client_ref=idempotency_key
            ).first()
            if existing is not None:
                return _idempotent_withdrawal_replay(user, existing)

        ancien = wallet.solde_courant
        if ancien < amount:
            return Response({"detail": "Solde insuffisant."}, status=400)

        # Débit immédiat : les fonds sont réservés dès l'initiation (voir
        # docstring de la fonction).
        wallet.solde_courant = ancien - amount
        wallet.save(update_fields=["solde_courant"])

        ref = _unique_ref("R")
        tx = Transaction.objects.create(
            wallet=wallet,
            solde_courant=wallet.solde_courant,
            ref_transaction=ref,
            client_ref=idempotency_key,
            mode_de_paiement=mode,
            montant_transaction=amount,
            statut_transaction=Transaction.STATUT_TRANSACTION.EN_ATTENTE,
            type_transaction=Transaction.TYPE_TRANSACTION.RETRAIT,
        )

        AuditLog.objects.create(
            user=user,
            user_display=display_name_user(user),
            action=AuditLog.Action.WITHDRAWAL_INITIATED,
            resource=f"wallet:{wallet.pk}:transaction:{ref}:montant={amount}",
            status=AuditLog.Status.SUCCESS,
        )

    # Appels réseau volontairement HORS transaction.atomic() : ne jamais garder
    # un verrou DB (select_for_update) ouvert le temps d'un aller-retour HTTP
    # externe.
    prefix, phone_local = _split_phone_prefix(
        getattr(user, "numero_telephone", "") or "", settings.CINETPAY_DEFAULT_PHONE_PREFIX
    )
    # Convention "nom"/"prénom" pour les champs contact CinetPay ; valeurs de
    # repli non vides (l'API contact exige des champs non vides).
    nom = (getattr(user, "last_name", "") or "").strip() or "COTICI"
    prenom = (getattr(user, "first_name", "") or "").strip() or "Client"
    email = (getattr(user, "email", "") or "").strip()

    try:
        token = cinetpay.get_transfer_token()
        cinetpay.add_contact(
            token=token,
            prefix=prefix,
            phone=phone_local,
            name=nom,
            surname=prenom,
            email=email,
        )
        cinetpay.send_money_to_contact(
            token=token,
            prefix=prefix,
            phone=phone_local,
            amount=amount,
            client_transaction_id=ref,
            notify_url=settings.CINETPAY_TRANSFER_NOTIFY_URL,
        )
    except cinetpay.CinetPayError as exc:
        logger.error(
            "Échec initiation transfert CinetPay ref=%s user_id=%s : %s", ref, user.id, exc
        )
        _refund_failed_withdrawal(
            wallet_id=wallet.pk, ref_transaction=ref, raison="echec_initiation_cinetpay"
        )
        return Response(
            {
                "detail": (
                    "Impossible d'initier le retrait Mobile Money. "
                    "Le montant a été recrédité sur votre solde COTICI, réessayez plus tard."
                ),
            },
            status=status.HTTP_502_BAD_GATEWAY,
        )

    tx.refresh_from_db()
    return Response(
        {
            "numero_telephone_utilise": getattr(user, "numero_telephone", "") or "",
            "ancien_solde": str(ancien),
            "montant_retire": str(amount),
            "nouveau_solde": str(wallet.solde_courant),
            "ref_transaction": ref,
            "statut_transaction": tx.statut_transaction,
            "sandbox": False,
        },
        status=200,
    )


def _cinetpay_transfer_montant_conforme(data: dict, tx: Transaction) -> bool:
    """Vérifie que le montant confirmé par CinetPay pour un transfert
    correspond bien à celui débité à l'initiation.

    Même logique que `_cinetpay_montant_devise_conformes` côté dépôt : ne
    jamais finaliser un retrait en RÉUSSIE sans revérifier que le montant
    réellement traité par CinetPay est identique à `tx.montant_transaction`.
    """
    montant_traite = _parse_amount(data.get("amount"))
    if montant_traite is None or montant_traite != tx.montant_transaction:
        logger.error(
            "Montant transfert CinetPay non conforme ref=%s attendu=%s reçu=%r",
            tx.ref_transaction,
            tx.montant_transaction,
            data.get("amount"),
        )
        return False
    return True


# Statuts terminaux connus de l'API Transfer CinetPay (`treatment_status`).
# Les autres valeurs (ex "NEW", "IN PROGRESS") sont transitoires : on ne
# finalise rien tant que le statut n'est pas explicitement validé/rejeté.
_TRANSFER_VALIDATED_STATUSES = {"VALIDATED", "VALID", "SUCCES", "SUCCESS"}
_TRANSFER_REJECTED_STATUSES = {"REJECTED", "REFUSED", "FAILED", "CANCELED", "CANCELLED", "ERROR"}


@csrf_exempt
@require_POST
def cinetpay_transfer_notify(request):
    """Webhook public CinetPay (`notify_url` du transfert), appelé en POST par
    CinetPay lors d'une transition de statut du retrait.

    Aucune authentification JWT : appel serveur-à-serveur externe. Comme pour
    `cinetpay_notify` (dépôt), le body du webhook ne sert qu'à retrouver la
    transaction concernée : la source de vérité est TOUJOURS
    `cinetpay.check_transfer` (source de vérité, jamais le corps du POST).
    Idempotent : peut être rejoué sans double remboursement ni double
    validation (le wallet a déjà été débité à l'initiation, donc un succès
    ne redébite jamais, et un échec ne recrédite qu'une fois).
    """
    content_type = (request.content_type or "").split(";")[0].strip().lower()
    if content_type == "application/json":
        try:
            body = json.loads(request.body or b"{}")
        except (ValueError, TypeError):
            body = {}
        client_transaction_id = body.get("client_transaction_id")
    else:
        client_transaction_id = request.POST.get("client_transaction_id")

    if not client_transaction_id:
        return JsonResponse({"detail": "client_transaction_id manquant."}, status=400)

    tx = (
        Transaction.objects.filter(
            ref_transaction=client_transaction_id,
            type_transaction=Transaction.TYPE_TRANSACTION.RETRAIT,
        )
        .select_related("wallet__user")
        .first()
    )
    if tx is None:
        logger.warning(
            "Webhook transfert CinetPay pour une transaction inconnue : %s", client_transaction_id
        )
        return JsonResponse({"detail": "Transaction introuvable."}, status=404)

    try:
        token = cinetpay.get_transfer_token()
        check_response = cinetpay.check_transfer(
            token=token, client_transaction_id=client_transaction_id
        )
    except cinetpay.CinetPayError as exc:
        logger.error(
            "Échec vérification transfert CinetPay ref=%s : %s", client_transaction_id, exc
        )
        # Statut inconnu : ne rien finaliser, et répondre en erreur pour que
        # CinetPay retente le webhook plus tard plutôt que d'abandonner.
        return JsonResponse({"detail": "Vérification CinetPay indisponible."}, status=502)

    # CinetPay documente les champs de vérification sous "data", mais on reste
    # tolérant à une réponse à plat par prudence.
    data = check_response.get("data") if isinstance(check_response.get("data"), dict) else check_response
    treatment_status = str((data or {}).get("treatment_status") or "").strip().upper()
    code_ok = str(check_response.get("code")) == "0"

    is_validated = code_ok and treatment_status in _TRANSFER_VALIDATED_STATUSES
    is_rejected = treatment_status in _TRANSFER_REJECTED_STATUSES or (not code_ok and not is_validated)

    # Un transfert validé dont le montant ne correspond pas à l'initiation est
    # traité comme un échec (remboursement), à investiguer via les logs/AuditLog.
    if is_validated and not _cinetpay_transfer_montant_conforme(data or {}, tx):
        is_validated = False
        is_rejected = True

    if not is_validated and not is_rejected:
        # Statut encore transitoire (NEW / IN PROGRESS...) : rien à finaliser,
        # CinetPay rappellera ce webhook à la prochaine transition de statut.
        return JsonResponse(
            {"detail": "Statut transfert non final.", "treatment_status": treatment_status},
            status=200,
        )

    with transaction.atomic():
        wallet = Wallet.objects.select_for_update().get(pk=tx.wallet_id)
        tx_locked = Transaction.objects.select_for_update().get(pk=tx.pk)

        # Idempotence : si cette transaction a déjà été traitée (webhook
        # rejoué), on ne recrédite/ne re-valide jamais.
        if tx_locked.statut_transaction != Transaction.STATUT_TRANSACTION.EN_ATTENTE:
            return JsonResponse(
                {"detail": "Déjà traité.", "statut_transaction": tx_locked.statut_transaction},
                status=200,
            )

        user = wallet.user

        if is_validated:
            # Le wallet a déjà été débité à l'initiation : ne rien redébiter.
            tx_locked.statut_transaction = Transaction.STATUT_TRANSACTION.REUSSIE
            tx_locked.save(update_fields=["statut_transaction"])

            AuditLog.objects.create(
                user=user,
                user_display=display_name_user(user),
                action=AuditLog.Action.WITHDRAWAL_CONFIRMED,
                resource=(
                    f"wallet:{wallet.pk}:transaction:{tx_locked.ref_transaction}:"
                    f"montant={tx_locked.montant_transaction}"
                ),
                status=AuditLog.Status.SUCCESS,
            )

            NotificationService.emit(
                destinataire=user,
                spec=spec_paiement_valide(
                    kind="retrait",
                    montant=tx_locked.montant_transaction,
                    ref=tx_locked.ref_transaction,
                    source_type="wallet",
                    source_id=wallet.pk,
                ),
            )
        else:
            wallet.solde_courant = wallet.solde_courant + tx_locked.montant_transaction
            wallet.save(update_fields=["solde_courant"])

            tx_locked.statut_transaction = Transaction.STATUT_TRANSACTION.ECHOUEE
            tx_locked.solde_courant = wallet.solde_courant
            tx_locked.save(update_fields=["statut_transaction", "solde_courant"])

            AuditLog.objects.create(
                user=user,
                user_display=display_name_user(user),
                action=AuditLog.Action.WITHDRAWAL_REJECTED,
                resource=f"wallet:{wallet.pk}:transaction:{tx_locked.ref_transaction}",
                status=AuditLog.Status.FAILURE,
            )

    return JsonResponse({"detail": "ok"}, status=200)
