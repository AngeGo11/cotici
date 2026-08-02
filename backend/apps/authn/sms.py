"""Envoi de SMS pour les OTP COTICI (inscription/connexion).

Fournit un point d'entrée unique, `send_sms()`, qui dispatche sur le
provider configuré (`settings.SMS_PROVIDER`) :

* ``"console"`` : mode développement — le message (donc le code OTP en
  clair) est loggé. C'est acceptable UNIQUEMENT dans ce mode, qui n'est pas
  censé être utilisé en production.
* ``"cinetpay"`` : envoi réel via l'API SMS CinetPay (compte SMS, distinct
  du compte marchand Mobile Money utilisé par `apps/wallet/cinetpay.py` —
  s'obtient auprès de hello@cinetpay.com).
* toute autre valeur : erreur immédiate (`SmsError`). Un provider mal
  configuré/orthographié ne doit JAMAIS retomber silencieusement sur
  "console", ce qui ferait croire à l'appelant qu'un SMS a été envoyé alors
  que l'utilisateur ne recevra jamais son code.

Règle de sécurité CENTRALE : en dehors du mode "console", le contenu du
message (donc le code OTP en clair) n'est JAMAIS loggé. Seuls le numéro
masqué et les métadonnées de réponse du provider (messageId, statut) le
sont.

Documentation officielle CinetPay SMS : https://cinetpay.com (API Notitia).
"""
from __future__ import annotations

import logging
from typing import Any, Optional

import requests
from django.conf import settings

logger = logging.getLogger(__name__)

# Endpoint API Notitia CinetPay pour l'envoi de SMS unitaire.
CINETPAY_SMS_URL = "https://api-notitia.cinetpay.com/sms/1/text/single"

# Délai raisonnable pour ne pas bloquer indéfiniment une requête HTTP entrante
# en cas de lenteur/indisponibilité côté CinetPay (aligné sur
# apps/wallet/cinetpay.py::REQUEST_TIMEOUT_SECONDS).
REQUEST_TIMEOUT_SECONDS = 10

# `groupName` explicitement reconnus comme un envoi ACCEPTÉ par CinetPay
# (le SMS est en cours d'acheminement). La documentation publique ne liste
# pas exhaustivement tous les `groupName` possibles : par prudence, on ne
# traite comme un succès que ce qui est explicitement reconnu ici, et on
# logge le payload complet pour tout le reste (y compris les `groupName`
# d'erreur connus comme "REJECTED"/"UNDELIVERABLE").
SUCCESS_GROUP_NAMES = frozenset({"PENDING"})


class SmsError(Exception):
    """Erreur lors de l'envoi d'un SMS.

    Couvre la configuration manquante (provider inconnu, clé API absente),
    les erreurs réseau/HTTP/JSON, et les réponses applicatives du provider
    signalant un échec. `payload` conserve, quand disponible, le corps JSON
    décodé retourné par le provider pour faciliter le diagnostic/logging
    côté appelant (ne JAMAIS y placer le code OTP en clair).
    """

    def __init__(self, message: str, *, payload: Optional[dict[str, Any]] = None):
        super().__init__(message)
        self.payload = payload or {}


def mask_phone(phone: str) -> str:
    """Masque un numéro de téléphone pour le logging (ex : "22*******92")."""
    if len(phone) <= 4:
        return "*" * len(phone)
    return f"{phone[:2]}******{phone[-2:]}"


def send_sms(phone: str, message: str) -> None:
    """Envoie un SMS au numéro `phone` via le provider configuré.

    Ne retourne rien en cas de succès. Lève `SmsError` pour toute autre
    issue (provider inconnu, configuration manquante, échec réseau/HTTP/
    applicatif) — l'appelant DOIT gérer cette exception et ne jamais
    prétendre à l'utilisateur qu'un SMS est parti si elle est levée.
    """
    provider = (getattr(settings, "SMS_PROVIDER", "console") or "console").lower()

    if provider == "console":
        # Mode développement uniquement : le code OTP en clair dans les logs
        # est ici assumé et acceptable.
        logger.warning("[SMS console] to=%s message=%s", phone, message)
        return

    if provider == "cinetpay":
        _send_via_cinetpay(phone, message)
        return

    # Aucun fallback silencieux : un provider mal configuré doit échouer
    # bruyamment plutôt que de dégrader vers la console en production.
    raise SmsError(f"Provider SMS inconnu : '{provider}'.")


def _send_via_cinetpay(phone: str, message: str) -> None:
    """Envoie un SMS via l'API CinetPay Notitia (`POST /sms/1/text/single`)."""
    api_key = getattr(settings, "CINETPAY_SMS_API_KEY", "")
    sender = getattr(settings, "CINETPAY_SMS_SENDER", "")
    masked_phone = mask_phone(phone)

    if not api_key or not sender:
        raise SmsError(
            "Configuration SMS CinetPay incomplète (CINETPAY_SMS_API_KEY/"
            "CINETPAY_SMS_SENDER manquant(s))."
        )

    # L'API attend un numéro international sans "+" ni espaces.
    normalized_phone = "".join(ch for ch in phone if ch.isdigit())
    if not normalized_phone:
        raise SmsError("Numéro de téléphone invalide pour l'envoi SMS.")

    headers = {
        "Authorization": f"App {api_key}",
        "Content-Type": "application/json",
    }
    body = {
        "from": sender,
        "to": [normalized_phone],
        "text": message,
    }

    try:
        response = requests.post(
            CINETPAY_SMS_URL, json=body, headers=headers, timeout=REQUEST_TIMEOUT_SECONDS
        )
    except requests.RequestException as exc:
        logger.error("Erreur réseau vers CinetPay SMS (phone=%s) : %s", masked_phone, exc)
        raise SmsError(f"Erreur réseau vers CinetPay SMS : {exc}") from exc

    try:
        payload = response.json()
    except ValueError as exc:
        logger.error(
            "Réponse CinetPay SMS non-JSON (phone=%s) status=%s body=%s",
            masked_phone,
            response.status_code,
            response.text[:500],
        )
        raise SmsError("Réponse CinetPay SMS invalide (non-JSON).") from exc

    if response.status_code >= 400:
        logger.error(
            "Erreur HTTP CinetPay SMS (phone=%s) status=%s payload=%s",
            masked_phone,
            response.status_code,
            payload,
        )
        raise SmsError(
            f"Erreur HTTP CinetPay SMS (HTTP {response.status_code}).", payload=payload
        )

    messages = payload.get("messages")
    if not isinstance(messages, list) or not messages:
        logger.error(
            "Réponse CinetPay SMS sans 'messages' exploitable (phone=%s) payload=%s",
            masked_phone,
            payload,
        )
        raise SmsError("Réponse CinetPay SMS inattendue (aucun message accepté).", payload=payload)

    first = messages[0] or {}
    group_name = str((first.get("status") or {}).get("groupName") or "").upper()
    message_id = first.get("messageId")

    if group_name not in SUCCESS_GROUP_NAMES:
        logger.error(
            "Échec envoi CinetPay SMS (phone=%s) groupName=%s payload=%s",
            masked_phone,
            group_name,
            payload,
        )
        raise SmsError(
            f"Échec de l'envoi du SMS CinetPay (statut '{group_name or 'inconnu'}').",
            payload=payload,
        )

    # Jamais le contenu du message ici : uniquement métadonnées d'acheminement.
    logger.info(
        "SMS CinetPay accepté (phone=%s) groupName=%s messageId=%s",
        masked_phone,
        group_name,
        message_id,
    )
