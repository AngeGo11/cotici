from django.test import TestCase

from apps.authn.models import User
from apps.utils.utilitaires import _resolve_user_by_phone_exact


class ResolveUserByPhoneExactTests(TestCase):
    """Régression sur le correctif icontains -> exact match.

    Avant le correctif, `numero_telephone__icontains=phone[-10:]` pouvait
    faire correspondre n'importe quel compte partageant les 10 derniers
    chiffres d'un numéro (ex: 22507080910 correspondait aussi à
    33107080910), ce qui aurait pu créditer/afficher le mauvais bénéficiaire.
    """

    def setUp(self):
        self.target = User.objects.create_user(
            username="target_user",
            password="testpass123",
            code_pin="1234",
            numero_telephone="22507080910",
        )
        # Partage les 10 derniers chiffres avec `target` mais un préfixe pays
        # différent : ne doit JAMAIS être résolu à la place de `target`.
        self.decoy = User.objects.create_user(
            username="decoy_user",
            password="testpass123",
            code_pin="1234",
            numero_telephone="33107080910",
        )

    def test_exact_match_resolves_correct_user(self):
        resolved = _resolve_user_by_phone_exact("22507080910")
        self.assertEqual(resolved, self.target)

    def test_partial_suffix_match_does_not_resolve_decoy(self):
        # Un numéro qui ne correspond à AUCUN compte exactement (même s'il
        # partage un suffixe avec un compte existant) ne doit rien résoudre.
        resolved = _resolve_user_by_phone_exact("00007080910")
        self.assertIsNone(resolved)

    def test_blank_or_short_phone_resolves_to_none(self):
        self.assertIsNone(_resolve_user_by_phone_exact(""))
        self.assertIsNone(_resolve_user_by_phone_exact("123"))
