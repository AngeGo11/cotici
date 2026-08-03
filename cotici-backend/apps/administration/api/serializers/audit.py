"""Serializers du journal d'audit unifié (`/api/admin/audit/`).

L'écran d'audit affiche une seule table mélangeant deux journaux de formes
différentes : `AuditLog` (actions "métier" de l'app mobile) et
`AdminActionLog` (actions back-office). Le serializer les **aplatit** en une
entrée unique et homogène.

C'est un choix délibéré : renvoyer l'enveloppe `{source, timestamp, data}`
avec la forme d'origine dans `data` obligerait chaque consommateur à
connaître les deux schémas et à brancher sur `source` — exactement la
complexité que cet écran unifié doit absorber. Les champs propres à une
source (statut applicatif, before/after, chemin HTTP...) ne sont pas perdus :
ils partent dans `metadata`, que l'écran de détail affiche tel quel.
"""
from __future__ import annotations

from rest_framework import serializers

from apps.audits.models import AdminActionLog, AuditLog


class CombinedAuditEntrySerializer(serializers.Serializer):
    """Entrée d'audit normalisée, quelle que soit sa source.

    `id` n'est unique qu'au sein d'une source (les deux journaux ont leurs
    propres séquences) : c'est le couple (`source`, `id`) qui identifie une
    entrée. D'où l'exposition explicite de `source`.
    """

    source = serializers.SerializerMethodField()
    id = serializers.SerializerMethodField()
    created_at = serializers.DateTimeField(source="timestamp")
    actor = serializers.SerializerMethodField()
    actor_role = serializers.SerializerMethodField()
    action = serializers.SerializerMethodField()
    target_type = serializers.SerializerMethodField()
    target_id = serializers.SerializerMethodField()
    reason = serializers.SerializerMethodField()
    ip_address = serializers.SerializerMethodField()
    user_agent = serializers.SerializerMethodField()
    metadata = serializers.SerializerMethodField()

    def get_source(self, item: dict) -> str:
        return item["source"]

    def get_id(self, item: dict) -> int:
        return item["entry"].pk

    def get_action(self, item: dict) -> str:
        return item["entry"].action or ""

    def get_ip_address(self, item: dict):
        return item["entry"].ip_address

    def get_actor(self, item: dict):
        entry = item["entry"]
        if item["source"] == "app":
            # `user_display` est figé à l'écriture : il survit à la
            # suppression du compte, ce qui est le comportement attendu d'un
            # journal (l'entrée doit rester lisible après coup).
            return entry.user_display or (entry.user.username if entry.user else None)
        return entry.actor.username if entry.actor else None

    def get_actor_role(self, item: dict):
        # Le journal métier n'a pas de notion de rôle staff : l'acteur y est
        # un client, pas un opérateur.
        return item["entry"].actor_role or None if item["source"] == "admin" else None

    def get_target_type(self, item: dict) -> str:
        entry = item["entry"]
        if item["source"] == "app":
            # `resource` est l'équivalent fonctionnel de la cible côté app.
            return entry.resource or ""
        return entry.target_type or ""

    def get_target_id(self, item: dict):
        if item["source"] == "app":
            return None
        return item["entry"].target_id or None

    def get_reason(self, item: dict):
        if item["source"] == "app":
            return None
        return item["entry"].reason or None

    def get_user_agent(self, item: dict):
        if item["source"] == "app":
            return None
        return item["entry"].user_agent or None

    def get_metadata(self, item: dict) -> dict:
        """Champs propres à une source, conservés pour l'écran de détail."""
        entry = item["entry"]
        if item["source"] == "app":
            return {
                "statut": entry.status,
                "utilisateur_id": entry.user_id,
            }
        return {
            "avant": entry.before,
            "apres": entry.after,
            "methode_http": entry.http_method,
            "chemin": entry.path,
            "code_http": entry.status_code,
            "resultat": entry.result,
            "utilisateur_cible_id": entry.target_user_id,
        }


class AuditLogSerializer(serializers.ModelSerializer):
    """Forme brute d'une entrée métier. Conservé pour les usages internes
    (export, débogage) : l'écran d'audit consomme la forme unifiée."""

    class Meta:
        model = AuditLog
        fields = [
            "id",
            "user",
            "user_display",
            "action",
            "resource",
            "status",
            "ip_address",
            "timestamp",
        ]


class AdminActionLogSerializer(serializers.ModelSerializer):
    """Forme brute d'une action back-office (mêmes remarques que
    `AuditLogSerializer`)."""

    class Meta:
        model = AdminActionLog
        fields = [
            "id",
            "actor",
            "actor_role",
            "action",
            "target_type",
            "target_id",
            "target_user",
            "reason",
            "before",
            "after",
            "ip_address",
            "http_method",
            "path",
            "status_code",
            "result",
            "timestamp",
        ]
