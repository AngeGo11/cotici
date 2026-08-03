"""Couche service pour les notifications in-app et le push Expo.

`NotificationService.emit` est conçu pour être appelé DEPUIS le bloc
`transaction.atomic()` du call site métier (dépôt, cotisation, versement...),
mais ne doit jamais faire échouer cette transaction : une notification ratée
est une dégradation silencieuse acceptable, pas une raison d'annuler un
paiement déjà validé.
"""
from __future__ import annotations

import logging
from typing import Sequence

from django.db import transaction
from django.db.models import QuerySet
from django.utils import timezone

from apps.notifications.domain.catalog import NotificationSpec
from apps.notifications.domain.preferences import next_send_time, push_allowed_for_category
from apps.notifications.models import NotificationPreference, Notifications, PushOutbox
from apps.notifications.repositories.notification_repository import NotificationRepository

logger = logging.getLogger(__name__)


class NotificationService:

    @staticmethod
    def _enqueue_push_if_allowed(notification: Notifications, destinataire, spec: NotificationSpec) -> None:
        """Crée la ligne `PushOutbox`, si et seulement si les préférences de
        `destinataire` l'autorisent pour `spec.category`.

        Décision prise ICI, dans le service — jamais dans le repository (qui
        doit rester sans logique métier, seulement le garant anti-IDOR) ni au
        moment de l'envoi effectif (`push_dispatch`), sinon des lignes mortes
        s'accumuleraient dans l'outbox pour des catégories désactivées.

        La ligne `Notifications` (journal in-app) a, elle, TOUJOURS déjà été
        créée par l'appelant avant ce point : désactiver une catégorie coupe
        le push, jamais l'historique.
        """
        pref = NotificationRepository.get_preference(destinataire)
        push_enabled = pref.push_enabled if pref else True
        categories_muted = pref.categories_muted if pref else []

        if not push_allowed_for_category(
            spec.category, push_enabled=push_enabled, categories_muted=categories_muted
        ):
            return

        quiet_start = pref.quiet_hours_start if pref else None
        quiet_end = pref.quiet_hours_end if pref else None
        send_at = next_send_time(
            timezone.now(),
            category=spec.category,
            quiet_hours_start=quiet_start,
            quiet_hours_end=quiet_end,
        )
        NotificationRepository.create_push_outbox(notification, destinataire, spec, next_attempt_at=send_at)

    @staticmethod
    def emit(destinataire, spec: NotificationSpec, expediteur=None) -> None:
        """Émet une notification événementielle (non idempotente) + son push éventuel.

        Erreurs avalées et journalisées : voir la note de module. Ne jamais
        laisser une exception ici remonter jusqu'au call site métier.

        Important : `emit()` est typiquement appelé DEPUIS le
        `transaction.atomic()` du call site métier (paiement, cotisation...).
        Sous PostgreSQL, une exception non rattrapée par un `atomic()` imbriqué
        (savepoint) laisse la transaction englobante dans un état "cassé" —
        même si l'exception Python est avalée ici, le COMMIT du paiement
        échouerait ensuite. D'où le `transaction.atomic()` imbriqué : en cas
        d'échec, seul ce savepoint est annulé, la transaction du call site
        métier reste saine.
        """
        try:
            with transaction.atomic():
                notif = NotificationRepository.create(destinataire, spec, expediteur=expediteur)
                NotificationService._enqueue_push_if_allowed(notif, destinataire, spec)
        except Exception:
            logger.exception(
                "Échec d'émission de notification (category=%s, destinataire_id=%s) — "
                "opération métier non impactée.",
                spec.category,
                getattr(destinataire, "id", None),
            )

    @staticmethod
    def emit_idempotent(destinataire, spec: NotificationSpec, expediteur=None) -> None:
        """Émet une notification idempotente (rappel), via `spec.dedup_key`.

        Le push n'est enfilé QUE lors de la première émission (`created`
        vrai) : rejouer un rappel déjà notifié ne doit jamais créer une
        deuxième entrée d'outbox.

        Voir `emit()` pour la justification du savepoint imbriqué.
        """
        try:
            with transaction.atomic():
                notif, created = NotificationRepository.get_or_create_by_dedup(
                    destinataire, spec, expediteur=expediteur
                )
                if created:
                    NotificationService._enqueue_push_if_allowed(notif, destinataire, spec)
        except Exception:
            logger.exception(
                "Échec d'émission de notification idempotente "
                "(category=%s, dedup_key=%s, destinataire_id=%s) — opération non impactée.",
                spec.category,
                spec.dedup_key,
                getattr(destinataire, "id", None),
            )

    @staticmethod
    def bulk_emit_idempotent(
        items: Sequence[tuple],
        expediteur=None,
    ) -> int:
        """Émission idempotente en lot, pour les jobs de notification (rappels).

        `items` est une séquence de tuples `(destinataire, spec)`, tous avec
        `spec.dedup_key` renseigné. Conçu pour tenir en une poignée de
        requêtes quel que soit le nombre d'éléments (au contraire d'une boucle
        appelant `emit_idempotent` un par un, qui referait une requête par
        item) :

        1. une requête pour connaître les `dedup_key` déjà présentes ;
        2. un `bulk_create(ignore_conflicts=True)` pour les nouvelles lignes ;
        3. un re-SELECT par `dedup_key__in` — sous `ignore_conflicts=True`,
           PostgreSQL ne renseigne PAS les PK des objets insérés en mémoire ;
           c'est le seul moyen de récupérer les PK pour lier `PushOutbox`
           (traçabilité `PushOutbox.notification`) ;
        4. une requête pour charger les préférences des destinataires concernés ;
        5. un `bulk_create` pour les entrées `PushOutbox` autorisées.

        Retourne le nombre de notifications effectivement créées (hors
        doublons déjà existants). Ne avale PAS les exceptions : appelé
        exclusivement depuis des management commands qui gèrent elles-mêmes
        leur `JobRun` (visibilité opérationnelle > résilience silencieuse ici).
        """
        items = [(user, spec) for user, spec in items if user is not None and spec.dedup_key]
        if not items:
            return 0

        dedup_keys = [spec.dedup_key for _, spec in items]
        existing_keys = set(
            Notifications.objects.filter(dedup_key__in=dedup_keys).values_list("dedup_key", flat=True)
        )
        new_items = [(user, spec) for user, spec in items if spec.dedup_key not in existing_keys]
        if not new_items:
            return 0

        with transaction.atomic():
            to_create = [
                Notifications(
                    destinataire=user,
                    expediteur=expediteur,
                    category=spec.category,
                    objet=spec.objet,
                    contenu=spec.contenu,
                    source_type=spec.source_type,
                    source_id=spec.source_id,
                    dedup_key=spec.dedup_key,
                )
                for user, spec in new_items
            ]
            Notifications.objects.bulk_create(to_create, ignore_conflicts=True)

            new_keys = [spec.dedup_key for _, spec in new_items]
            created_by_key = {
                n.dedup_key: n
                for n in Notifications.objects.filter(dedup_key__in=new_keys)
            }

            user_ids = {user.id for user, _ in new_items}
            prefs_by_user = {
                pref.user_id: pref
                for pref in NotificationPreference.objects.filter(user_id__in=user_ids)
            }

            now = timezone.now()
            outbox_to_create = []
            for user, spec in new_items:
                notif = created_by_key.get(spec.dedup_key)
                if notif is None:
                    # Course avec un autre process entre l'étape 1 et le
                    # bulk_create : le doublon a été absorbé par
                    # `ignore_conflicts`, on ne peut pas le relier ; sans
                    # gravité, la notification existe déjà de toute façon.
                    continue
                pref = prefs_by_user.get(user.id)
                push_enabled = pref.push_enabled if pref else True
                categories_muted = pref.categories_muted if pref else []
                if not push_allowed_for_category(
                    spec.category, push_enabled=push_enabled, categories_muted=categories_muted
                ):
                    continue
                send_at = next_send_time(
                    now,
                    category=spec.category,
                    quiet_hours_start=pref.quiet_hours_start if pref else None,
                    quiet_hours_end=pref.quiet_hours_end if pref else None,
                )
                outbox_to_create.append(
                    PushOutbox(
                        notification=notif,
                        destinataire=user,
                        titre=spec.objet,
                        corps=spec.contenu,
                        data={
                            "source_type": spec.source_type,
                            "source_id": spec.source_id,
                            "category": spec.category,
                            "notification_id": notif.id,
                        },
                        next_attempt_at=send_at,
                    )
                )
            if outbox_to_create:
                PushOutbox.objects.bulk_create(outbox_to_create)

        return len(new_items)

    @staticmethod
    def list_for_user(user, only_unread: bool = False) -> QuerySet:
        qs = NotificationRepository.for_user(user)
        if only_unread:
            qs = qs.filter(est_lue=False)
        return qs

    @staticmethod
    def unread_count(user) -> int:
        return NotificationRepository.unread_count(user)

    @staticmethod
    def mark_read(user, notif_id) -> int:
        return NotificationRepository.mark_read(user, notif_id)

    @staticmethod
    def mark_all_read(user) -> int:
        return NotificationRepository.mark_all_read(user)
