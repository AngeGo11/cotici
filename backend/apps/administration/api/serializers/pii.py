"""Masquage des données personnelles exposées par le back-office.

Politique du back-office, applicable à TOUS les modules : le numéro de
téléphone et l'e-mail d'un client ne sortent jamais en clair d'une route de
consultation. La seule voie de révélation est
`POST /api/admin/users/{id}/reveal-pii/`, qui exige la permission
`user.pii_reveal`, un motif, et journalise l'accès nominativement.

Cette règle n'a de valeur que si elle est appliquée partout : un numéro
laissé en clair sur l'écran des portefeuilles ou des transactions suffirait à
reconstituer un fichier clients sans jamais déclencher la moindre trace, et
viderait la permission dédiée de son sens. D'où ce module partagé plutôt
qu'un masquage réimplémenté module par module.
"""
from __future__ import annotations

from rest_framework import serializers


def mask_phone(value: str) -> str:
    """Masque un numéro en ne laissant que l'indicatif et les 2 derniers
    chiffres : `2250700123456` -> `225••••••••56`.

    Assez pour reconnaître un compte au téléphone avec le client (qui peut
    confirmer ses deux derniers chiffres), pas assez pour reconstituer un
    numéro exploitable depuis une capture d'écran ou un export.
    """
    value = (value or "").strip()
    if len(value) <= 5:
        return "•" * len(value)
    return f"{value[:3]}{'•' * (len(value) - 5)}{value[-2:]}"


def mask_email(value: str) -> str:
    """Masque la partie locale d'une adresse : `jean.dupont@x.com` ->
    `j•••••••••t@x.com`. Le domaine reste lisible (utile au support, non
    identifiant à lui seul)."""
    value = (value or "").strip()
    if "@" not in value:
        return "•" * len(value)
    local, _, domain = value.partition("@")
    if len(local) <= 2:
        return f"{'•' * len(local)}@{domain}"
    return f"{local[0]}{'•' * (len(local) - 2)}{local[-1]}@{domain}"


class MaskedPhoneField(serializers.CharField):
    """Champ en lecture seule renvoyant un numéro masqué.

    Le nom du champ exposé doit rester explicite (`..._masque`) : un champ
    nommé `numero_telephone` qui renvoie une valeur masquée induirait en
    erreur le prochain développeur, qui pourrait le croire exploitable.
    """

    def __init__(self, **kwargs):
        kwargs.setdefault("read_only", True)
        super().__init__(**kwargs)

    def to_representation(self, value) -> str:
        return mask_phone(str(value or ""))
