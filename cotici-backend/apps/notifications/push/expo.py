"""Client HTTP pour l'API Expo Push Notifications.

Ce module ne contient AUCUNE logique métier (dépilement de l'outbox, mise à
jour des `PushDevice`/`PushOutbox`) : uniquement les appels HTTP bruts vers
`exp.host`, avec gestion des erreurs réseau/HTTP/JSON — même convention que
`apps/wallet/cinetpay.py`. L'orchestration (lecture de l'outbox, décision de
désactiver un device, backoff) vit dans les management commands
`push_dispatch`/`push_receipts`.

Documentation officielle : https://docs.expo.dev/push-notifications/sending-notifications/
"""
from __future__ import annotations

import logging
from typing import Any, Optional

import requests
from django.conf import settings

logger = logging.getLogger(__name__)

PUSH_SEND_URL = "https://exp.host/--/api/v2/push/send"
PUSH_RECEIPTS_URL = "https://exp.host/--/api/v2/push/getReceipts"

# L'API Expo refuse plus de 100 messages par requête `send`, et recommande de
# ne pas demander plus de ~300 receipts par appel `getReceipts`.
MAX_MESSAGES_PER_SEND_BATCH = 100
MAX_RECEIPT_IDS_PER_BATCH = 300

REQUEST_TIMEOUT_SECONDS = 10


class ExpoPushError(Exception):
    """Erreur lors d'un appel à l'API Expo Push (réseau, HTTP, JSON)."""

    def __init__(self, message: str, *, payload: Optional[dict[str, Any]] = None):
        super().__init__(message)
        self.payload = payload or {}


def _headers() -> dict[str, str]:
    headers = {
        "Accept": "application/json",
        "Accept-Encoding": "gzip, deflate",
        "Content-Type": "application/json",
    }
    access_token = getattr(settings, "EXPO_ACCESS_TOKEN", "")
    if access_token:
        headers["Authorization"] = f"Bearer {access_token}"
    return headers


def _post(url: str, body: Any) -> dict[str, Any]:
    try:
        response = requests.post(url, json=body, headers=_headers(), timeout=REQUEST_TIMEOUT_SECONDS)
    except requests.RequestException as exc:
        logger.error("Erreur réseau vers Expo Push (%s) : %s", url, exc)
        raise ExpoPushError(f"Erreur réseau vers Expo Push : {exc}") from exc

    try:
        payload = response.json()
    except ValueError as exc:
        logger.error(
            "Réponse Expo Push non-JSON (%s) status=%s body=%s",
            url,
            response.status_code,
            response.text[:500],
        )
        raise ExpoPushError("Réponse Expo Push invalide (non-JSON).") from exc

    if response.status_code >= 400:
        logger.error(
            "Erreur HTTP Expo Push (%s) status=%s payload=%s", url, response.status_code, payload
        )
        raise ExpoPushError(
            f"Erreur HTTP Expo Push (HTTP {response.status_code}).", payload=payload
        )

    return payload


def chunk(items: list, size: int) -> list[list]:
    """Découpe `items` en lots de taille max `size` (utilitaire pur, sans I/O)."""
    return [items[i : i + size] for i in range(0, len(items), size)]


def send_push_messages(messages: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Envoie un lot de messages (≤100, voir `MAX_MESSAGES_PER_SEND_BATCH`).

    Chaque message doit contenir au minimum `to` (expo token), `title`,
    `body`, `data`. Retourne la liste des "tickets" Expo (un par message,
    dans le même ordre), chacun ayant `status` ("ok"/"error") et, en cas
    d'erreur, `details.error` (ex: "DeviceNotRegistered",
    "MessageRateExceeded").

    Lève `ExpoPushError` en cas d'échec réseau/HTTP/JSON global de la
    requête (pas pour un échec individuel d'un message, reflété dans son
    ticket).
    """
    if len(messages) > MAX_MESSAGES_PER_SEND_BATCH:
        raise ValueError(
            f"send_push_messages() accepte au plus {MAX_MESSAGES_PER_SEND_BATCH} messages "
            f"par appel (reçu {len(messages)}) — utiliser expo.chunk() en amont."
        )
    payload = _post(PUSH_SEND_URL, messages)
    data = payload.get("data")
    if not isinstance(data, list):
        logger.error("Réponse Expo Push inattendue (pas de 'data' liste) : %s", payload)
        raise ExpoPushError("Réponse Expo Push inattendue.", payload=payload)
    return data


def get_push_receipts(ticket_ids: list[str]) -> dict[str, dict[str, Any]]:
    """Récupère le statut final ("receipt") d'un lot de tickets (≤300, voir
    `MAX_RECEIPT_IDS_PER_BATCH`).

    Retourne un dict `{ticket_id: receipt}`, chaque receipt ayant `status`
    ("ok"/"error") et, en cas d'erreur, `details.error` (ex:
    "DeviceNotRegistered", "MessageRateExceeded").
    """
    if len(ticket_ids) > MAX_RECEIPT_IDS_PER_BATCH:
        raise ValueError(
            f"get_push_receipts() accepte au plus {MAX_RECEIPT_IDS_PER_BATCH} tickets "
            f"par appel (reçu {len(ticket_ids)}) — utiliser expo.chunk() en amont."
        )
    payload = _post(PUSH_RECEIPTS_URL, {"ids": ticket_ids})
    data = payload.get("data")
    if not isinstance(data, dict):
        logger.error("Réponse Expo Push receipts inattendue : %s", payload)
        raise ExpoPushError("Réponse Expo Push receipts inattendue.", payload=payload)
    return data
