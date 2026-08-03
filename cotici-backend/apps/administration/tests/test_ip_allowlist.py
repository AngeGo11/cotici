"""Vérifie `AdminIpAllowlistMiddleware` : allowlist vide (comportement selon
DEBUG), CIDR autorisé/refusé, et absence d'effet sur les endpoints hors
`/api/admin/`."""
from django.test import TestCase, override_settings
from rest_framework.test import APIClient


class IpAllowlistTests(TestCase):
    def setUp(self):
        self.client = APIClient()

    @override_settings(ADMIN_IP_ALLOWLIST="", DEBUG=False)
    def test_empty_allowlist_denies_when_debug_false(self):
        resp = self.client.get("/api/admin/auth/csrf/", REMOTE_ADDR="127.0.0.1")
        self.assertEqual(resp.status_code, 403)

    @override_settings(ADMIN_IP_ALLOWLIST="", DEBUG=True)
    def test_empty_allowlist_allows_when_debug_true(self):
        resp = self.client.get("/api/admin/auth/csrf/", REMOTE_ADDR="127.0.0.1")
        self.assertEqual(resp.status_code, 200)

    @override_settings(ADMIN_IP_ALLOWLIST="10.0.0.0/8", DEBUG=False)
    def test_ip_outside_cidr_is_denied(self):
        resp = self.client.get("/api/admin/auth/csrf/", REMOTE_ADDR="127.0.0.1")
        self.assertEqual(resp.status_code, 403)

    @override_settings(ADMIN_IP_ALLOWLIST="127.0.0.0/8", DEBUG=False)
    def test_ip_inside_cidr_is_allowed(self):
        resp = self.client.get("/api/admin/auth/csrf/", REMOTE_ADDR="127.0.0.1")
        self.assertEqual(resp.status_code, 200)

    @override_settings(ADMIN_IP_ALLOWLIST="10.0.0.0/8", DEBUG=False)
    def test_allowlist_does_not_affect_non_admin_endpoints(self):
        resp = self.client.get("/api/audits/health/", REMOTE_ADDR="127.0.0.1")
        self.assertEqual(resp.status_code, 200)

    @override_settings(ADMIN_IP_ALLOWLIST="10.0.0.0/24", ADMIN_TRUSTED_PROXY_COUNT=1, DEBUG=False)
    def test_trusted_proxy_reads_client_ip_from_forwarded_for(self):
        # "client, proxy" : avec 1 proxy de confiance, l'IP cliente réelle est
        # l'avant-dernière entrée (`10.0.0.5`), REMOTE_ADDR étant celle du proxy.
        resp = self.client.get(
            "/api/admin/auth/csrf/",
            REMOTE_ADDR="203.0.113.9",
            HTTP_X_FORWARDED_FOR="10.0.0.5, 203.0.113.9",
        )
        self.assertEqual(resp.status_code, 200)

    @override_settings(ADMIN_IP_ALLOWLIST="10.0.0.0/24", ADMIN_TRUSTED_PROXY_COUNT=0, DEBUG=False)
    def test_forwarded_for_ignored_when_no_trusted_proxy(self):
        # ADMIN_TRUSTED_PROXY_COUNT=0 : X-Forwarded-For ne doit JAMAIS être
        # consulté, même s'il contient une IP autorisée (anti-spoofing).
        resp = self.client.get(
            "/api/admin/auth/csrf/",
            REMOTE_ADDR="203.0.113.9",
            HTTP_X_FORWARDED_FOR="10.0.0.5",
        )
        self.assertEqual(resp.status_code, 403)
