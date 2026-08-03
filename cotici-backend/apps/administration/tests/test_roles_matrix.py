"""Vérifie l'intégrité de la matrice de permissions (`domain/roles.py`).

Ce test protège contre deux régressions silencieuses classiques :
- une faute de frappe dans un code de permission attribué à un rôle
  (qui accorderait/refuserait silencieusement le mauvais droit) ;
- une dérive de la règle métier "le rôle auditeur est strictement en
  lecture seule".
"""
from django.test import SimpleTestCase

from apps.administration.domain.roles import ROLE_PERMISSIONS, Perm, StaffRole, has_perm


class RolesMatrixTests(SimpleTestCase):
    def test_all_roles_have_an_entry(self):
        for role in StaffRole.values:
            self.assertIn(role, ROLE_PERMISSIONS, f"Rôle {role} sans entrée dans ROLE_PERMISSIONS.")

    def test_no_unknown_permission_code(self):
        known = Perm.all()
        for role, perms in ROLE_PERMISSIONS.items():
            unknown = perms - known
            self.assertFalse(unknown, f"Rôle {role} détient des codes de permission inconnus: {unknown}")

    def test_auditeur_is_strictly_read_only(self):
        for perm in ROLE_PERMISSIONS[StaffRole.AUDITEUR]:
            self.assertTrue(
                perm.endswith(".read"),
                f"Le rôle auditeur détient une permission non-lecture: {perm}",
            )

    def test_super_admin_has_every_permission(self):
        self.assertEqual(ROLE_PERMISSIONS[StaffRole.SUPER_ADMIN], Perm.all())

    def test_has_perm_fails_closed_for_unknown_role(self):
        self.assertFalse(has_perm("role_inexistant", Perm.USER_READ))
        self.assertFalse(has_perm(None, Perm.USER_READ))

    def test_has_perm_true_for_granted_permission(self):
        self.assertTrue(has_perm(StaffRole.SUPPORT, Perm.USER_READ))

    def test_has_perm_false_for_ungranted_permission(self):
        self.assertFalse(has_perm(StaffRole.SUPPORT, Perm.STAFF_MANAGE))
        self.assertFalse(has_perm(StaffRole.AUDITEUR, Perm.USER_SUSPEND))

    def test_only_super_admin_can_manage_staff(self):
        for role, perms in ROLE_PERMISSIONS.items():
            if role == StaffRole.SUPER_ADMIN:
                continue
            self.assertNotIn(
                Perm.STAFF_MANAGE, perms, f"Le rôle {role} ne devrait pas pouvoir gérer le staff."
            )
