"""Couche d'accès aux données pour les notifications.

`NotificationRepository` est le SEUL point d'accès en lecture aux
notifications : `for_user` filtre systématiquement par `destinataire=user`,
ce qui garantit qu'aucun appelant ne peut, par erreur, exposer les
notifications d'un autre utilisateur (protection IDOR).
"""
from __future__ import annotations

from typing import Optional

from django.db import IntegrityError, transaction
from django.db.models import QuerySet
from django.utils import timezone

from apps.notifications.domain.catalog import NotificationSpec
from apps.notifications.models import NotificationPreference, Notifications, PushOutbox


class NotificationRepository:
    """Accès bas niveau au modèle `Notifications`."""

    @staticmethod
    def create(destinataire, spec: NotificationSpec, expediteur=None) -> Notifications:
        """Crée une notification (non idempotente)."""
        return Notifications.objects.create(
            destinataire=destinataire,
            expediteur=expediteur,
            category=spec.category,
            objet=spec.objet,
            contenu=spec.contenu,
            source_type=spec.source_type,
            source_id=spec.source_id,
            dedup_key=spec.dedup_key,
        )

    @staticmethod
    def get_or_create_by_dedup(
        destinataire, spec: NotificationSpec, expediteur=None
    ) -> tuple[Notifications, bool]:
        """Crée la notification si `spec.dedup_key` n'existe pas déjà, sinon la retourne.

        S'appuie sur la contrainte `unique=True` de `Notifications.dedup_key`
        (NULL exclu de l'unicité côté PostgreSQL) : deux exécutions du même
        rappel (ex. cron relancé) ne créent jamais de doublon.
        """
        if not spec.dedup_key:
            raise ValueError("emit_idempotent nécessite un spec.dedup_key non vide.")

        existing = Notifications.objects.filter(dedup_key=spec.dedup_key).first()
        if existing is not None:
            return existing, False

        try:
            # Savepoint imbriqué : si la contrainte unique sur dedup_key est violée
            # (course entre deux appels concurrents), seul CE savepoint est annulé —
            # la transaction englobante (celle du call site métier, ou celle de
            # NotificationService.emit_idempotent) reste saine pour la suite.
            with transaction.atomic():
                notif = NotificationRepository.create(destinataire, spec, expediteur=expediteur)
            return notif, True
        except IntegrityError:
            # Course entre deux appels concurrents sur la même dedup_key : l'un des
            # deux perd la contrainte unique, on retombe alors sur la ligne créée
            # par l'autre plutôt que de propager l'erreur.
            existing = Notifications.objects.get(dedup_key=spec.dedup_key)
            return existing, False

    @staticmethod
    def get_preference(user) -> Optional[NotificationPreference]:
        """Préférences push de l'utilisateur, ou None si jamais configurées
        (l'appelant doit alors se rabattre sur les valeurs par défaut :
        push activé, aucune catégorie mutée, pas de quiet hours)."""
        return NotificationPreference.objects.filter(user=user).first()

    @staticmethod
    def create_push_outbox(
        notification: Optional[Notifications],
        destinataire,
        spec: NotificationSpec,
        *,
        next_attempt_at,
    ) -> PushOutbox:
        """Enfile une entrée `PushOutbox` dans le même savepoint que la notification.

        `data` porte le payload de deep-link consommé par le mobile (contrat
        API figé) : `source_type`, `source_id`, `category`, `notification_id`.
        """
        return PushOutbox.objects.create(
            notification=notification,
            destinataire=destinataire,
            titre=spec.objet,
            corps=spec.contenu,
            data={
                "source_type": spec.source_type,
                "source_id": spec.source_id,
                "category": spec.category,
                "notification_id": notification.id if notification else None,
            },
            next_attempt_at=next_attempt_at,
        )

    @staticmethod
    def for_user(user) -> QuerySet:
        """Seul point d'accès en lecture : toujours filtré par destinataire."""
        return Notifications.objects.filter(destinataire=user).select_related(
            "expediteur", "destinataire"
        )

    @staticmethod
    def unread_count(user) -> int:
        return NotificationRepository.for_user(user).filter(est_lue=False).count()

    @staticmethod
    def mark_read(user, notif_id) -> int:
        """Marque une notification comme lue. Retourne le nombre de lignes affectées.

        Le filtre `destinataire=user` garantit qu'un utilisateur ne peut jamais
        marquer comme lue la notification d'un autre (0 ligne affectée, donc un
        404 naturel côté vue). `update()` compte les lignes matchées même si
        `est_lue` était déjà `True` : rejouer l'appel reste sans effet de bord
        et ne doit pas être interprété à tort comme "notification introuvable".
        """
        return NotificationRepository.for_user(user).filter(pk=notif_id).update(
            est_lue=True, date_lecture=timezone.now()
        )

    @staticmethod
    def mark_all_read(user) -> int:
        return NotificationRepository.for_user(user).filter(est_lue=False).update(
            est_lue=True, date_lecture=timezone.now()
        )
