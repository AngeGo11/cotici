"""Commande CLI de bootstrap du premier compte staff (super-admin ou autre).

Exemple :
    python manage.py create_staff \\
        --username admin.principal --numero-telephone 2250700000000 \\
        --password "un-mot-de-passe-fort" --role super_admin --email admin@cotici.com

Affiche le secret TOTP et l'URI otpauth (+ un QR code ASCII en console) : le
compte devra ensuite valider son enrôlement TOTP au premier login
(`POST /api/admin/auth/totp/verify/`), le secret n'étant confirmé
(`totp_confirmed_at`) qu'à ce moment-là.
"""
from __future__ import annotations

import getpass

import pyotp
import qrcode
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from apps.administration.domain.roles import StaffRole
from apps.administration.services import staff_service


class Command(BaseCommand):
    help = "Crée le premier compte staff (bootstrap back-office administrateur)."

    def add_arguments(self, parser):
        parser.add_argument("--username", required=True, help="Nom d'utilisateur du compte staff.")
        parser.add_argument(
            "--numero-telephone", required=True, dest="numero_telephone", help="Numéro de téléphone (unique)."
        )
        parser.add_argument("--email", default="", help="Adresse email (optionnelle).")
        parser.add_argument("--first-name", default="", dest="first_name")
        parser.add_argument("--last-name", default="", dest="last_name")
        parser.add_argument(
            "--role",
            default=StaffRole.SUPER_ADMIN,
            choices=[choice.value for choice in StaffRole],
            help="Rôle attribué (défaut : super_admin).",
        )
        parser.add_argument(
            "--password",
            default=None,
            help="Mot de passe (si absent, demandé de façon interactive/masquée).",
        )

    def handle(self, *args, **options):
        password = options["password"] or getpass.getpass("Mot de passe du compte staff : ")
        if len(password) < 10:
            raise CommandError("Le mot de passe doit contenir au moins 10 caractères.")

        with transaction.atomic():
            profile = staff_service.create_staff(
                created_by=None,
                username=options["username"],
                numero_telephone=options["numero_telephone"],
                password=password,
                role=options["role"],
                email=options["email"],
                first_name=options["first_name"],
                last_name=options["last_name"],
            )

        # Génère immédiatement un secret TOTP pour affichage (le compte devra
        # tout de même le confirmer via /api/admin/auth/totp/verify/ au
        # premier login pour que `totp_confirmed_at` soit renseigné).
        secret = pyotp.random_base32()
        profile.totp_secret = secret
        profile.save(update_fields=["totp_secret", "updated_at"])
        otpauth_url = pyotp.TOTP(secret).provisioning_uri(
            name=profile.user.username, issuer_name="COTICI Admin"
        )

        self.stdout.write(self.style.SUCCESS(f"Compte staff créé : {profile.user.username} ({profile.role})"))
        self.stdout.write(f"Secret TOTP : {secret}")
        self.stdout.write(f"URI otpauth : {otpauth_url}")
        self.stdout.write("QR code (à scanner avec une app TOTP - Google Authenticator, Authy...) :")
        qr = qrcode.QRCode(border=1)
        qr.add_data(otpauth_url)
        qr.print_ascii(out=self.stdout, invert=True)
        self.stdout.write(
            self.style.WARNING(
                "Ce secret ne sera plus jamais affiché : conservez-le en lieu sûr le temps de "
                "l'enrôlement (premier appel à /api/admin/auth/totp/verify/)."
            )
        )
