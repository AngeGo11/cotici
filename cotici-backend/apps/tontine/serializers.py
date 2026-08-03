from typing import Optional

from django.contrib.auth import get_user_model
from rest_framework import serializers

from apps.tontine.models import Penalite, Tontine, TontineMembre, TontineRegle
from apps.utils.utilitaires import _normalize_phone, _parse_positive_int

User = get_user_model()

# Plafond dur (720h = 30 jours) aligné sur la CheckConstraint DB
# `tontineregle_delai_grace_max_720h` : rejeter côté serializer évite un
# aller-retour DB inutile pour une valeur qui échouerait de toute façon.
DELAI_GRACE_HEURES_MAX = 720


def _parse_non_negative_int(value) -> Optional[int]:
    """Comme `_parse_positive_int`, mais accepte 0 (ex: délai de grâce immédiat)."""
    if value in (None, ""):
        return None
    try:
        n = int(value)
    except (TypeError, ValueError):
        return None
    return n if n >= 0 else None


class TontineSerializer(serializers.ModelSerializer):
    class Meta:
        model = Tontine
        fields = ("id", "hote", "type_tontine", "est_active", "date_creation", "description")
        read_only_fields = ("id",)

    def create(self, validated_data):
        return Tontine.objects.create(**validated_data)


def _as_bool(value) -> bool:
    if isinstance(value, bool):
        return value
    if value is None:
        return False
    return str(value).strip().lower() in ("1", "true", "yes", "oui")


def _resolve_ordre_ramassage(raw) -> Optional[str]:
    if raw is None or str(raw).strip() == "":
        return None
    key = str(raw).strip()
    aliases = {
        "admin": TontineRegle.ORDRE_RAMASSAGE.DEFINI_PAR_ADMIN,
        "random": TontineRegle.ORDRE_RAMASSAGE.ALEATOIRE,
        "aleatoire": TontineRegle.ORDRE_RAMASSAGE.ALEATOIRE,
        "défini par l'admin": TontineRegle.ORDRE_RAMASSAGE.DEFINI_PAR_ADMIN,
    }
    normalized = aliases.get(key.lower(), key)
    valid = {c for c, _ in TontineRegle.ORDRE_RAMASSAGE.choices}
    return normalized if normalized in valid else None


class TontineIdRequiredSerializer(serializers.Serializer):
    """Vérifie uniquement la présence de tontine_id (pas son format) — préserve le
    comportement historique où un tontine_id non numérique tombe sur un 404 lors
    du .get(pk=...) plutôt qu'un 400 générique."""

    tontine_id = serializers.CharField(required=False, allow_null=True)

    def validate(self, attrs):
        tontine_id = attrs.get("tontine_id")
        if tontine_id in (None, ""):
            raise serializers.ValidationError({"detail": "tontine_id requis."})
        return {"tontine_id": tontine_id}


class GroupeIdSerializer(serializers.Serializer):
    id = serializers.CharField(required=False, allow_null=True)

    def validate(self, attrs):
        tontine_id = _parse_positive_int(attrs.get("id"))
        if tontine_id is None:
            raise serializers.ValidationError({"detail": "Identifiant de tontine invalide."})
        return {"id": tontine_id}


class CreateTontineSerializer(serializers.Serializer):
    type_tontine = serializers.CharField(required=False, allow_null=True, allow_blank=True)
    tontine_type = serializers.CharField(required=False, allow_null=True, allow_blank=True)
    nom_projet = serializers.CharField(required=False, allow_null=True, allow_blank=True)
    nom = serializers.CharField(required=False, allow_null=True, allow_blank=True)
    description = serializers.CharField(required=False, allow_null=True, allow_blank=True)

    def validate(self, attrs):
        raw_type = (
            attrs.get("type_tontine") or attrs.get("tontine_type") or Tontine.TYPE_TONTINE.GROUPE
        ).strip()
        valid_types = {c for c, _ in Tontine.TYPE_TONTINE.choices}
        if raw_type not in valid_types:
            raise serializers.ValidationError(
                {"detail": "Type de tontine invalide.", "allowed": list(valid_types)}
            )

        nom = (attrs.get("nom_projet") or attrs.get("nom") or "").strip()
        description = (attrs.get("description") or "").strip()
        if nom and description and description != nom:
            description = f"{nom} — {description}"
        elif nom:
            description = nom
        if not description:
            raise serializers.ValidationError({"detail": "La description est obligatoire."})
        if len(description) > 300:
            raise serializers.ValidationError(
                {"detail": "Description trop longue (300 caractères max)."}
            )

        return {"type_tontine": raw_type, "description": description}


class DefineTontineRegleSerializer(serializers.Serializer):
    """Valide les champs de format des règles ; le calcul de nombre_tours /
    objectif_cotisation reste en vue car il dépend du type de la tontine déjà
    en base (GROUPE vs autre)."""

    tontine_id = serializers.CharField(required=False, allow_null=True)
    montant_cotisation = serializers.CharField(required=False, allow_null=True)
    montant_par_participant = serializers.CharField(required=False, allow_null=True)
    nombre_max = serializers.CharField(required=False, allow_null=True)
    ordre_choisie = serializers.CharField(required=False, allow_null=True, allow_blank=True)
    ordre_ramassage = serializers.CharField(required=False, allow_null=True, allow_blank=True)
    frequence = serializers.CharField(required=False, allow_null=True, allow_blank=True)
    value_frequence_personnalise = serializers.CharField(required=False, allow_null=True)
    frequence_personnalise = serializers.CharField(required=False, allow_null=True)
    # JSONField (pas CharField) : le client envoie souvent un booléen JSON natif
    # (true/false), que CharField rejette explicitement avant toute coercition.
    penalite = serializers.JSONField(required=False, allow_null=True)
    type_penalite = serializers.CharField(required=False, allow_null=True, allow_blank=True)
    montant_penalite = serializers.CharField(required=False, allow_null=True)
    delai_grace_heures = serializers.CharField(required=False, allow_null=True)
    penalites_automatiques = serializers.JSONField(required=False, allow_null=True)

    def validate(self, attrs):
        tontine_id = attrs.get("tontine_id")
        if tontine_id in (None, ""):
            raise serializers.ValidationError({"detail": "tontine_id requis."})

        montant_cotisation = _parse_positive_int(
            attrs.get("montant_cotisation") or attrs.get("montant_par_participant")
        )
        if montant_cotisation is None:
            raise serializers.ValidationError(
                {"detail": "Montant par participant invalide ou absent."}
            )

        nombre_max = _parse_positive_int(attrs.get("nombre_max"))
        if nombre_max is None:
            raise serializers.ValidationError(
                {"detail": "Nombre maximum de participants invalide ou absent."}
            )

        ordre_raw = attrs.get("ordre_choisie") or attrs.get("ordre_ramassage")
        ordre_ramassage = _resolve_ordre_ramassage(ordre_raw)
        if ordre_ramassage is None:
            raise serializers.ValidationError(
                {
                    "detail": "Mode d'ordre de ramassage invalide.",
                    "allowed": [c for c, _ in TontineRegle.ORDRE_RAMASSAGE.choices],
                }
            )

        frequence_choisie = (attrs.get("frequence") or "").strip()
        valid_frequences = {c for c, _ in TontineRegle.FREQUENCE_COTISATION.choices}
        if frequence_choisie not in valid_frequences:
            raise serializers.ValidationError({"detail": "Fréquence invalide."})

        frequence_personnalise = None
        if frequence_choisie == TontineRegle.FREQUENCE_COTISATION.PERSONNALISE:
            frequence_personnalise = _parse_positive_int(
                attrs.get("value_frequence_personnalise") or attrs.get("frequence_personnalise")
            )
            if frequence_personnalise is None:
                raise serializers.ValidationError(
                    {"detail": "Veuillez préciser la fréquence de cotisation (en jours)."}
                )

        inclure_penalite = _as_bool(attrs.get("penalite"))
        type_penalite = ""
        montant_penalite = 0
        if inclure_penalite:
            type_penalite = (attrs.get("type_penalite") or "").strip()
            valid_types = {c for c, _ in Penalite.TYPE_PENALITE.choices}
            if type_penalite not in valid_types:
                raise serializers.ValidationError(
                    {"detail": "Type de pénalité invalide.", "allowed": list(valid_types)}
                )
            montant_penalite = _parse_positive_int(attrs.get("montant_penalite"))
            if montant_penalite is None:
                raise serializers.ValidationError(
                    {"detail": "Montant de la pénalité obligatoire."}
                )

        delai_grace_heures = _parse_non_negative_int(attrs.get("delai_grace_heures"))
        if delai_grace_heures is None:
            delai_grace_heures = 24
        if delai_grace_heures > DELAI_GRACE_HEURES_MAX:
            raise serializers.ValidationError(
                {"detail": f"Délai de grâce invalide (0 à {DELAI_GRACE_HEURES_MAX}h)."}
            )

        penalites_automatiques = _as_bool(attrs.get("penalites_automatiques"))
        if penalites_automatiques and not (inclure_penalite and montant_penalite):
            raise serializers.ValidationError(
                {
                    "detail": (
                        "Les pénalités automatiques nécessitent une pénalité incluse "
                        "avec un montant strictement positif."
                    ),
                }
            )

        return {
            "tontine_id": tontine_id,
            "montant_cotisation": montant_cotisation,
            "nombre_max": nombre_max,
            "ordre_ramassage": ordre_ramassage,
            "frequence": frequence_choisie,
            "frequence_personnalise": frequence_personnalise,
            "inclure_penalite": inclure_penalite,
            "type_penalite": type_penalite,
            "montant_penalite": montant_penalite,
            "delai_grace_heures": delai_grace_heures,
            "penalites_automatiques": penalites_automatiques,
        }


class AttributePenaliteSerializer(serializers.Serializer):
    tontine_id = serializers.CharField(required=False, allow_null=True)
    type_penalite = serializers.CharField(required=False, allow_null=True, allow_blank=True)
    motif = serializers.CharField(required=False, allow_null=True, allow_blank=True)

    def validate(self, attrs):
        tontine_id = attrs.get("tontine_id")
        if tontine_id in (None, ""):
            raise serializers.ValidationError({"detail": "tontine_id requis."})

        type_penalite = (attrs.get("type_penalite") or "").strip()
        valid_types = {c for c, _ in Penalite.TYPE_PENALITE.choices}
        if type_penalite not in valid_types:
            raise serializers.ValidationError(
                {"detail": "Type de pénalité invalide.", "allowed": list(valid_types)}
            )

        motif = (attrs.get("motif") or "").strip()
        if len(motif) > 255:
            raise serializers.ValidationError({"detail": "Motif trop long (255 caractères max)."})

        return {"tontine_id": tontine_id, "type_penalite": type_penalite, "motif": motif}


class SendInvitationSerializer(serializers.Serializer):
    tontine_id = serializers.CharField(required=False, allow_null=True)
    numero_telephone_invite = serializers.CharField(required=False, allow_null=True, allow_blank=True)
    telephone = serializers.CharField(required=False, allow_null=True, allow_blank=True)

    def validate(self, attrs):
        tontine_id = attrs.get("tontine_id")
        if tontine_id in (None, ""):
            raise serializers.ValidationError({"detail": "tontine_id requis."})

        phone_raw = attrs.get("numero_telephone_invite") or attrs.get("telephone") or ""
        phone = _normalize_phone(str(phone_raw))
        if not phone or len(phone) < 8:
            raise serializers.ValidationError({"detail": "Numéro de téléphone invalide."})
        if len(phone) > 15:
            raise serializers.ValidationError(
                {"detail": "Numéro trop long (15 chiffres max)."}
            )

        return {"tontine_id": tontine_id, "phone": phone}


class PostChatMessageSerializer(serializers.Serializer):
    tontine_id = serializers.CharField(required=False, allow_null=True)
    contenu = serializers.CharField(required=False, allow_null=True, allow_blank=True)

    def validate(self, attrs):
        tontine_id = attrs.get("tontine_id")
        if tontine_id in (None, ""):
            raise serializers.ValidationError({"detail": "tontine_id requis."})

        contenu = (attrs.get("contenu") or "").strip()
        if not contenu:
            raise serializers.ValidationError({"detail": "Le message ne peut pas être vide."})
        if len(contenu) > 255:
            raise serializers.ValidationError(
                {"detail": "Message trop long (255 caractères max)."}
            )

        return {"tontine_id": tontine_id, "contenu": contenu}


class TokenRequiredSerializer(serializers.Serializer):
    token = serializers.CharField(required=False, allow_null=True, allow_blank=True)

    def validate(self, attrs):
        token = (attrs.get("token") or "").strip()
        if not token:
            raise serializers.ValidationError({"detail": "token requis."})
        return {"token": token}


class MemberTargetMixin:
    """Champs communs de résolution d'un membre cible (user_id / membre_id / numero_telephone).

    La résolution effective (recherche en base) reste dans `views._resolve_tontine_member` :
    ce mixin ne fait que garantir qu'au moins un identifiant est fourni, avant même
    d'atteindre la base de données.
    """

    def _validate_target_present(self, attrs) -> None:
        has_target = any(
            attrs.get(key) not in (None, "")
            for key in ("user_id", "membre_id", "numero_telephone")
        )
        if not has_target:
            raise serializers.ValidationError(
                {"detail": "Indiquez user_id, membre_id ou numero_telephone."}
            )


class ExcludeMemberSerializer(serializers.Serializer, MemberTargetMixin):
    tontine_id = serializers.CharField(required=False, allow_null=True)
    user_id = serializers.CharField(required=False, allow_null=True, allow_blank=True)
    membre_id = serializers.CharField(required=False, allow_null=True, allow_blank=True)
    numero_telephone = serializers.CharField(required=False, allow_null=True, allow_blank=True)
    motif = serializers.CharField(required=False, allow_null=True, allow_blank=True)

    def validate(self, attrs):
        tontine_id = attrs.get("tontine_id")
        if tontine_id in (None, ""):
            raise serializers.ValidationError({"detail": "tontine_id requis."})
        self._validate_target_present(attrs)
        motif = (attrs.get("motif") or "").strip()
        if len(motif) > 255:
            raise serializers.ValidationError({"detail": "Motif trop long (255 caractères max)."})
        return {
            "tontine_id": tontine_id,
            "user_id": attrs.get("user_id"),
            "membre_id": attrs.get("membre_id"),
            "numero_telephone": attrs.get("numero_telephone"),
            "motif": motif,
        }


class SetMemberRoleSerializer(serializers.Serializer, MemberTargetMixin):
    tontine_id = serializers.CharField(required=False, allow_null=True)
    user_id = serializers.CharField(required=False, allow_null=True, allow_blank=True)
    membre_id = serializers.CharField(required=False, allow_null=True, allow_blank=True)
    numero_telephone = serializers.CharField(required=False, allow_null=True, allow_blank=True)
    role = serializers.CharField(required=False, allow_null=True, allow_blank=True)

    def validate(self, attrs):
        tontine_id = attrs.get("tontine_id")
        if tontine_id in (None, ""):
            raise serializers.ValidationError({"detail": "tontine_id requis."})
        self._validate_target_present(attrs)

        role = (attrs.get("role") or "").strip()
        valid_roles = {c for c, _ in TontineMembre.ROLE_MEMBRE.choices}
        if role not in valid_roles:
            raise serializers.ValidationError(
                {"detail": "Rôle invalide.", "allowed": list(valid_roles)}
            )

        return {
            "tontine_id": tontine_id,
            "user_id": attrs.get("user_id"),
            "membre_id": attrs.get("membre_id"),
            "numero_telephone": attrs.get("numero_telephone"),
            "role": role,
        }


class ModifyTontineRegleSerializer(serializers.Serializer):
    """Modification partielle des règles d'un groupe : tous les champs sont
    optionnels — seuls ceux effectivement fournis sont pris en compte par la
    vue (`validate` ne renvoie que les clés présentes dans la requête, pour
    distinguer "non fourni" de "fourni avec une valeur vide/zéro")."""

    tontine_id = serializers.CharField(required=False, allow_null=True)
    montant_cotisation = serializers.CharField(required=False, allow_null=True)
    nombre_max = serializers.CharField(required=False, allow_null=True)
    ordre_ramassage = serializers.CharField(required=False, allow_null=True, allow_blank=True)
    frequence = serializers.CharField(required=False, allow_null=True, allow_blank=True)
    frequence_personnalise = serializers.CharField(required=False, allow_null=True)
    montant_penalite = serializers.CharField(required=False, allow_null=True)
    delai_grace_heures = serializers.CharField(required=False, allow_null=True)
    penalites_automatiques = serializers.JSONField(required=False, allow_null=True)

    def validate(self, attrs):
        tontine_id = attrs.get("tontine_id")
        if tontine_id in (None, ""):
            raise serializers.ValidationError({"detail": "tontine_id requis."})

        result = {"tontine_id": tontine_id}

        if "montant_cotisation" in self.initial_data and self.initial_data.get("montant_cotisation") not in (None, ""):
            montant_cotisation = _parse_positive_int(attrs.get("montant_cotisation"))
            if montant_cotisation is None:
                raise serializers.ValidationError({"detail": "Montant de cotisation invalide."})
            result["montant_cotisation"] = montant_cotisation

        if "nombre_max" in self.initial_data and self.initial_data.get("nombre_max") not in (None, ""):
            nombre_max = _parse_positive_int(attrs.get("nombre_max"))
            if nombre_max is None:
                raise serializers.ValidationError({"detail": "Nombre maximum de participants invalide."})
            result["nombre_max"] = nombre_max

        if "ordre_ramassage" in self.initial_data and self.initial_data.get("ordre_ramassage") not in (None, ""):
            ordre_ramassage = _resolve_ordre_ramassage(attrs.get("ordre_ramassage"))
            if ordre_ramassage is None:
                raise serializers.ValidationError(
                    {
                        "detail": "Mode d'ordre de ramassage invalide.",
                        "allowed": [c for c, _ in TontineRegle.ORDRE_RAMASSAGE.choices],
                    }
                )
            result["ordre_ramassage"] = ordre_ramassage

        if "frequence" in self.initial_data and self.initial_data.get("frequence") not in (None, ""):
            frequence = (attrs.get("frequence") or "").strip()
            valid_frequences = {c for c, _ in TontineRegle.FREQUENCE_COTISATION.choices}
            if frequence not in valid_frequences:
                raise serializers.ValidationError({"detail": "Fréquence invalide."})
            result["frequence"] = frequence
            if frequence == TontineRegle.FREQUENCE_COTISATION.PERSONNALISE:
                frequence_personnalise = _parse_positive_int(attrs.get("frequence_personnalise"))
                if frequence_personnalise is None:
                    raise serializers.ValidationError(
                        {"detail": "Veuillez préciser la fréquence de cotisation (en jours)."}
                    )
                result["frequence_personnalise"] = frequence_personnalise
            else:
                result["frequence_personnalise"] = None
        elif "frequence_personnalise" in self.initial_data and self.initial_data.get("frequence_personnalise") not in (None, ""):
            frequence_personnalise = _parse_positive_int(attrs.get("frequence_personnalise"))
            if frequence_personnalise is None:
                raise serializers.ValidationError({"detail": "Fréquence personnalisée invalide."})
            result["frequence_personnalise"] = frequence_personnalise

        if "montant_penalite" in self.initial_data and self.initial_data.get("montant_penalite") not in (None, ""):
            montant_penalite = _parse_positive_int(attrs.get("montant_penalite"))
            if montant_penalite is None:
                # Une pénalité à 0 (désactivation) est légitime : seule une valeur
                # négative ou non numérique est rejetée. `_parse_positive_int`
                # rejette 0, donc on retente une conversion tolérante ici.
                try:
                    montant_penalite = int(attrs.get("montant_penalite"))
                except (TypeError, ValueError):
                    raise serializers.ValidationError({"detail": "Montant de pénalité invalide."})
                if montant_penalite < 0:
                    raise serializers.ValidationError({"detail": "Montant de pénalité invalide."})
            result["montant_penalite"] = montant_penalite

        if "delai_grace_heures" in self.initial_data and self.initial_data.get("delai_grace_heures") not in (None, ""):
            delai_grace_heures = _parse_non_negative_int(attrs.get("delai_grace_heures"))
            if delai_grace_heures is None or delai_grace_heures > DELAI_GRACE_HEURES_MAX:
                raise serializers.ValidationError(
                    {"detail": f"Délai de grâce invalide (0 à {DELAI_GRACE_HEURES_MAX}h)."}
                )
            result["delai_grace_heures"] = delai_grace_heures

        if "penalites_automatiques" in self.initial_data:
            result["penalites_automatiques"] = _as_bool(attrs.get("penalites_automatiques"))

        if len(result) <= 1:
            raise serializers.ValidationError(
                {"detail": "Aucun champ à modifier n'a été fourni."}
            )

        return result


class PenaliteIdSerializer(serializers.Serializer):
    penalite_id = serializers.CharField(required=False, allow_null=True)

    def validate(self, attrs):
        penalite_id = _parse_positive_int(attrs.get("penalite_id"))
        if penalite_id is None:
            raise serializers.ValidationError({"detail": "penalite_id requis."})
        return {"penalite_id": penalite_id}


class ReglerPenaliteSerializer(serializers.Serializer):
    """Règlement d'une pénalité — deux modes mutuellement exclusifs.

    `mode="wallet"` (défaut) débite réellement le wallet du débiteur ;
    `mode="hors_application"` (réservé admin/hôte) marque la pénalité réglée
    sans mouvement financier (règlement en espèces), `motif` obligatoire.
    """

    MODES = ("wallet", "hors_application")

    penalite_id = serializers.CharField(required=False, allow_null=True)
    mode = serializers.CharField(required=False, allow_null=True, allow_blank=True)
    motif = serializers.CharField(required=False, allow_null=True, allow_blank=True)

    def validate(self, attrs):
        penalite_id = _parse_positive_int(attrs.get("penalite_id"))
        if penalite_id is None:
            raise serializers.ValidationError({"detail": "penalite_id requis."})

        mode = (attrs.get("mode") or "wallet").strip().lower()
        if mode not in self.MODES:
            raise serializers.ValidationError(
                {"detail": "Mode de règlement invalide.", "allowed": list(self.MODES)}
            )

        motif = (attrs.get("motif") or "").strip()
        if mode == "hors_application" and not motif:
            raise serializers.ValidationError(
                {"detail": "Un motif est obligatoire pour un règlement hors application."}
            )
        if len(motif) > 255:
            raise serializers.ValidationError({"detail": "Motif trop long (255 caractères max)."})

        return {"penalite_id": penalite_id, "mode": mode, "motif": motif}


class AcceptInvitationSerializer(serializers.Serializer):
    token = serializers.CharField(required=False, allow_null=True, allow_blank=True)
    tontine_id = serializers.CharField(required=False, allow_null=True)

    def validate(self, attrs):
        token = (attrs.get("token") or "").strip()
        tontine_id = attrs.get("tontine_id")
        if not token and tontine_id in (None, ""):
            raise serializers.ValidationError({"detail": "token ou tontine_id requis."})
        return {"token": token, "tontine_id": tontine_id}
