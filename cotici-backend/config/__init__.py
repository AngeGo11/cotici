"""Expose l'app Celery au démarrage de Django (`django-celery` convention) :
sans cet import, `@shared_task` (utilisé par `apps.tontine.tasks`) ne sait pas
sur quelle instance Celery s'enregistrer tant qu'aucun code n'a explicitement
importé `config.celery`.

Import protégé : en environnement de test/CI où `celery` ne serait pas
installé (ne devrait plus arriver, `celery`/`redis` sont désormais dans
`requirements.txt`, voir DEPLOYMENT.md), Django continue de démarrer — seules
les tâches Celery seraient alors indisponibles, pas l'application entière.
"""
try:
    from config.celery import app as celery_app

    __all__ = ("celery_app",)
except ImportError:  # pragma: no cover - filet de sécurité, cf. docstring.
    __all__ = ()
