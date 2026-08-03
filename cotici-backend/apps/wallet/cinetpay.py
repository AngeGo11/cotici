"""Client HTTP pour l'agrégateur Mobile Money CinetPay.

Regroupe DEUX API CinetPay distinctes, chacune avec son propre host et son
propre mécanisme d'authentification :

* Checkout API v2 (`api-checkout.cinetpay.com`) : utilisée pour le DÉPÔT
  (`initiate_payment`/`check_payment`). Authentification par `apikey`+
  `site_id` envoyés dans chaque body.
* Transfer/PayOut API v1 (`client.cinetpay.com`) : utilisée pour le RETRAIT
  (`get_transfer_token`/`add_contact`/`send_money_to_contact`/
  `check_transfer`). Authentification par token de session obtenu via
  `/v1/auth/login`, avec un mot de passe de transfert DISTINCT du mot de
  passe marchand (`CINETPAY_TRANSFER_PASSWORD`).

Ce module ne contient AUCUNE logique métier (crédit/débit de wallet, création
ou mise à jour de `Transaction`) : uniquement les appels HTTP bruts vers
l'API CinetPay, avec gestion des erreurs réseau/HTTP/JSON. L'orchestration
métier (initiation du dépôt/retrait, traitement des webhooks) vit dans
`apps/wallet/views.py`.

Documentation officielle : https://docs.cinetpay.com

Règle de sécurité CENTRALE (rappelée ici volontairement, valable pour le
dépôt ET le retrait) : le POST reçu sur `notify_url` par CinetPay n'est
qu'un ping de synchronisation, jamais une preuve de paiement/transfert.
Avant de créditer OU de finaliser un retrait, l'appelant DOIT toujours
rappeler `check_payment()`/`check_transfer()` pour obtenir le statut réel
depuis l'API CinetPay et ne jamais faire confiance au corps du webhook.

Contraintes opérationnelles côté Transfer/PayOut (à valider en sandbox
CinetPay réel avant mise en production, non vérifiables depuis ce dépôt) :
- Le solde PayOut (utilisé pour les retraits) est un compte marchand SÉPARÉ
  du solde Checkout (utilisé pour les dépôts) : il doit être rechargé
  indépendamment, sinon tout envoi échoue avec le code 602.
- Un transfert peut nécessiter une confirmation manuelle côté back-office
  CinetPay, sauf si l'IP publique de ce serveur a été whitelistée par
  CinetPay pour la confirmation automatique.
- Le token de session (`get_transfer_token`) expire au bout de 5 minutes :
  ce module ne le met PAS en cache et ré-authentifie systématiquement avant
  chaque opération, par simplicité et sécurité (marge large plutôt que de
  gérer une expiration précise).
"""
from __future__ import annotations

import logging
from decimal import Decimal
from typing import Any, Optional

import requests
from django.conf import settings

logger = logging.getLogger(__name__)

INIT_PAYMENT_URL = "https://api-checkout.cinetpay.com/v2/payment"
CHECK_PAYMENT_URL = "https://api-checkout.cinetpay.com/v2/payment/check"

TRANSFER_LOGIN_URL = "https://client.cinetpay.com/v1/auth/login"
TRANSFER_CONTACT_URL = "https://client.cinetpay.com/v1/transfer/contact"
TRANSFER_SEND_URL = "https://client.cinetpay.com/v1/transfer/money/send/contact"
TRANSFER_CHECK_URL = "https://client.cinetpay.com/v1/transfer/check/money"

# Codes d'erreur CinetPay connus et documentés pour l'API Transfer/PayOut,
# utilisés pour produire des logs/messages explicites (distinguer notamment
# le solde PayOut marchand — 602 — du solde de l'utilisateur, deux notions
# totalement différentes qu'il ne faut jamais confondre dans les logs).
TRANSFER_ERROR_MESSAGES: dict[str, str] = {
    "602": (
        "Solde PayOut marchand insuffisant (compte de transfert CinetPay, "
        "distinct du solde de l'utilisateur COTICI)."
    ),
    "701": "Identifiants de transfert CinetPay invalides (apikey/mot de passe de transfert).",
    "723": "Ressource introuvable côté CinetPay (contact ou transaction de transfert).",
}

# Délai raisonnable pour ne pas bloquer indéfiniment une requête HTTP entrante
# (init) ou le traitement du webhook (check) en cas de lenteur/indisponibilité
# côté CinetPay.
REQUEST_TIMEOUT_SECONDS = 10


class CinetPayError(Exception):
    """Erreur lors d'un appel à l'API CinetPay.

    Couvre aussi bien les erreurs réseau/HTTP/JSON que les réponses
    applicatives CinetPay signalant un échec (`code` différent du code de
    succès attendu). `payload` conserve, quand disponible, le corps JSON
    décodé retourné par CinetPay pour faciliter le diagnostic/logging côté
    appelant.
    """

    def __init__(self, message: str, *, payload: Optional[dict[str, Any]] = None):
        super().__init__(message)
        self.payload = payload or {}


def _request(url: str, *, json_body: Optional[dict[str, Any]] = None, form_body: Optional[dict[str, Any]] = None) -> dict[str, Any]:
    """POST générique vers l'API CinetPay (JSON ou x-www-form-urlencoded selon
    l'endpoint appelé), avec gestion d'erreurs uniforme. Usage interne : voir
    `_post`/`_post_form`."""
    try:
        if form_body is not None:
            response = requests.post(url, data=form_body, timeout=REQUEST_TIMEOUT_SECONDS)
        else:
            response = requests.post(url, json=json_body or {}, timeout=REQUEST_TIMEOUT_SECONDS)
    except requests.RequestException as exc:
        logger.error("Erreur réseau vers CinetPay (%s) : %s", url, exc)
        raise CinetPayError(f"Erreur réseau vers CinetPay : {exc}") from exc

    try:
        payload = response.json()
    except ValueError as exc:
        logger.error(
            "Réponse CinetPay non-JSON (%s) status=%s body=%s",
            url,
            response.status_code,
            response.text[:500],
        )
        raise CinetPayError("Réponse CinetPay invalide (non-JSON).") from exc

    if response.status_code >= 500:
        logger.error(
            "Erreur serveur CinetPay (%s) status=%s payload=%s", url, response.status_code, payload
        )
        raise CinetPayError(
            f"Erreur serveur CinetPay (HTTP {response.status_code}).", payload=payload
        )

    return payload


def _post(url: str, body: dict[str, Any]) -> dict[str, Any]:
    """POST JSON générique vers l'API CinetPay, avec gestion d'erreurs uniforme."""
    return _request(url, json_body=body)


def _post_form(url: str, body: dict[str, Any]) -> dict[str, Any]:
    """POST x-www-form-urlencoded générique vers l'API CinetPay.

    Réservé à l'authentification transfert (`/v1/auth/login`), qui n'accepte
    pas de body JSON contrairement au reste des API CinetPay utilisées ici.
    """
    return _request(url, form_body=body)


def initiate_payment(
    *,
    transaction_id: str,
    amount: Decimal,
    currency: str,
    notify_url: str,
    return_url: str,
    channels: str = "MOBILE_MONEY",
    description: str = "Dépôt COTICI",
) -> dict[str, Any]:
    """Initialise un paiement Checkout CinetPay (`POST /v2/payment`).

    `transaction_id` doit être notre `ref_transaction` (déjà compatible avec
    les contraintes CinetPay : pas de `#,/,$,_,&`, cf. `_unique_ref`).
    `amount` est converti en entier (le compte COTICI ne manipule que des
    montants XOF sans décimales, cf. `Transaction.montant_transaction`).

    Retourne le payload JSON décodé en cas de succès (`code == "201"`).
    Lève `CinetPayError` pour toute autre issue (réseau, HTTP, JSON, ou
    réponse applicative en échec).
    """
    body = {
        "apikey": settings.CINETPAY_API_KEY,
        "site_id": settings.CINETPAY_SITE_ID,
        "transaction_id": transaction_id,
        "amount": int(amount),
        "currency": currency,
        "notify_url": notify_url,
        "return_url": return_url,
        "channels": channels,
        "description": description,
    }
    payload = _post(INIT_PAYMENT_URL, body)
    if str(payload.get("code")) != "201":
        logger.error(
            "Échec initialisation CinetPay transaction_id=%s payload=%s", transaction_id, payload
        )
        raise CinetPayError(
            payload.get("message") or "Échec de l'initialisation du paiement CinetPay.",
            payload=payload,
        )
    return payload


def check_payment(transaction_id: str) -> dict[str, Any]:
    """Vérifie le statut réel d'une transaction CinetPay (`POST /v2/payment/check`).

    C'est la SEULE source de vérité sur l'issue d'un paiement : ne jamais
    créditer un wallet sur la seule foi du POST reçu sur `notify_url`.

    Retourne le payload JSON décodé (l'appelant doit inspecter
    `payload["code"]` == "00" et `payload["data"]["status"]`, ex "ACCEPTED").
    Lève `CinetPayError` en cas d'échec réseau/HTTP/JSON — l'appelant décide
    alors s'il faut demander à CinetPay de retenter le webhook plus tard.
    """
    body = {
        "apikey": settings.CINETPAY_API_KEY,
        "site_id": settings.CINETPAY_SITE_ID,
        "transaction_id": transaction_id,
    }
    return _post(CHECK_PAYMENT_URL, body)


# --------------------------------------------------------------------------
# Transfer / PayOut API v1 (retrait) — host et authentification distincts de
# la Checkout API ci-dessus. Voir docstring de module pour le détail.
# --------------------------------------------------------------------------


def get_transfer_token() -> str:
    """Authentifie le compte de transfert CinetPay (`POST /v1/auth/login`).

    Utilise `CINETPAY_TRANSFER_PASSWORD`, un mot de passe DISTINCT de
    `CINETPAY_API_KEY`/`CINETPAY_SITE_ID` (identifiants Checkout). Requête en
    x-www-form-urlencoded (la seule route CinetPay utilisée ici qui n'accepte
    pas de JSON).

    Retourne le token de session (valable ~5 minutes). Lève `CinetPayError`
    en cas d'échec réseau/HTTP/JSON ou de réponse applicative en échec
    (ex : code 701, identifiants invalides).
    """
    body = {
        "apikey": settings.CINETPAY_API_KEY,
        "password": settings.CINETPAY_TRANSFER_PASSWORD,
    }
    payload = _post_form(TRANSFER_LOGIN_URL, body)
    code = str(payload.get("code"))
    if code != "0":
        logger.error("Échec authentification transfert CinetPay : %s", payload)
        message = TRANSFER_ERROR_MESSAGES.get(code) or payload.get("message")
        raise CinetPayError(
            message or "Échec de l'authentification au transfert CinetPay.", payload=payload
        )

    token = (payload.get("data") or {}).get("token")
    if not token:
        logger.error("Token de transfert CinetPay absent de la réponse : %s", payload)
        raise CinetPayError("Token de transfert CinetPay absent de la réponse.", payload=payload)
    return token


def add_contact(
    *,
    token: str,
    prefix: str,
    phone: str,
    name: str,
    surname: str,
    email: str = "",
) -> dict[str, Any]:
    """Ajoute (ou confirme l'existence de) un contact bénéficiaire
    (`POST /v1/transfer/contact`).

    Un numéro doit être présent dans la liste de contacts du marchand AVANT
    de pouvoir recevoir un transfert. Un contact déjà existant est traité
    comme un succès (ne doit jamais faire échouer le retrait) : on inspecte
    le code applicatif top-level, puis — si CinetPay détaille un résultat par
    contact dans `data` — le code/message de la première entrée, en
    reconnaissant toute mention explicite de doublon ("EXIST").
    """
    body = {
        "token": token,
        "data": [
            {
                "prefix": prefix,
                "phone": phone,
                "name": name,
                "surname": surname,
                "email": email,
            }
        ],
    }
    payload = _post(TRANSFER_CONTACT_URL, body)
    top_code = str(payload.get("code"))
    top_message = str(payload.get("message") or "")

    if top_code == "0":
        return payload

    if "EXIST" in top_message.upper():
        logger.info("Contact CinetPay déjà présent (phone=%s), traité comme succès.", phone)
        return payload

    contact_results = payload.get("data")
    if isinstance(contact_results, list) and contact_results:
        first = contact_results[0]
        if isinstance(first, dict):
            first_code = str(first.get("code"))
            first_message = str(first.get("message") or "")
            if first_code == "0" or "EXIST" in first_message.upper():
                logger.info(
                    "Contact CinetPay déjà présent ou ajouté (phone=%s) : %s", phone, first
                )
                return payload

    logger.error("Échec ajout contact CinetPay phone=%s payload=%s", phone, payload)
    message = TRANSFER_ERROR_MESSAGES.get(top_code) or top_message
    raise CinetPayError(message or "Échec de l'ajout du contact CinetPay.", payload=payload)


def send_money_to_contact(
    *,
    token: str,
    prefix: str,
    phone: str,
    amount: Decimal,
    client_transaction_id: str,
    notify_url: str,
) -> dict[str, Any]:
    """Envoie un transfert d'argent vers un contact déjà ajouté
    (`POST /v1/transfer/money/send/contact`).

    `client_transaction_id` doit être notre `ref_transaction` (identifiant
    utilisé pour retrouver la transaction lors du webhook/`check_transfer`).
    `amount` est converti en entier (montants XOF sans décimales, cf.
    `Transaction.montant_transaction`).

    Retourne le payload JSON décodé en cas de succès (`code == "0"`). Lève
    `CinetPayError` pour toute autre issue — notamment le code 602
    (solde PayOut marchand insuffisant, à ne pas confondre avec le solde de
    l'utilisateur COTICI).
    """
    body = {
        "token": token,
        "data": [
            {
                "prefix": prefix,
                "phone": phone,
                "amount": int(amount),
                "client_transaction_id": client_transaction_id,
                "notify_url": notify_url,
            }
        ],
    }
    payload = _post(TRANSFER_SEND_URL, body)
    code = str(payload.get("code"))
    if code != "0":
        logger.error(
            "Échec envoi transfert CinetPay client_transaction_id=%s payload=%s",
            client_transaction_id,
            payload,
        )
        message = TRANSFER_ERROR_MESSAGES.get(code) or payload.get("message")
        raise CinetPayError(message or "Échec de l'envoi du transfert CinetPay.", payload=payload)
    return payload


def check_transfer(*, token: str, client_transaction_id: str) -> dict[str, Any]:
    """Vérifie le statut réel d'un transfert CinetPay
    (`POST /v1/transfer/check/money`).

    C'est la SEULE source de vérité sur l'issue d'un retrait : ne jamais
    finaliser (succès ou échec) un retrait sur la seule foi du POST reçu sur
    `notify_url`. Le champ décisif de la réponse est `treatment_status`
    (ex : "NEW", "IN PROGRESS", "VALIDATED", "REJECTED" — l'appelant décide
    de l'interprétation).

    Retourne le payload JSON décodé. Lève `CinetPayError` en cas d'échec
    réseau/HTTP/JSON — l'appelant décide alors s'il faut demander à CinetPay
    de retenter le webhook plus tard.
    """
    body = {
        "token": token,
        "client_transaction_id": client_transaction_id,
    }
    return _post(TRANSFER_CHECK_URL, body)
