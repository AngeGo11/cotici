"""Vues d'agrégation du tableau de bord back-office.

`GET /api/admin/dashboard/stats/`  : indicateurs instantanés.
`GET /api/admin/dashboard/series/` : série journalière d'une métrique.

Ces deux endpoints ne demandent aucune permission métier particulière au-delà
de `IsStaffMember` : le tableau de bord est l'écran d'accueil de tous les
rôles (cf. le routeur du front, qui ne le place derrière aucun
`RequirePermission`). Ils n'exposent que des agrégats — jamais une donnée
nominative — ce qui rend ce périmètre sûr pour l'auditeur comme pour le
support.
"""
from __future__ import annotations

from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.administration.authentication import AdminSessionAuthentication
from apps.administration.permissions import IsStaffMember
from apps.administration.services import metrics_service


class AdminDashboardStatsView(APIView):
    authentication_classes = [AdminSessionAuthentication]
    permission_classes = [IsStaffMember]

    def get(self, request):
        return Response(metrics_service.dashboard_stats())


class AdminDashboardSeriesView(APIView):
    authentication_classes = [AdminSessionAuthentication]
    permission_classes = [IsStaffMember]

    #: Métrique servie quand le client n'en précise aucune (celle affichée
    #: par défaut sur le tableau de bord).
    default_metric = "transactions_volume"
    default_days = 30

    def get(self, request):
        metric = request.query_params.get("metric") or self.default_metric
        raw_days = request.query_params.get("days") or self.default_days
        try:
            days = int(raw_days)
        except (TypeError, ValueError):
            raise ValidationError({"days": "Nombre de jours invalide."})

        try:
            points = metrics_service.time_series(metric, days)
        except ValueError:
            # Message explicite plutôt qu'un 500 : la liste blanche des
            # métriques fait partie du contrat d'API.
            raise ValidationError(
                {
                    "metric": "Métrique inconnue. Valeurs acceptées : "
                    + ", ".join(sorted(metrics_service.SERIES_METRICS))
                    + "."
                }
            )
        return Response(points)
