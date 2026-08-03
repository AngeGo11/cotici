"""Équivalent cron/management command de `apps.tontine.tasks.tache_cloturer_tours_echeance`.

Utile si Celery/Redis ne sont pas déployés (voir DEPLOYMENT.md) : appelle
EXACTEMENT le même service (`apps.tontine.services.cloture_service.cloturer_tour`),
protégé par le même `job_lock`/`job_run`, donc idempotent et sûr à planifier
en parallèle d'un worker Celery (le verrou avisory PostgreSQL empêche toute
double exécution, que le déclencheur soit `cron` ou `celery beat`).

Cron recommandé (si Celery beat n'est pas utilisé) :
    */15 * * * * cd /path/to/backend && .venv/bin/python manage.py cloturer_tours_echeance >> /var/log/cotici/cloturer_tours_echeance.log 2>&1
"""
from __future__ import annotations

from django.core.management.base import BaseCommand

from apps.tontine.tasks import tache_cloturer_tours_echeance


class Command(BaseCommand):
    help = "Clôture (pot partiel si impayés) tous les tours de tontine EN_COURS dont l'échéance 23h59 est dépassée."

    def handle(self, *args, **options):
        # `.run()` (et non `.delay()`) : exécution SYNCHRONE dans le process
        # cron, sans dépendre d'un broker Celery/Redis.
        stats = tache_cloturer_tours_echeance.run()
        detail = ", ".join(f"{k}={v}" for k, v in stats.items())
        self.stdout.write(self.style.SUCCESS(detail))
