"""Serializers de l'écran `/api/admin/savings/` (consultation seule).

Comme le module utilisateurs (`api/serializers/users.py`), le titulaire n'est
jamais exposé avec son numéro de téléphone en clair : seule sa version
masquée (`mask_phone`) sort de ce module.
"""
from __future__ import annotations

from datetime import timedelta
from decimal import Decimal

from rest_framework import serializers

from apps.administration.api.serializers.users import mask_phone
from apps.savings.models import EpargnePersonnelle
from apps.wallet.models import Transaction


class SavingsHolderSerializer(serializers.Serializer):
    """Titulaire d'une épargne, tel qu'affiché dans la colonne "titulaire"."""

    id = serializers.IntegerField(read_only=True)
    nom_complet = serializers.SerializerMethodField()
    username = serializers.CharField(read_only=True)
    numero_telephone_masque = serializers.SerializerMethodField()

    def get_nom_complet(self, obj) -> str:
        full = f"{(obj.first_name or '').strip()} {(obj.last_name or '').strip()}".strip()
        return full or obj.username

    def get_numero_telephone_masque(self, obj) -> str:
        return mask_phone(obj.numero_telephone)


class SavingsTransactionSerializer(serializers.ModelSerializer):
    """Ligne de l'historique des versements/retraits d'une épargne."""

    class Meta:
        model = Transaction
        fields = [
            "id",
            "ref_transaction",
            "type_transaction",
            "mode_de_paiement",
            "montant_transaction",
            "statut_transaction",
            "date_transaction",
        ]
        read_only_fields = fields


class SavingsListSerializer(serializers.ModelSerializer):
    """Ligne de la liste des épargnes personnelles : titulaire, libellé,
    objectif, cumul versé (annoté côté service — jamais recalculé ici) et
    progression."""

    titulaire = SavingsHolderSerializer(source="hote", read_only=True)
    cumul_verse = serializers.DecimalField(
        max_digits=10, decimal_places=0, read_only=True, default=Decimal("0")
    )
    progression = serializers.SerializerMethodField()
    echeance = serializers.SerializerMethodField()

    class Meta:
        model = EpargnePersonnelle
        fields = [
            "id",
            "titulaire",
            "nom_projet",
            "categorie",
            "objectif_cotisation",
            "cumul_verse",
            "progression",
            "etat",
            "objectif_atteint",
            "duree",
            "date_creation",
            "echeance",
        ]
        read_only_fields = fields

    def get_progression(self, obj) -> float:
        """Progression (0-100, non plafonnée : un dépassement d'objectif
        reste visible tel quel, utile pour repérer une anomalie)."""
        objectif = obj.objectif_cotisation or 0
        if objectif <= 0:
            return 0.0
        cumul = getattr(obj, "cumul_verse", None) or Decimal("0")
        return round(float(cumul) / float(objectif) * 100, 2)

    def get_echeance(self, obj):
        """Échéance dérivée de `date_creation + duree` (en jours) — le
        modèle n'a pas de champ d'échéance dédié. `None` si `duree` n'est pas
        renseignée (0, valeur par défaut du modèle)."""
        if not obj.duree or not obj.date_creation:
            return None
        return obj.date_creation + timedelta(days=obj.duree)


class SavingsDetailSerializer(SavingsListSerializer):
    """Fiche détail : mêmes champs que la liste, enrichis du solde courant
    stocké côté application (référence de comparaison avec `cumul_verse`) et
    de l'historique complet des versements/retraits."""

    montant_courant = serializers.DecimalField(max_digits=10, decimal_places=0, read_only=True)
    historique = serializers.SerializerMethodField()
    date_archivage = serializers.DateTimeField(read_only=True)
    date_suppression = serializers.DateTimeField(read_only=True)

    class Meta(SavingsListSerializer.Meta):
        fields = SavingsListSerializer.Meta.fields + [
            "montant_courant",
            "date_archivage",
            "date_suppression",
            "historique",
        ]
        read_only_fields = fields

    def get_historique(self, obj) -> list[dict]:
        # Préchargé par `savings_admin_service.get_savings_detail_queryset`
        # (Prefetch -> `historique_transactions`) : jamais de requête N+1 ici.
        transactions = getattr(obj, "historique_transactions", None)
        if transactions is None:
            transactions = obj.transaction_set.order_by("-date_transaction")
        return SavingsTransactionSerializer(transactions, many=True).data
