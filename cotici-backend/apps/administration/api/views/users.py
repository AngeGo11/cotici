"""`/api/admin/users/` : consultation et modération des utilisateurs finaux.

Trois niveaux de droits, volontairement séparés :

- `user.read`       : lister et consulter une fiche (PII masquée) ;
- `user.suspend`    : suspendre / réactiver un compte ;
- `user.pii_reveal` : obtenir le numéro et l'e-mail en clair.

Le dernier est isolé parce que c'est le seul qui expose des données
personnelles : il est réservé au rôle conformité (et au super admin), exige
un motif, et laisse une trace nominative dans le journal d'audit. Consulter
une fiche ne doit jamais suffire à extraire un fichier clients.
"""
from __future__ import annotations

from django.db.models import Count, Q
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.viewsets import ReadOnlyModelViewSet

from apps.administration.api.serializers.users import (
    AdminUserDetailSerializer,
    AdminUserListSerializer,
    ReasonSerializer,
    RevealedPiiSerializer,
)
from apps.administration.authentication import AdminSessionAuthentication
from apps.administration.domain.audit_actions import (
    USER_PII_REVEALED,
    USER_REACTIVATED,
    USER_SUSPENDED,
)
from apps.administration.domain.errors import SelfModificationForbiddenError
from apps.administration.domain.roles import Perm
from apps.administration.mixins import AuditedActionMixin
from apps.administration.pagination import AdminPageNumberPagination
from apps.administration.permissions import (
    HasStaffPermission,
    IsStaffMember,
    ReadOnlyForAuditor,
)
from apps.administration.services import user_admin_service
from apps.administration.services.user_admin_service import StaffAccountNotManageableError
from apps.administration.throttling import AdminActionThrottle
from apps.tontine.models import Tontine
from apps.wallet.models import Transaction


class AdminUserViewSet(AuditedActionMixin, ReadOnlyModelViewSet):
    """Lecture seule + actions de modération explicites.

    `ReadOnlyModelViewSet` (et non `ModelViewSet`) : le back-office ne crée
    ni ne supprime de compte client, et ne modifie aucun champ en direct —
    toute mutation passe par une action nommée, motivée et auditée.
    """

    authentication_classes = [AdminSessionAuthentication]
    permission_classes = [
        IsStaffMember,
        ReadOnlyForAuditor,
        HasStaffPermission(Perm.USER_READ),
    ]
    throttle_classes = [AdminActionThrottle]
    throttle_scope = "admin_action"
    pagination_class = AdminPageNumberPagination
    serializer_class = AdminUserListSerializer

    #: Tri autorisé (`?ordering=`). Liste blanche : un `order_by` libre
    #: laisserait trier sur un champ sensible (mot de passe, code PIN) et en
    #: déduire de l'information par comparaison.
    ORDERING_FIELDS = {
        "date_joined": "date_joined",
        "-date_joined": "-date_joined",
        "last_login": "last_login",
        "-last_login": "-last_login",
        "username": "username",
        "-username": "-username",
    }

    def get_queryset(self):
        queryset = user_admin_service.list_users()

        search = (self.request.query_params.get("search") or "").strip()
        if search:
            # Le numéro est recherché en `exact` (et non `icontains`) : une
            # recherche partielle sur un numéro permettrait d'énumérer les
            # clients par préfixe.
            queryset = queryset.filter(
                Q(username__icontains=search)
                | Q(first_name__icontains=search)
                | Q(last_name__icontains=search)
                | Q(numero_telephone=search)
            )

        statut = (self.request.query_params.get("statut") or "").strip()
        if statut == "actif":
            queryset = queryset.filter(is_active=True)
        elif statut == "suspendu":
            queryset = queryset.filter(is_active=False)

        ordering = self.ORDERING_FIELDS.get(
            self.request.query_params.get("ordering") or "", "-date_joined"
        )
        return queryset.order_by(ordering)

    def get_object(self):
        # La fiche porte des compteurs que la liste n'affiche pas : on ne les
        # calcule que sur le détail, pour ne pas alourdir chaque page de liste.
        queryset = self.get_queryset().annotate(
            tontines_hebergees=Count(
                "tontine",
                filter=Q(tontine__etat=Tontine.ETAT.ACTIF),
                distinct=True,
            ),
            epargnes_count=Count("epargnepersonnelle", distinct=True),
        )
        # `get_object_or_404` et non `.get()` : un compte hors périmètre (un
        # compte staff, exclu du queryset) doit répondre 404, pas 500.
        user = get_object_or_404(queryset, pk=self.kwargs["pk"])
        user.transactions_count = Transaction.objects.filter(
            wallet__user_id=user.pk
        ).count()
        return user

    def get_serializer_class(self):
        if self.action == "retrieve":
            return AdminUserDetailSerializer
        return AdminUserListSerializer

    def get_audit_action(self) -> str:
        return {
            "suspend": USER_SUSPENDED,
            "reactivate": USER_REACTIVATED,
            "reveal_pii": USER_PII_REVEALED,
        }.get(getattr(self, "action", ""), "")

    def _read_reason(self, request) -> str:
        serializer = ReasonSerializer(data=request.data or {})
        serializer.is_valid(raise_exception=True)
        return serializer.validated_data["reason"]

    @action(
        detail=True,
        methods=["post"],
        url_path="suspend",
        permission_classes=[
            IsStaffMember,
            ReadOnlyForAuditor,
            HasStaffPermission(Perm.USER_SUSPEND),
        ],
    )
    def suspend(self, request, pk=None):
        target = self.get_object()
        reason = self._read_reason(request)
        self.enforce_reason_if_sensitive(USER_SUSPENDED, reason)
        before = {"is_active": target.is_active}
        try:
            target = user_admin_service.suspend_user(actor=request.user, target=target)
        except (StaffAccountNotManageableError, SelfModificationForbiddenError) as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_403_FORBIDDEN)

        self.record_audit(
            request,
            target_type="user",
            target_id=target.pk,
            target_user=target,
            reason=reason,
            before=before,
            after={"is_active": target.is_active},
        )
        return Response(AdminUserDetailSerializer(target).data)

    @action(
        detail=True,
        methods=["post"],
        url_path="reactivate",
        permission_classes=[
            IsStaffMember,
            ReadOnlyForAuditor,
            HasStaffPermission(Perm.USER_SUSPEND),
        ],
    )
    def reactivate(self, request, pk=None):
        target = self.get_object()
        reason = self._read_reason(request)
        self.enforce_reason_if_sensitive(USER_REACTIVATED, reason)
        before = {"is_active": target.is_active}
        try:
            target = user_admin_service.reactivate_user(actor=request.user, target=target)
        except (StaffAccountNotManageableError, SelfModificationForbiddenError) as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_403_FORBIDDEN)

        self.record_audit(
            request,
            target_type="user",
            target_id=target.pk,
            target_user=target,
            reason=reason,
            before=before,
            after={"is_active": target.is_active},
        )
        return Response(AdminUserDetailSerializer(target).data)

    @action(
        detail=True,
        methods=["post"],
        url_path="reveal-pii",
        permission_classes=[
            IsStaffMember,
            HasStaffPermission(Perm.USER_PII_REVEAL),
        ],
    )
    def reveal_pii(self, request, pk=None):
        """Révèle les données personnelles en clair.

        Volontairement en POST et non en GET : une requête auditée doit
        porter un corps (le motif), et le middleware d'audit n'instrumente
        pas les méthodes de lecture. C'est ce qui garantit qu'aucune
        révélation de PII ne peut avoir lieu sans trace.

        `ReadOnlyForAuditor` est absent de la liste : le rôle auditeur ne
        détient de toute façon pas `user.pii_reveal`, et l'ajouter
        laisserait croire qu'un droit de lecture pourrait suffire ici.
        """
        target = self.get_object()
        reason = self._read_reason(request)
        self.enforce_reason_if_sensitive(USER_PII_REVEALED, reason)

        payload = user_admin_service.reveal_pii(target)
        # Le journal consigne QUI a révélé QUOI et POURQUOI — jamais les
        # valeurs révélées : sinon le journal d'audit deviendrait lui-même un
        # export de données personnelles en clair.
        self.record_audit(
            request,
            target_type="user",
            target_id=target.pk,
            target_user=target,
            reason=reason,
            after={"champs_reveles": sorted(payload.keys())},
        )
        return Response(RevealedPiiSerializer(payload).data)
