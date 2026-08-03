"""Tests pour PushDevice/NotificationPreference : réattribution de token,
IDOR sur les endpoints devices/préférences.
"""
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from apps.authn.models import User
from apps.notifications.models import NotificationPreference, PushDevice


def _create_user(username: str, phone: str) -> User:
    return User.objects.create_user(
        username=username, password="testpass123", code_pin="1234", numero_telephone=phone
    )


class PushDeviceReassignmentTests(APITestCase):
    """Un token Expo est unique globalement : le reposer avec un autre user le migre."""

    def setUp(self):
        self.user_a = _create_user("push_user_a", "22507100001")
        self.user_b = _create_user("push_user_b", "22507100002")

    def test_register_device_creates_it_for_current_user(self):
        self.client.force_authenticate(user=self.user_a)
        response = self.client.post(
            reverse("push-device-register"),
            {"expo_token": "ExponentPushToken[abc]", "platform": "ios"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data, {"ok": True})
        device = PushDevice.objects.get(expo_token="ExponentPushToken[abc]")
        self.assertEqual(device.user_id, self.user_a.id)
        self.assertTrue(device.is_active)

    def test_reposting_same_token_migrates_ownership_to_new_user(self):
        """Cas critique : le téléphone change de propriétaire, le token Expo est réémis."""
        PushDevice.objects.create(
            user=self.user_a,
            expo_token="ExponentPushToken[shared]",
            platform=PushDevice.Platform.ANDROID,
        )

        self.client.force_authenticate(user=self.user_b)
        response = self.client.post(
            reverse("push-device-register"),
            {"expo_token": "ExponentPushToken[shared]", "platform": "android"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        # Un seul device pour ce token, désormais rattaché à user_b.
        self.assertEqual(PushDevice.objects.filter(expo_token="ExponentPushToken[shared]").count(), 1)
        device = PushDevice.objects.get(expo_token="ExponentPushToken[shared]")
        self.assertEqual(device.user_id, self.user_b.id)
        self.assertFalse(PushDevice.objects.filter(user=self.user_a).exists())

    def test_register_device_idempotent_for_same_user(self):
        self.client.force_authenticate(user=self.user_a)
        payload = {"expo_token": "ExponentPushToken[idem]", "platform": "ios"}
        self.client.post(reverse("push-device-register"), payload, format="json")
        self.client.post(reverse("push-device-register"), payload, format="json")
        self.assertEqual(PushDevice.objects.filter(expo_token="ExponentPushToken[idem]").count(), 1)

    def test_unregister_device_removes_own_device(self):
        PushDevice.objects.create(
            user=self.user_a, expo_token="ExponentPushToken[del]", platform=PushDevice.Platform.IOS
        )
        self.client.force_authenticate(user=self.user_a)
        response = self.client.delete(
            reverse("push-device-unregister", args=["ExponentPushToken[del]"])
        )
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(PushDevice.objects.filter(expo_token="ExponentPushToken[del]").exists())

    def test_unregister_device_idor_does_not_delete_other_users_device(self):
        PushDevice.objects.create(
            user=self.user_a, expo_token="ExponentPushToken[protected]", platform=PushDevice.Platform.IOS
        )
        self.client.force_authenticate(user=self.user_b)
        response = self.client.delete(
            reverse("push-device-unregister", args=["ExponentPushToken[protected]"])
        )
        # Silencieux (pas de fuite d'existence), mais le device de A doit survivre.
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertTrue(PushDevice.objects.filter(expo_token="ExponentPushToken[protected]").exists())
        self.assertEqual(
            PushDevice.objects.get(expo_token="ExponentPushToken[protected]").user_id, self.user_a.id
        )

    def test_unauthenticated_register_rejected(self):
        response = self.client.post(
            reverse("push-device-register"),
            {"expo_token": "x", "platform": "ios"},
            format="json",
        )
        self.assertIn(
            response.status_code, (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN)
        )


class NotificationPreferenceApiTests(APITestCase):
    def setUp(self):
        self.user_a = _create_user("pref_user_a", "22507100003")
        self.user_b = _create_user("pref_user_b", "22507100004")

    def test_get_preferences_creates_default_on_first_access(self):
        self.client.force_authenticate(user=self.user_a)
        response = self.client.get(reverse("notification-preferences"))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["push_enabled"], True)
        self.assertEqual(response.data["categories_muted"], [])

    def test_patch_updates_only_own_preferences(self):
        NotificationPreference.objects.create(user=self.user_b, push_enabled=True)

        self.client.force_authenticate(user=self.user_a)
        response = self.client.patch(
            reverse("notification-preferences"),
            {"push_enabled": False, "categories_muted": ["cotisation"]},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertFalse(response.data["push_enabled"])
        self.assertEqual(response.data["categories_muted"], ["cotisation"])

        pref_b = NotificationPreference.objects.get(user=self.user_b)
        self.assertTrue(pref_b.push_enabled)  # B non affecté (IDOR)

    def test_patch_rejects_invalid_category(self):
        self.client.force_authenticate(user=self.user_a)
        response = self.client.patch(
            reverse("notification-preferences"),
            {"categories_muted": ["not-a-real-category"]},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_unauthenticated_access_rejected(self):
        response = self.client.get(reverse("notification-preferences"))
        self.assertIn(
            response.status_code, (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN)
        )
