"""Tests unitaires pour apps/utils/utilitaires.py.

Couvre en priorité `_normalize_phone` (utilisée pour matcher les invitations
de tontine et résoudre un compte par numéro : un bug ici fait matcher/créditer
le mauvais utilisateur) ainsi que les autres helpers partagés du module.
"""
from decimal import Decimal

from django.test import TestCase
from rest_framework import status
from rest_framework.request import Request
from rest_framework.test import APIRequestFactory

from apps.authn.models import User
from apps.tontine.models import Tontine
from apps.wallet.models import Transaction, Wallet
from apps.utils.utilitaires import (
    _generate_qr_payload,
    _get_tontine_for_member,
    _normalize_phone,
    _paginate_and_serialize,
    _parse_amount,
    _parse_positive_decimal,
    _parse_positive_int,
    _resolve_payment_mode,
    _resolve_user_by_phone_exact,
    _serializer_error_response,
    _split_phone_prefix,
    _unique_ref,
)


class NormalizePhoneTests(TestCase):
    """`_normalize_phone` : digits-only, 15 derniers caractères max.

    Utilisée à l'inscription (RegisterSerializer) et pour résoudre un compte
    par numéro (`_resolve_user_by_phone_exact`) : toute divergence entre ces
    deux usages ferait matcher la mauvaise personne (mauvais bénéficiaire
    d'une invitation de tontine, mauvais compte crédité).
    """

    def test_strips_plus_prefix(self):
        self.assertEqual(_normalize_phone("+2250708091011"), "2250708091011")

    def test_strips_00_international_prefix_as_digits(self):
        # "00" n'est pas retiré spécifiquement en tant que préfixe
        # international : ce sont des chiffres comme les autres, donc
        # conservés tels quels (documente le comportement réel de la
        # fonction, qui ne fait AUCUNE inférence de préfixe pays).
        self.assertEqual(_normalize_phone("002250708091011"), "002250708091011")

    def test_strips_spaces_and_dashes(self):
        self.assertEqual(_normalize_phone("07 08 09 10 11"), "0708091011")
        self.assertEqual(_normalize_phone("07-08-09-10-11"), "0708091011")

    def test_strips_dots_and_parentheses(self):
        self.assertEqual(_normalize_phone("(225) 07.08.09.10.11"), "2250708091011")

    def test_ivory_coast_prefix_225(self):
        self.assertEqual(_normalize_phone("+225 07 08 09 10 11"), "2250708091011")

    def test_senegal_prefix_221(self):
        self.assertEqual(_normalize_phone("+221 77 123 45 67"), "221771234567")

    def test_burkina_faso_prefix_226(self):
        self.assertEqual(_normalize_phone("+226 70 12 34 56"), "22670123456")

    def test_empty_string_returns_empty(self):
        self.assertEqual(_normalize_phone(""), "")

    def test_none_returns_empty(self):
        self.assertEqual(_normalize_phone(None), "")

    def test_non_numeric_only_returns_empty(self):
        self.assertEqual(_normalize_phone("abc-def"), "")

    def test_mixed_alpha_numeric_keeps_only_digits(self):
        self.assertEqual(_normalize_phone("Tel:0708091011ext2"), "07080910112")

    def test_truncates_to_last_15_digits_when_too_long(self):
        too_long = "1234567890123456789"  # 19 digits
        result = _normalize_phone(too_long)
        self.assertEqual(len(result), 15)
        self.assertEqual(result, too_long[-15:])

    def test_idempotent_on_already_normalized_number(self):
        normalized = _normalize_phone("22507080910")
        self.assertEqual(_normalize_phone(normalized), normalized)

    def test_two_equivalent_inputs_normalize_identically(self):
        # Ce que l'utilisateur tape à l'inscription vs ce qu'on reçoit d'une
        # invitation/import doivent converger vers la même valeur stockable.
        a = _normalize_phone("+225 07-08-09-10-11")
        b = _normalize_phone("225070809 1011")
        self.assertEqual(a, b)


class SplitPhonePrefixTests(TestCase):
    def test_number_already_prefixed_is_not_duplicated(self):
        prefix, local = _split_phone_prefix("2250708091011", "225")
        self.assertEqual(prefix, "225")
        self.assertEqual(local, "0708091011")

    def test_number_without_prefix_gets_prefix_returned_unmodified_local(self):
        prefix, local = _split_phone_prefix("0708091011", "225")
        self.assertEqual(prefix, "225")
        self.assertEqual(local, "0708091011")

    def test_default_prefix_with_non_numeric_chars_is_normalized(self):
        prefix, local = _split_phone_prefix("0708091011", "+225")
        self.assertEqual(prefix, "225")

    def test_blank_number_returns_empty_local(self):
        prefix, local = _split_phone_prefix("", "225")
        self.assertEqual(prefix, "225")
        self.assertEqual(local, "")


class ResolveUserByPhoneExactTests(TestCase):
    """Doublon volontaire (scope authn/utils) des tests déjà présents côté
    wallet : vérifie la non-régression du correctif icontains -> exact match
    directement depuis le module utils, sans dépendance croisée de test."""

    def setUp(self):
        self.target = User.objects.create_user(
            username="target_phone_user",
            password="testpass123",
            numero_telephone="22507080910",
        )
        self.decoy = User.objects.create_user(
            username="decoy_phone_user",
            password="testpass123",
            numero_telephone="33107080910",
        )

    def test_resolves_exact_match_only(self):
        self.assertEqual(_resolve_user_by_phone_exact("22507080910"), self.target)

    def test_does_not_resolve_suffix_sharing_decoy(self):
        self.assertIsNone(_resolve_user_by_phone_exact("00007080910"))

    def test_resolves_with_formatted_input(self):
        # Le numéro fourni en entrée peut être formaté (+, espaces) : il doit
        # être normalisé avant recherche, tout comme à l'inscription.
        self.assertEqual(_resolve_user_by_phone_exact("+225 07 08 09 10"), self.target)

    def test_blank_phone_returns_none(self):
        self.assertIsNone(_resolve_user_by_phone_exact(""))

    def test_none_phone_returns_none(self):
        self.assertIsNone(_resolve_user_by_phone_exact(None))

    def test_too_short_phone_returns_none(self):
        self.assertIsNone(_resolve_user_by_phone_exact("1234567"))


class ParseAmountTests(TestCase):
    def test_none_returns_none(self):
        self.assertIsNone(_parse_amount(None))

    def test_empty_string_returns_none(self):
        self.assertIsNone(_parse_amount(""))

    def test_valid_integer_string(self):
        self.assertEqual(_parse_amount("1000"), Decimal("1000"))

    def test_valid_decimal_string_preserves_precision(self):
        self.assertEqual(_parse_amount("1000.50"), Decimal("1000.50"))

    def test_negative_amount_parses_but_is_not_rejected(self):
        # `_parse_amount` accepte les négatifs (contrairement à
        # `_parse_positive_decimal`) : documente la distinction entre les
        # deux helpers pour éviter un usage erroné côté vue.
        self.assertEqual(_parse_amount("-50"), Decimal("-50"))

    def test_zero_parses_to_zero(self):
        self.assertEqual(_parse_amount("0"), Decimal("0"))

    def test_garbage_string_returns_none(self):
        self.assertIsNone(_parse_amount("not-a-number"))

    def test_none_type_object_returns_none(self):
        self.assertIsNone(_parse_amount(object()))

    def test_float_input_via_str_roundtrip_is_exact_decimal(self):
        # On passe par str(value) avant Decimal() : évite le bruit binaire
        # d'un float direct (Decimal(0.1) != Decimal("0.1")).
        self.assertEqual(_parse_amount(1000.50), Decimal("1000.5"))


class ParsePositiveDecimalTests(TestCase):
    def test_positive_value_parses(self):
        self.assertEqual(_parse_positive_decimal("500"), Decimal("500"))

    def test_zero_is_rejected(self):
        self.assertIsNone(_parse_positive_decimal("0"))

    def test_negative_is_rejected(self):
        self.assertIsNone(_parse_positive_decimal("-500"))

    def test_none_is_rejected(self):
        self.assertIsNone(_parse_positive_decimal(None))

    def test_blank_string_is_rejected(self):
        self.assertIsNone(_parse_positive_decimal(""))

    def test_invalid_string_is_rejected(self):
        self.assertIsNone(_parse_positive_decimal("abc"))

    def test_precise_decimal_is_preserved(self):
        self.assertEqual(_parse_positive_decimal("1234.56"), Decimal("1234.56"))


class ParsePositiveIntTests(TestCase):
    def test_positive_int_string(self):
        self.assertEqual(_parse_positive_int("5"), 5)

    def test_zero_is_rejected(self):
        self.assertIsNone(_parse_positive_int("0"))

    def test_negative_is_rejected(self):
        self.assertIsNone(_parse_positive_int("-1"))

    def test_none_is_rejected(self):
        self.assertIsNone(_parse_positive_int(None))

    def test_blank_is_rejected(self):
        self.assertIsNone(_parse_positive_int(""))

    def test_float_string_is_rejected(self):
        self.assertIsNone(_parse_positive_int("1.5"))

    def test_non_numeric_is_rejected(self):
        self.assertIsNone(_parse_positive_int("abc"))


class ResolvePaymentModeTests(TestCase):
    def test_none_defaults_to_solde_cotici(self):
        self.assertEqual(_resolve_payment_mode(None), Transaction.MODE_DE_PAIEMENT.SOLDE_COTICI)

    def test_blank_defaults_to_solde_cotici(self):
        self.assertEqual(_resolve_payment_mode(""), Transaction.MODE_DE_PAIEMENT.SOLDE_COTICI)

    def test_valid_uppercase_mode(self):
        self.assertEqual(_resolve_payment_mode("ORANGE"), Transaction.MODE_DE_PAIEMENT.ORANGE)

    def test_valid_lowercase_mode_is_normalized(self):
        self.assertEqual(_resolve_payment_mode("orange"), Transaction.MODE_DE_PAIEMENT.ORANGE)

    def test_mode_with_surrounding_spaces_is_stripped(self):
        self.assertEqual(_resolve_payment_mode("  wave  "), Transaction.MODE_DE_PAIEMENT.WAVE)

    def test_unknown_mode_returns_none(self):
        self.assertIsNone(_resolve_payment_mode("BITCOIN"))


class UniqueRefTests(TestCase):
    def test_generated_ref_is_within_max_length(self):
        ref = _unique_ref("DEP")
        self.assertLessEqual(len(ref), 25)
        self.assertTrue(ref.startswith("DEP"))

    def test_generated_ref_is_unique_across_calls(self):
        refs = {_unique_ref("DEP") for _ in range(20)}
        self.assertEqual(len(refs), 20)

    def test_does_not_collide_with_existing_transaction_ref(self):
        # `_unique_ref` doit consulter la base avant de renvoyer une valeur :
        # on pré-remplit la table avec une ref candidate en forçant le hasard
        # (uuid4 patché) pour vérifier qu'un deuxième appel avec la même
        # graine ne renvoie PAS la même valeur (donc a bien retenté).
        from unittest.mock import patch
        import uuid as uuid_module

        user = User.objects.create_user(
            username="ref_user", password="x", numero_telephone="22500000001"
        )
        wallet = Wallet.objects.create(user=user)
        fixed_uuid = uuid_module.uuid4()
        candidate_ref = f"DEP{fixed_uuid.hex}"[:25]
        Transaction.objects.create(
            wallet=wallet,
            solde_courant=Decimal("0"),
            ref_transaction=candidate_ref,
            mode_de_paiement=Transaction.MODE_DE_PAIEMENT.SOLDE_COTICI,
            montant_transaction=Decimal("100"),
            statut_transaction=Transaction.STATUT_TRANSACTION.REUSSIE,
            type_transaction=Transaction.TYPE_TRANSACTION.DEPOT,
        )

        call_count = {"n": 0}
        original_uuid4 = uuid_module.uuid4

        def fake_uuid4():
            call_count["n"] += 1
            return fixed_uuid if call_count["n"] == 1 else original_uuid4()

        with patch("apps.utils.utilitaires.uuid4", side_effect=fake_uuid4):
            result = _unique_ref("DEP")

        self.assertNotEqual(result, candidate_ref)
        self.assertFalse(Transaction.objects.filter(ref_transaction=result).exists() and result == candidate_ref)


class GenerateQrPayloadTests(TestCase):
    def test_payload_within_max_length(self):
        payload = _generate_qr_payload(42)
        self.assertLessEqual(len(payload), 500)

    def test_payload_contains_tontine_id(self):
        payload = _generate_qr_payload(42)
        self.assertIn("cotici:tontine:42:", payload)

    def test_payload_is_unique_across_calls(self):
        payloads = {_generate_qr_payload(1) for _ in range(10)}
        self.assertEqual(len(payloads), 10)


class SerializerErrorResponseTests(TestCase):
    def test_single_error_message_is_unwrapped_from_list(self):
        from apps.authn.serializers import RegisterSerializer

        serializer = RegisterSerializer(data={"password": "x", "code_pin": "abcd"})
        serializer.is_valid()
        response = _serializer_error_response(serializer)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIsInstance(response.data["code_pin"], str)

    def test_custom_status_code_is_applied(self):
        from apps.authn.serializers import RegisterSerializer

        serializer = RegisterSerializer(data={"password": "x", "code_pin": "abcd"})
        serializer.is_valid()
        response = _serializer_error_response(serializer, status_code=status.HTTP_409_CONFLICT)
        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)


class GetTontineForMemberTests(TestCase):
    def setUp(self):
        self.host = User.objects.create_user(
            username="host_user", password="x", numero_telephone="22500000010"
        )
        self.outsider = User.objects.create_user(
            username="outsider_user", password="x", numero_telephone="22500000011"
        )
        self.tontine = Tontine.objects.create(
            hote=self.host,
            type_tontine=Tontine.TYPE_TONTINE.GROUPE,
            description="Tontine test",
            qr_code="qr-test",
        )

    def test_unknown_tontine_id_returns_404(self):
        tontine, error = _get_tontine_for_member(self.host, 999999)
        self.assertIsNone(tontine)
        self.assertEqual(error.status_code, status.HTTP_404_NOT_FOUND)

    def test_non_integer_id_returns_404_not_500(self):
        tontine, error = _get_tontine_for_member(self.host, "not-an-id")
        self.assertIsNone(tontine)
        self.assertEqual(error.status_code, status.HTTP_404_NOT_FOUND)

    def test_outsider_is_denied_access(self):
        tontine, error = _get_tontine_for_member(self.outsider, self.tontine.pk)
        self.assertIsNone(tontine)
        self.assertEqual(error.status_code, status.HTTP_403_FORBIDDEN)

    def test_host_can_access_own_tontine(self):
        tontine, error = _get_tontine_for_member(self.host, self.tontine.pk)
        self.assertIsNone(error)
        self.assertEqual(tontine, self.tontine)

    def test_wrong_type_filter_returns_400(self):
        tontine, error = _get_tontine_for_member(
            self.host, self.tontine.pk, type_filter=Tontine.TYPE_TONTINE.SOLIDAIRE
        )
        self.assertIsNone(tontine)
        self.assertEqual(error.status_code, status.HTTP_400_BAD_REQUEST)

    def test_deleted_tontine_returns_404(self):
        self.tontine.etat = Tontine.ETAT.SUPPRIME
        self.tontine.save()
        tontine, error = _get_tontine_for_member(self.host, self.tontine.pk)
        self.assertIsNone(tontine)
        self.assertEqual(error.status_code, status.HTTP_404_NOT_FOUND)


class PaginateAndSerializeTests(TestCase):
    def setUp(self):
        self.factory = APIRequestFactory()
        self.host = User.objects.create_user(
            username="paginate_host", password="x", numero_telephone="22500000020"
        )
        for i in range(3):
            Tontine.objects.create(
                hote=self.host,
                type_tontine=Tontine.TYPE_TONTINE.GROUPE,
                description=f"T{i}",
                qr_code=f"qr-{i}",
            )

    def test_pagination_returns_count_and_results(self):
        request = Request(self.factory.get("/fake-url/"))
        queryset = Tontine.objects.filter(hote=self.host).order_by("id")
        data = _paginate_and_serialize(request, queryset, lambda t: {"id": t.id})
        self.assertEqual(data["count"], 3)
        self.assertEqual(len(data["results"]), 3)
