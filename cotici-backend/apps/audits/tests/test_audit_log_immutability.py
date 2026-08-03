from django.conf import settings
from django.contrib.auth import get_user_model
from django.db import IntegrityError, transaction
from django.test import TestCase

from apps.audits.models import AdminActionLog, AuditLog

User = get_user_model()


class AuditLogImmutabilityTests(TestCase):
    """L'historique d'audit doit être en écriture seule (append-only).

    Sans cette protection, un code (ou un opérateur via l'admin) pourrait
    altérer ou effacer la trace d'une opération financière après coup,
    ce qui viderait le journal d'audit de son utilité probante.
    """

    def _create_log(self) -> AuditLog:
        return AuditLog.objects.create(
            user=None,
            user_display="Test User",
            action=AuditLog.Action.DEPOSIT_CONFIRMED,
            resource="wallet:1:transaction:REF123:montant=1000",
            status=AuditLog.Status.SUCCESS,
        )

    def test_create_is_allowed(self):
        log = self._create_log()
        self.assertIsNotNone(log.pk)

    def test_update_after_creation_is_forbidden(self):
        log = self._create_log()
        log.resource = "wallet:1:transaction:REF123:montant=999999"
        with self.assertRaises(ValueError):
            log.save()

    def test_delete_is_forbidden(self):
        log = self._create_log()
        with self.assertRaises(ValueError):
            log.delete()
        # L'entrée doit toujours exister après la tentative de suppression.
        self.assertTrue(AuditLog.objects.filter(pk=log.pk).exists())

    def test_queryset_bulk_update_is_forbidden(self):
        """`Model.save()` protège une instance déjà chargée, mais
        `QuerySet.update()` route directement en SQL sans jamais appeler
        `save()`. Sans blocage explicite au niveau du manager, un simple
        `AuditLog.objects.filter(...).update(resource=...)` contournerait
        silencieusement l'immuabilité — c'est exactement le genre de
        détournement que le journal d'audit doit rendre impossible."""
        log = self._create_log()
        original_resource = log.resource
        with self.assertRaises(ValueError):
            AuditLog.objects.filter(pk=log.pk).update(resource="wallet:1:transaction:REF123:montant=1")
        log.refresh_from_db()
        self.assertEqual(log.resource, original_resource)

    def test_queryset_bulk_delete_is_forbidden(self):
        """Même raisonnement que `test_queryset_bulk_update_is_forbidden`,
        mais pour `QuerySet.delete()` (purge en masse)."""
        log = self._create_log()
        with self.assertRaises(ValueError):
            AuditLog.objects.filter(pk=log.pk).delete()
        self.assertTrue(AuditLog.objects.filter(pk=log.pk).exists())

    def test_queryset_bulk_delete_on_full_manager_is_forbidden(self):
        """`AuditLog.objects.all().delete()` (purge totale) doit lever, pas
        seulement `.filter(...).delete()`."""
        self._create_log()
        with self.assertRaises(ValueError):
            AuditLog.objects.all().delete()
        self.assertEqual(AuditLog.objects.count(), 1)

    def test_all_action_choices_are_valid_lowercase_snake_case_values(self):
        """Chaque valeur de `AuditLog.Action` doit être une chaîne stable
        (snake_case, sans espace) : ce sont des constantes persistées en base
        et potentiellement consommées par des tableaux de bord externes —
        une faute de frappe ou un changement de casse silencieux romprait la
        cohérence de l'historique déjà écrit."""
        for member in AuditLog.Action:
            value = member.value
            self.assertEqual(value, value.lower(), f"{value!r} doit être en minuscules.")
            self.assertNotIn(" ", value, f"{value!r} ne doit pas contenir d'espace.")
            self.assertRegex(
                value, r"^[a-z0-9_]+$", f"{value!r} doit être en snake_case (lettres/chiffres/underscore)."
            )
            self.assertLessEqual(
                len(value), 64, f"{value!r} dépasse max_length=64 du champ `action`."
            )

    def test_random_draw_performed_action_is_registered(self):
        """`RANDOM_DRAW_PERFORMED` (tirage au sort de tontine) doit être
        présent dans `Action` et acceptable par le champ `action` (cohérent
        avec les migrations 0003/0004 qui l'ont ajouté à la contrainte de
        choix en base)."""
        self.assertEqual(AuditLog.Action.RANDOM_DRAW_PERFORMED, "random_draw_performed")
        log = AuditLog.objects.create(
            user=None,
            user_display="Système",
            action=AuditLog.Action.RANDOM_DRAW_PERFORMED,
            resource="tontine:1:tour:1:gagnant=membre:5",
        )
        self.assertEqual(log.action, "random_draw_performed")

    def test_can_create_a_log_for_every_registered_action(self):
        """Round-trip DB pour chaque valeur de `Action` : garantit que la
        contrainte de choix du champ `action` (voir migrations
        0003/0004_alter_auditlog_action) est bien synchronisée avec
        `AuditLog.Action` — un décalage romprait silencieusement l'écriture
        d'audit pour l'action manquante."""
        for member in AuditLog.Action:
            log = AuditLog.objects.create(
                user=None,
                user_display="Test User",
                action=member,
                resource="-",
            )
            self.assertEqual(log.action, member.value)

    _SENSITIVE_MARKERS = (
        "password", "mot_de_passe", "motdepasse", "pin", "code_pin",
        "secret", "token", "totp", "authorization", "bearer",
    )

    def test_resource_field_never_carries_a_sensitive_keyword_in_call_sites(self):
        """Balayage statique : aucun appel `AuditLog.objects.create(...)` du
        code applicatif ne doit construire `resource=` à partir d'un mot de
        passe, PIN, secret ou token. On ne peut pas garantir à 100% qu'une
        valeur sensible n'est jamais interpolée dynamiquement, mais ce test
        détecte au minimum toute référence *littérale* évidente (ex.
        `resource=f"...:{code_pin}"`) dans les fichiers appelants."""
        import pathlib
        import re

        backend_root = pathlib.Path(settings.BASE_DIR)
        apps_root = backend_root / "apps"
        offenders = []
        for path in apps_root.rglob("*.py"):
            if "/tests/" in str(path) or path.name.startswith("test_"):
                continue
            text = path.read_text(encoding="utf-8")
            for match in re.finditer(r"resource\s*=\s*(?:f?[\"'].*?[\"']|\(.*?\))", text, re.DOTALL):
                snippet = match.group(0).lower()
                for marker in self._SENSITIVE_MARKERS:
                    if marker in snippet:
                        offenders.append((str(path), marker, match.group(0)[:200]))
        self.assertEqual(
            offenders, [],
            f"Champ `resource` construit avec un identifiant sensible : {offenders}",
        )


class AdminActionLogImmutabilityTests(TestCase):
    """`AdminActionLog` doit offrir les mêmes garanties d'immuabilité que
    `AuditLog` (voir docstring du modèle)."""

    def setUp(self):
        self.actor = User.objects.create_user(
            username="admin_audit_actor",
            password="testpass123",
            code_pin="1234",
            numero_telephone="22507600001",
        )

    def _create_log(self) -> AdminActionLog:
        return AdminActionLog.objects.create(
            actor=self.actor,
            action="staff_created",
            target_type="staff_profile",
            target_id="42",
            result=AdminActionLog.Result.SUCCESS,
        )

    def test_create_is_allowed(self):
        log = self._create_log()
        self.assertIsNotNone(log.pk)

    def test_update_after_creation_is_forbidden(self):
        log = self._create_log()
        log.result = AdminActionLog.Result.FAILURE
        with self.assertRaises(ValueError):
            log.save()

    def test_delete_is_forbidden(self):
        log = self._create_log()
        with self.assertRaises(ValueError):
            log.delete()
        self.assertTrue(AdminActionLog.objects.filter(pk=log.pk).exists())

    def test_queryset_bulk_update_is_forbidden(self):
        log = self._create_log()
        with self.assertRaises(ValueError):
            AdminActionLog.objects.filter(pk=log.pk).update(result=AdminActionLog.Result.DENIED)
        log.refresh_from_db()
        self.assertEqual(log.result, AdminActionLog.Result.SUCCESS)

    def test_queryset_bulk_delete_is_forbidden(self):
        log = self._create_log()
        with self.assertRaises(ValueError):
            AdminActionLog.objects.filter(pk=log.pk).delete()
        self.assertTrue(AdminActionLog.objects.filter(pk=log.pk).exists())

    def test_actor_is_required_not_null(self):
        """`actor` est NOT NULL + PROTECT par conception (voir docstring du
        modèle) : une action admin sans acteur identifié ne doit jamais
        pouvoir être journalisée."""
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                AdminActionLog.objects.create(
                    actor=None,
                    action="staff_created",
                )

    def test_deleting_actor_is_protected_by_fk(self):
        """`actor` est en PROTECT : supprimer un utilisateur staff qui a des
        entrées d'audit à son nom doit être bloqué, sinon on perdrait la
        capacité de retrouver qui a fait quoi."""
        self._create_log()
        from django.db.models.deletion import ProtectedError

        with self.assertRaises(ProtectedError):
            self.actor.delete()
