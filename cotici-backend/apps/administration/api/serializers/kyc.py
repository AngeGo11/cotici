"""Serializers de l'examen KYC (`/api/admin/kyc/`).

Un dossier KYC est, par nature, un paquet de données personnelles. Deux
règles s'appliquent donc ici :

- le **numéro de téléphone** du client reste masqué, comme partout ailleurs
  dans le back-office (`serializers/users.py`) : l'examinateur travaille sur
  la pièce, pas sur l'annuaire ;
- les **fichiers** ne sont jamais sérialisés en URL directe. Le serializer
  n'expose que la présence de chaque pièce ; la lecture passe par l'endpoint
  de streaming authentifié, qui journalise la consultation.
"""
from __future__ import annotations

from rest_framework import serializers

from apps.administration.api.serializers.users import mask_phone
from apps.kyc.models import KycSubmission


class KycSubmissionListSerializer(serializers.ModelSerializer):
    """Ligne de la file d'examen."""

    client_username = serializers.CharField(source="user.username", read_only=True)
    client_telephone_masque = serializers.SerializerMethodField()
    nom_complet_declare = serializers.SerializerMethodField()
    decide_par_username = serializers.CharField(
        source="decide_par.username", read_only=True, default=""
    )

    class Meta:
        model = KycSubmission
        fields = [
            "id",
            "client_username",
            "client_telephone_masque",
            "nom_complet_declare",
            "niveau_demande",
            "niveau_accorde",
            "type_piece",
            "statut",
            "date_soumission",
            "date_decision",
            "decide_par_username",
        ]
        read_only_fields = fields

    def get_client_telephone_masque(self, obj) -> str:
        return mask_phone(obj.user.numero_telephone)

    def get_nom_complet_declare(self, obj) -> str:
        return f"{obj.prenoms_declares} {obj.nom_declare}".strip()


class KycSubmissionDetailSerializer(KycSubmissionListSerializer):
    """Dossier complet présenté à l'examinateur."""

    pieces_disponibles = serializers.SerializerMethodField()

    class Meta(KycSubmissionListSerializer.Meta):
        fields = KycSubmissionListSerializer.Meta.fields + [
            "dossier_id",
            "numero_piece",
            "date_expiration_piece",
            "date_naissance",
            "motif_decision",
            "pieces_disponibles",
        ]
        read_only_fields = fields

    def get_pieces_disponibles(self, obj) -> list[str]:
        """Liste des pièces effectivement déposées.

        On renvoie des identifiants de pièce (`recto`, `verso`, `selfie`) et
        non des URL : c'est au client d'appeler l'endpoint de consultation,
        qui contrôle la permission et laisse une trace.
        """
        return [
            nom
            for nom, fichier in (
                ("recto", obj.document_recto),
                ("verso", obj.document_verso),
                ("selfie", obj.selfie),
            )
            if fichier
        ]


class KycApproveSerializer(serializers.Serializer):
    niveau = serializers.ChoiceField(
        choices=KycSubmission.Niveau.choices,
        required=False,
        allow_blank=True,
        default="",
        help_text="Palier accordé ; par défaut, celui demandé par le client.",
    )
    reason = serializers.CharField(
        allow_blank=False, help_text="Motif obligatoire (action sensible)."
    )


class KycRejectSerializer(serializers.Serializer):
    reason = serializers.CharField(
        allow_blank=False,
        help_text=(
            "Motif du rejet. Repris tel quel dans la notification au client : "
            "il doit lui être compréhensible."
        ),
    )
