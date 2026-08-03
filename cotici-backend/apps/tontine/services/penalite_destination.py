"""Point d'extension UNIQUE : destinataire financier d'une pénalité de retard.

**Contexte** : la destination des pénalités (bénéficiaire du tour / caisse de
la plateforme / caisse de secours mutualisée) est en cours d'arbitrage par un
analyste métier au moment de l'écriture de ce module. Le comportement
HISTORIQUE (verser au bénéficiaire du tour) reste le défaut et ne doit
JAMAIS être modifié tant qu'aucun arbitrage n'a été tranché — mais tout le
reste du code (`penalties_service`, `cloture_service`, `dette_service`) doit
appeler cette fonction plutôt que de coder en dur `tour.user`, pour qu'un
futur changement de politique se fasse en un seul endroit.

Toute nouvelle stratégie ajoutée ici doit :
- rester une fonction PURE en tout sauf sa résolution de `Wallet` (get_or_create
  reste nécessaire, un wallet peut ne pas encore exister) ;
- ne jamais lever d'exception silencieuse : une valeur de configuration
  invalide doit faire échouer bruyamment (`ValueError`), jamais retomber
  silencieusement sur le bénéficiaire du tour (un mauvais réglage ne doit pas
  se traduire par un versement invisible à la mauvaise personne).
"""
from __future__ import annotations

from enum import Enum

from django.conf import settings

from apps.wallet.models import Wallet


class StrategieDestinationPenalite(str, Enum):
    """Stratégies disponibles. Une seule est active à la fois, via
    `settings.PENALITE_DESTINATION_STRATEGY` (chaîne, valeur par défaut
    `BENEFICIAIRE_TOUR` — comportement historique)."""

    BENEFICIAIRE_TOUR = "beneficiaire_tour"
    # Réservées pour un futur arbitrage métier : NON implémentées
    # intentionnellement (lever `NotImplementedError` explicite plutôt que de
    # deviner un comportement non spécifié par le métier).
    PLATEFORME = "plateforme"
    CAISSE_SECOURS_MUTUALISEE = "caisse_secours_mutualisee"


def resoudre_wallet_destinataire_penalite(tour) -> Wallet:
    """Résout (et verrouille — appelant responsable du `select_for_update`
    équivalent, voir `penalties_service._executer_prelevement`) le wallet
    devant recevoir le produit d'une pénalité constatée sur `tour`.

    `tour` : instance `TourTontine` (déjà chargée, verrouillée ou non selon
    l'appelant). Retourne le `Wallet` (get_or_create, jamais verrouillé
    ici : c'est à l'appelant transactionnel de poser le `select_for_update`
    dans l'ordre canonique documenté par son propre module).
    """
    strategie = getattr(
        settings, "PENALITE_DESTINATION_STRATEGY", StrategieDestinationPenalite.BENEFICIAIRE_TOUR
    )
    if strategie == StrategieDestinationPenalite.BENEFICIAIRE_TOUR:
        wallet, _ = Wallet.objects.get_or_create(user_id=tour.user_id)
        return wallet
    raise NotImplementedError(
        f"Stratégie de destination de pénalité non implémentée : {strategie!r}. "
        "Seule 'beneficiaire_tour' (défaut, comportement historique) est "
        "supportée tant que l'arbitrage métier n'a pas tranché une autre "
        "destination (plateforme / caisse de secours mutualisée)."
    )


def resoudre_user_id_destinataire_penalite(tour) -> int:
    """Variante retournant l'`user_id` cible, utile pour décider AVANT
    verrouillage si le destinataire coïncide avec le fautif (auto-pénalisation,
    cf. `penalties_service._executer_prelevement`) sans forcer un aller-retour
    DB supplémentaire sur `Wallet` avant d'en avoir besoin."""
    strategie = getattr(
        settings, "PENALITE_DESTINATION_STRATEGY", StrategieDestinationPenalite.BENEFICIAIRE_TOUR
    )
    if strategie == StrategieDestinationPenalite.BENEFICIAIRE_TOUR:
        return tour.user_id
    raise NotImplementedError(
        f"Stratégie de destination de pénalité non implémentée : {strategie!r}."
    )
