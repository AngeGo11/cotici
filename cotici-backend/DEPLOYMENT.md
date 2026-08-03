# Déploiement — jobs planifiés (notifications & push)

Ce projet n'a aucun orchestrateur (pas de Celery/Redis/beat). Les jobs
périodiques liés aux notifications et au push Expo sont de simples
`management commands` Django, à planifier via **cron système** sur le
serveur applicatif (ou tout scheduler équivalent : systemd timers, cron job
Kubernetes, etc.).

Toutes ces commandes sont :
- **idempotentes** (via `dedup_key` sur `Notifications`, ou re-sélection par
  statut/`next_attempt_at` pour l'outbox) : un ré-appel rapproché ou un
  chevauchement de deux exécutions ne crée jamais de doublon visible ;
- **verrouillées** via `pg_try_advisory_lock` (`apps/notifications/management/commands/_job_utils.py::job_lock`) :
  si une instance précédente tourne encore, la nouvelle sort immédiatement
  sans effectuer de travail ;
- **journalisées** via `apps.notifications.models.JobRun` (une ligne par
  `job_name`, avec `last_started_at`/`last_success_at`/`last_error`) —
  surveiller cette table (ou l'exposer via l'admin Django/back-office) pour
  détecter un cron cassé.

## Crontab recommandé

```cron
# Rappels de cotisation (J-3/J-2/J-1/J0 selon la fréquence de chaque tontine).
# Cadence horaire : suffisant pour les fenêtres HEBDOMADAIRE/MENSUEL/PERSONNALISE,
# et pour JOURNALIER (rappel unique à l'ouverture du tour, fenêtre = durée du tour).
0 * * * * cd /path/to/backend && .venv/bin/python manage.py notify_tour_reminders >> /var/log/cotici/notify_tour_reminders.log 2>&1

# Alertes de retard de cotisation (plafonnées à 2 relances). Cadence quotidienne
# par défaut (08h locale Abidjan = 08h UTC, cf. TIME_ZONE="UTC" dans settings.py).
#
# ATTENTION : le premier palier de retard JOURNALIER est à 3h après échéance
# (apps/tontine/scheduling.py::retard_offsets) — une cadence quotidienne ne le
# respecte qu'approximativement (retard de détection jusqu'à ~24h). Si des
# tontines JOURNALIER sont utilisées en production, remplacer la ligne
# ci-dessous par une cadence horaire (`0 * * * *`) : la command reste
# idempotente (dedup_key par jour calendaire local) donc sûre à exécuter plus
# souvent.
0 8 * * * cd /path/to/backend && .venv/bin/python manage.py notify_tour_overdue >> /var/log/cotici/notify_tour_overdue.log 2>&1

# Dépile PushOutbox et envoie via l'API Expo Push. Cadence : chaque minute.
* * * * * cd /path/to/backend && .venv/bin/python manage.py push_dispatch >> /var/log/cotici/push_dispatch.log 2>&1

# Vérifie les receipts Expo Push (confirmation de livraison réelle). Cadence : 15 min.
*/15 * * * * cd /path/to/backend && .venv/bin/python manage.py push_receipts >> /var/log/cotici/push_receipts.log 2>&1

# Purge des notifications/outbox anciennes, par lots de 5000. Cadence : hebdomadaire,
# hors heures de pointe (ex. dimanche 03h locale).
0 3 * * 0 cd /path/to/backend && .venv/bin/python manage.py purge_notifications >> /var/log/cotici/purge_notifications.log 2>&1

# Pénalités de retard automatiques (constat + recouvrement). Cadence HORAIRE
# (et non quotidienne) : le délai de grâce d'une tontine est exprimé en heures
# (TontineRegle.delai_grace_heures), une cadence quotidienne le respecterait
# trop approximativement. Minute 20 (et non 0) pour ne pas concourir avec
# notify_tour_overdue (minute 0). Idempotent (contrainte DB
# uniq_penalite_auto_par_tour_et_user + statut REGLEE/DEJA_TRAITEE) : sûr à
# ré-exécuter en cas de chevauchement.
20 * * * * cd /path/to/backend && .venv/bin/python manage.py apply_tontine_penalties >> /var/log/cotici/apply_tontine_penalties.log 2>&1
```

## Activation des pénalités automatiques (procédure)

`apply_tontine_penalties` ne débite JAMAIS un wallet tant que les garde-fous
suivants ne sont pas TOUS réunis (voir `apps/tontine/penalties.py::penalites_auto_actives`) :

1. **`PENALITES_AUTO_CUTOFF`** (variable d'environnement, date/heure ISO 8601,
   ex `2026-09-01T00:00:00Z`) doit être définie. Tant qu'elle est absente
   (`None`), la fonctionnalité est désactivée GLOBALEMENT, quelle que soit la
   configuration de chaque tontine. **Choisir une date future** au moment de
   l'activation : aucun tour dont `date_echeance` est antérieure à ce cutoff
   ne sera jamais pénalisable, ce qui évite un débit rétroactif massif au
   premier passage du job après mise en production de la fonctionnalité.
2. Pour chaque tontine concernée, un administrateur doit explicitement
   activer `TontineRegle.penalites_automatiques` (via `modify_tontine_regle`,
   champ modifiable même cycle démarré) — jamais activé par une migration de
   données (voir `0015_backfill_delai_grace.py`).
3. `TontineRegle.montant_penalite` doit être strictement positif (contrainte
   DB `tontineregle_penalites_auto_exigent_montant`).
4. Vérifier `delai_grace_heures` (par défaut 24h, backfillé par fréquence lors
   du déploiement — voir `0015_backfill_delai_grace.py`) : ajuster si le
   défaut ne convient pas à la tontine.

Une fois ces conditions réunies, le prochain passage horaire du job constate
(phase `constat`) puis tente de recouvrer (phase `recouvrement`) les
pénalités du payeur courant en retard sur chaque tour éligible. Utiliser
`python manage.py apply_tontine_penalties --dry-run [--tontine-id N]` pour
chiffrer l'impact avant d'activer une tontine à fort volume.

## Réparation ponctuelle

`python manage.py recompute_echeances [--tontine-id N]` recalcule le champ
dérivé `TourTontine.date_echeance` à partir de la fréquence de cotisation
actuelle de chaque tontine (`apps.tontine.scheduling.tour_echeance`, source
de vérité). À exécuter manuellement après une correction back-office d'une
règle de tontine (fréquence/`frequence_personalise` modifiée après la
création des tours), ou si une divergence est suspectée.

## Variables d'environnement

- `EXPO_ACCESS_TOKEN` (optionnel) : token d'accès Expo Push, pour des quotas
  d'envoi plus élevés. Laissé vide en dev, `apps/notifications/push/expo.py`
  n'ajoute alors aucun en-tête `Authorization`.

## Contrat de rétention (purge)

`purge_notifications` supprime :
- les notifications **lues** de plus de **90 jours** ;
- **toutes** les notifications (lues ou non) de plus de **365 jours** ;
- les entrées `PushOutbox` `SENT` de plus de **30 jours**.

Cette rétention doit **toujours** dépasser largement la fenêtre du job le
plus long qui s'appuie sur `dedup_key` pour son idempotence (actuellement :
relances de retard MENSUEL, jusqu'à échéance + 3 jours) — sinon purger une
notification revient à effacer la mémoire de son propre anti-doublon, et le
prochain passage du job la considère comme jamais envoyée et la renvoie.
