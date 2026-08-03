"""Examen KYC (`/api/admin/kyc/`).

Deux invariants sont défendus ici : une décision est définitive et imputable
(pas de réécriture après coup), et aucune donnée personnelle du dossier ne
sort sans contrôle (téléphone masqué, pièces servies uniquement par
l'endpoint authentifié qui les journalise).
"""
from __future__ import annotations

from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from apps.administration.domain.audit_actions import KYC_APPROVED, KYC_REJECTED
from apps.administration.domain.roles import StaffRole
from apps.administration.services import kyc_admin_service
from apps.administration.tests.helpers import create_staff_profile, login_staff_client
from apps.audits.models import AdminActionLog
from apps.kyc.models import KycSubmission

User = get_user_model()

LIST_URL = "/api/admin/kyc/"
CLIENT_PHONE = "2250700500010"


def _create_client_user(username="client.kyc", phone=CLIENT_PHONE) -> User:
    return User.objects.create_user(
        username=username,
        password="testpass123",
        code_pin="1234",
        numero_telephone=phone,
    )


def _create_submission(user: User, **kwargs) -> KycSubmission:
    defaults = {
        "type_piece": KycSubmission.TypePiece.CNI,
        "numero_piece": "CI-0099887",
        "nom_declare": "Traore",
        "prenoms_declares": "Awa",
        "document_recto": SimpleUploadedFile("recto.jpg", b"image-recto", "image/jpeg"),
    }
    defaults.update(kwargs)
    return KycSubmission.objects.create(user=user, **defaults)


def _login(client: APIClient, *, role: str, suffix: str):
    username = f"staff.kyc.{suffix}"
    password = "Un-Mot-De-Passe-Kyc-01"
    create_staff_profile(
        username=username,
        numero_telephone=f"22507005{suffix.zfill(5)}",
        password=password,
        role=role,
    )
    login_staff_client(client, username=username, password=password)


@override_settings(ADMIN_IP_ALLOWLIST="", DEBUG=True, ADMIN_TOTP_REQUIRED=True)
class KycQueueTests(TestCase):
    def setUp(self):
        cache.clear()
        self.client = APIClient()
        _login(self.client, role=StaffRole.COMPLIANCE, suffix="1")
        self.user = _create_client_user()

    def test_queue_is_ordered_oldest_first(self):
        """Un dossier qui traîne bloque un client : le plus ancien passe en
        premier, et ce tri n'est pas négociable depuis l'API."""
        premier = _create_submission(self.user, numero_piece="A-1")
        second = _create_submission(self.user, numero_piece="A-2")

        resp = self.client.get(LIST_URL)
        self.assertEqual(resp.status_code, 200, resp.content)
        ids = [row["id"] for row in resp.data["results"]]
        self.assertEqual(ids, [premier.pk, second.pk])

    def test_list_masks_the_client_phone_number(self):
        _create_submission(self.user)
        resp = self.client.get(LIST_URL)
        self.assertNotIn(CLIENT_PHONE, resp.content.decode())
        self.assertTrue(
            resp.data["results"][0]["client_telephone_masque"].endswith(CLIENT_PHONE[-2:])
        )

    def test_filter_by_status(self):
        _create_submission(self.user)
        self.assertEqual(
            self.client.get(LIST_URL, {"statut": "EN_ATTENTE"}).data["count"], 1
        )
        self.assertEqual(
            self.client.get(LIST_URL, {"statut": "APPROUVE"}).data["count"], 0
        )

    def test_detail_lists_available_documents_but_no_urls(self):
        submission = _create_submission(
            self.user,
            selfie=SimpleUploadedFile("selfie.jpg", b"image-selfie", "image/jpeg"),
        )
        resp = self.client.get(f"{LIST_URL}{submission.pk}/")
        self.assertEqual(resp.status_code, 200, resp.content)
        self.assertEqual(sorted(resp.data["pieces_disponibles"]), ["recto", "selfie"])
        # Aucun chemin de fichier ne doit transiter vers le navigateur.
        self.assertNotIn("kyc/", resp.content.decode())


@override_settings(ADMIN_IP_ALLOWLIST="", DEBUG=True, ADMIN_TOTP_REQUIRED=True)
class KycDecisionTests(TestCase):
    def setUp(self):
        cache.clear()
        self.client = APIClient()
        _login(self.client, role=StaffRole.COMPLIANCE, suffix="2")
        self.user = _create_client_user()
        self.submission = _create_submission(self.user)

    def _url(self, action: str) -> str:
        return f"{LIST_URL}{self.submission.pk}/{action}/"

    def test_approval_requires_a_reason(self):
        resp = self.client.post(self._url("approve"), {}, format="json")
        self.assertEqual(resp.status_code, 400, resp.content)
        self.submission.refresh_from_db()
        self.assertEqual(self.submission.statut, KycSubmission.Statut.EN_ATTENTE)

    def test_approval_records_level_decider_and_audit(self):
        resp = self.client.post(
            self._url("approve"),
            {"reason": "Piece lisible et conforme"},
            format="json",
        )
        self.assertEqual(resp.status_code, 200, resp.content)

        self.submission.refresh_from_db()
        self.assertEqual(self.submission.statut, KycSubmission.Statut.APPROUVE)
        self.assertEqual(
            self.submission.niveau_accorde, KycSubmission.Niveau.NIVEAU_2
        )
        self.assertIsNotNone(self.submission.date_decision)
        self.assertIsNotNone(self.submission.decide_par)

        entry = AdminActionLog.objects.latest("timestamp")
        self.assertEqual(entry.action, KYC_APPROVED)
        self.assertEqual(entry.target_user_id, self.user.pk)

    def test_approval_can_grant_a_lower_level_than_requested(self):
        resp = self.client.post(
            self._url("approve"),
            {"reason": "Selfie absent", "niveau": KycSubmission.Niveau.NIVEAU_1},
            format="json",
        )
        self.assertEqual(resp.status_code, 200, resp.content)
        self.submission.refresh_from_db()
        self.assertEqual(self.submission.niveau_accorde, KycSubmission.Niveau.NIVEAU_1)

    def test_rejection_stores_the_reason(self):
        resp = self.client.post(
            self._url("reject"), {"reason": "Piece illisible"}, format="json"
        )
        self.assertEqual(resp.status_code, 200, resp.content)
        self.submission.refresh_from_db()
        self.assertEqual(self.submission.statut, KycSubmission.Statut.REJETE)
        self.assertEqual(self.submission.motif_decision, "Piece illisible")
        self.assertEqual(AdminActionLog.objects.latest("timestamp").action, KYC_REJECTED)

    def test_a_decided_file_cannot_be_decided_again(self):
        self.client.post(self._url("approve"), {"reason": "Conforme"}, format="json")
        resp = self.client.post(
            self._url("reject"), {"reason": "Changement d'avis"}, format="json"
        )
        self.assertEqual(resp.status_code, 409, resp.content)
        self.submission.refresh_from_db()
        self.assertEqual(self.submission.statut, KycSubmission.Statut.APPROUVE)

    def test_take_in_review_does_not_require_a_reason(self):
        resp = self.client.post(self._url("take-in-review"), {}, format="json")
        self.assertEqual(resp.status_code, 200, resp.content)
        self.submission.refresh_from_db()
        self.assertEqual(self.submission.statut, KycSubmission.Statut.EN_EXAMEN)

    def test_verified_level_is_derived_from_approved_files(self):
        self.assertEqual(kyc_admin_service.niveau_verifie_pour(self.user), "")
        self.client.post(self._url("approve"), {"reason": "Conforme"}, format="json")
        self.assertEqual(
            kyc_admin_service.niveau_verifie_pour(self.user),
            KycSubmission.Niveau.NIVEAU_2,
        )


@override_settings(ADMIN_IP_ALLOWLIST="", DEBUG=True, ADMIN_TOTP_REQUIRED=True)
class KycDocumentAccessTests(TestCase):
    def setUp(self):
        cache.clear()
        self.user = _create_client_user()
        self.submission = _create_submission(self.user)

    def test_document_is_served_and_journalized(self):
        client = APIClient()
        _login(client, role=StaffRole.COMPLIANCE, suffix="3")
        resp = client.get(f"{LIST_URL}{self.submission.pk}/document/recto/")
        # `FileResponse` n'expose pas `.content` : le corps se lit en flux.
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(b"".join(resp.streaming_content), b"image-recto")

        entry = AdminActionLog.objects.latest("timestamp")
        self.assertEqual(entry.action, "kyc_document_viewed")
        self.assertEqual(entry.target_user_id, self.user.pk)

    def test_missing_document_is_404(self):
        client = APIClient()
        _login(client, role=StaffRole.COMPLIANCE, suffix="4")
        resp = client.get(f"{LIST_URL}{self.submission.pk}/document/selfie/")
        self.assertEqual(resp.status_code, 404)

    def test_unknown_document_name_is_404(self):
        """Le nom de la pièce vient de l'URL : il ne doit jamais servir de
        `getattr` libre sur l'instance."""
        client = APIClient()
        _login(client, role=StaffRole.COMPLIANCE, suffix="5")
        resp = client.get(f"{LIST_URL}{self.submission.pk}/document/user/")
        self.assertEqual(resp.status_code, 404)

    def test_anonymous_cannot_read_a_document(self):
        resp = APIClient().get(f"{LIST_URL}{self.submission.pk}/document/recto/")
        self.assertEqual(resp.status_code, 403)


@override_settings(ADMIN_IP_ALLOWLIST="", DEBUG=True, ADMIN_TOTP_REQUIRED=True)
class KycAccessControlTests(TestCase):
    def setUp(self):
        cache.clear()
        self.user = _create_client_user()
        self.submission = _create_submission(self.user)

    def test_anonymous_is_denied(self):
        self.assertEqual(APIClient().get(LIST_URL).status_code, 403)

    def test_support_role_has_no_access_to_the_queue(self):
        """Le support ne detient pas kyc.review : un dossier KYC n'est pas un
        outil de support client."""
        client = APIClient()
        _login(client, role=StaffRole.SUPPORT, suffix="6")
        self.assertEqual(client.get(LIST_URL).status_code, 403)

    def test_operateur_can_review_but_not_decide(self):
        client = APIClient()
        _login(client, role=StaffRole.OPERATEUR, suffix="7")
        self.assertEqual(client.get(LIST_URL).status_code, 200)

    def test_auditor_cannot_decide(self):
        client = APIClient()
        _login(client, role=StaffRole.AUDITEUR, suffix="8")
        resp = client.post(
            f"{LIST_URL}{self.submission.pk}/approve/",
            {"reason": "Controle"},
            format="json",
        )
        self.assertEqual(resp.status_code, 403, resp.content)
