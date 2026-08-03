"""Application Celery de COTICI.

Introduit pour exécuter les clôtures de tour à échéance ("23h59"), les
alertes/relances de cotisation, et le recouvrement des créances (dettes de
cotisation + pénalités), en remplacement des `management commands` + cron
utilisés jusqu'ici pour les jobs de notification (voir DEPLOYMENT.md).

Toute la logique métier reste dans `apps/tontine/services/` : les tâches
définies dans `apps/tontine/tasks.py` (et les futures tâches d'autres apps)
sont des WRAPPERS MINCES qui ne font qu'appeler ces services — aucune
écriture financière dans le corps d'une tâche Celery elle-même. Ceci
préserve la testabilité (les services se testent sans Celery ni Redis) et
laisse la porte ouverte à un déclenchement équivalent par
`management command`/cron pur (voir `apps/tontine/management/commands/`).
"""
from __future__ import annotations

import os

from celery import Celery
from celery.schedules import crontab

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")

app = Celery("cotici")

# Toute la configuration Celery est lue depuis `django.conf.settings`, sous le
# préfixe `CELERY_` (ex `CELERY_BROKER_URL` -> `broker_url`) — voir
# `config/settings.py` et DEPLOYMENT.md pour les variables d'environnement
# nécessaires.
app.config_from_object("django.conf:settings", namespace="CELERY")

# Découvre automatiquement `tasks.py` dans chaque app Django installée
# (`apps.tontine.tasks`, etc.) — pas de registre manuel à maintenir.
app.autodiscover_tasks()


# ---------------------------------------------------------------------------
# Beat schedule : cycles de clôture/alerte/relance des trois fréquences de
# cotisation, voir la docstring de chaque tâche dans `apps/tontine/tasks.py`
# pour le détail des cadences produit (règle 1) :
#   - Journalier  : alerte le matin -> relance l'après-midi -> clôture 23h59.
#   - Hebdomadaire: alerte J+0 -> relances J+3/J+6 -> clôture J+7 23h59.
#   - Mensuel     : alerte le 1er -> relances 2x/semaine -> clôture fin de mois 23h59.
#
# Toutes les tâches ci-dessous sont IDEMPOTENTES (voir leurs docstrings) et
# protégées par un verrou anti-exécution concurrente (`job_lock`, réutilisé
# tel quel) : une exécution manquée ou en double du beat ne peut ni verser
# deux pots, ni créer deux pénalités/dettes, ni spammer de notifications.
# Cadence volontairement plus fine (15 min) que la précision requise (23h59
# pile) : la tâche elle-même ne clôture que les tours dont l'instant de
# clôture calculé (`apps.tontine.scheduling.cloture_cutoff`, heure LOCALE) est
# effectivement dépassé, donc une cadence plus fine ne clôture jamais en
# avance, seulement avec une latence bornée (<= 15 min) après 23h59.
app.conf.beat_schedule = {
    "tontine-cloturer-tours-echeance": {
        "task": "apps.tontine.tasks.tache_cloturer_tours_echeance",
        "schedule": crontab(minute="*/15"),
    },
    "tontine-alertes-cotisation": {
        "task": "apps.tontine.tasks.tache_alertes_cotisation",
        "schedule": crontab(minute=0),  # toutes les heures
    },
    "tontine-relances-cotisation": {
        "task": "apps.tontine.tasks.tache_relances_cotisation",
        "schedule": crontab(minute=30),  # toutes les heures, décalé de l'alerte
    },
    "tontine-recouvrement-creances": {
        "task": "apps.tontine.tasks.tache_recouvrement_creances",
        "schedule": crontab(minute=20),  # toutes les heures — même cadence que l'ancien cron
    },
}
