"""Examen des dossiers KYC depuis le back-office.

La règle centrale du module : **une décision est définitive et imputable.**
Approuver ou rejeter fige le dossier (statut, décideur, horodatage, motif) ;
un client qui doit corriger son dossier en soumet un nouveau. Autoriser la
réécriture d'une décision reviendrait à rendre le journal non opposable — un
dossier approuvé pourrait être requalifié après coup sans trace.
"""
from __future__ import annotations

from django.db import transaction
from django.db.models import Q
from django.utils import timezone

from apps.kyc.models import KycSubmission


class DecisionDejaPriseError(Exception):
    """Levée lorsqu'un dossier déjà décidé fait l'objet d'une seconde décision."""


def list_submissions(*, statut: str = "", niveau: str = "", search: str = ""):
    """File d'examen.

    Tri par ancienneté croissante : un dossier KYC qui traîne bloque un client
    qui ne peut pas transacter. Le plus ancien passe donc en premier, et ce
    tri n'est pas configurable depuis l'API — c'est une règle de service, pas
    une préférence d'affichage.
    """
    queryset = KycSubmission.objects.select_related("user", "decide_par")

    if statut:
        queryset = queryset.filter(statut=statut)
    if niveau:
        queryset = queryset.filter(niveau_demande=niveau)
    if search:
        # Le numéro de téléphone est volontairement absent des critères : il
        # est masqué partout dans ce module, le rendre cherchable rouvrirait
        # la voie d'énumération que le masquage ferme.
        queryset = queryset.filter(
            Q(nom_declare__icontains=search)
            | Q(prenoms_declares__icontains=search)
            | Q(numero_piece__iexact=search)
            | Q(user__username__icontains=search)
        )
    return queryset.order_by("date_soumission")


def _assert_decidable(submission: KycSubmission) -> None:
    if submission.est_decide:
        raise DecisionDejaPriseError(
            "Ce dossier a déjà été décidé. Le client doit soumettre un nouveau dossier."
        )


@transaction.atomic
def approve(*, submission: KycSubmission, decide_par, niveau: str, motif: str) -> KycSubmission:
    """Approuve un dossier, éventuellement à un palier inférieur au demandé."""
    _assert_decidable(submission)
    submission.statut = KycSubmission.Statut.APPROUVE
    submission.niveau_accorde = niveau or submission.niveau_demande
    submission.motif_decision = motif
    submission.decide_par = decide_par
    submission.date_decision = timezone.now()
    submission.save(
        update_fields=[
            "statut",
            "niveau_accorde",
            "motif_decision",
            "decide_par",
            "date_decision",
        ]
    )
    return submission


@transaction.atomic
def reject(*, submission: KycSubmission, decide_par, motif: str) -> KycSubmission:
    """Rejette un dossier. Le motif est repris tel quel dans la notification
    au client : il doit être compréhensible par lui, pas seulement par un
    opérateur."""
    _assert_decidable(submission)
    submission.statut = KycSubmission.Statut.REJETE
    submission.motif_decision = motif
    submission.niveau_accorde = ""
    submission.decide_par = decide_par
    submission.date_decision = timezone.now()
    submission.save(
        update_fields=[
            "statut",
            "motif_decision",
            "niveau_accorde",
            "decide_par",
            "date_decision",
        ]
    )
    return submission


@transaction.atomic
def take_in_review(*, submission: KycSubmission) -> KycSubmission:
    """Marque un dossier comme "en cours d'examen".

    Sert à éviter que deux opérateurs traitent le même dossier en parallèle.
    Volontairement non bloquant (pas de verrou exclusif) : un opérateur
    indisponible ne doit pas geler un dossier indéfiniment.
    """
    if submission.statut == KycSubmission.Statut.EN_ATTENTE:
        submission.statut = KycSubmission.Statut.EN_EXAMEN
        submission.save(update_fields=["statut"])
    return submission


def niveau_verifie_pour(user) -> str:
    """Palier effectivement acquis par un utilisateur.

    Déduit des dossiers approuvés plutôt que stocké sur le `User` : un champ
    dénormalisé finirait par diverger de la file d'examen (approbation
    annulée, dossier supprimé, migration partielle...).
    """
    niveaux = list(
        KycSubmission.objects.filter(
            user=user, statut=KycSubmission.Statut.APPROUVE
        ).values_list("niveau_accorde", flat=True)
    )
    if not niveaux:
        return ""
    # Les codes NIVEAU_1..3 sont ordonnables lexicographiquement.
    return max(niveaux)
