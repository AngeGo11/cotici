"""Catalogue des actions journalisées pour le back-office (AdminActionLog).

Séparé du catalogue `apps.audits.models.AuditLog.Action` (qui couvre les
actions "métier" côté application mobile) : ce module ne couvre que les
actions déclenchées depuis le périmètre `/api/admin/`.
"""
from __future__ import annotations

# Auth / session staff
ADMIN_LOGIN_SUCCESS = "admin_login_success"
ADMIN_LOGIN_FAILED = "admin_login_failed"
ADMIN_TOTP_SETUP = "admin_totp_setup"
ADMIN_TOTP_VERIFIED = "admin_totp_verified"
ADMIN_TOTP_FAILED = "admin_totp_failed"
ADMIN_LOGOUT = "admin_logout"
ADMIN_LOGOUT_ALL = "admin_logout_all"

# Gestion du staff
STAFF_CREATED = "staff_created"
STAFF_ROLE_CHANGED = "staff_role_changed"
STAFF_DEACTIVATED = "staff_deactivated"
STAFF_REACTIVATED = "staff_reactivated"
STAFF_TOTP_RESET = "staff_totp_reset"

# Utilisateurs (phase 1 — définis dès maintenant pour stabiliser les codes)
USER_SUSPENDED = "user_suspended"
USER_REACTIVATED = "user_reactivated"
USER_PII_REVEALED = "user_pii_revealed"

# KYC (phase 1)
KYC_APPROVED = "kyc_approved"
KYC_REJECTED = "kyc_rejected"

# Wallet / transactions (phase 1)
WALLET_ADJUSTED = "wallet_adjusted"
TRANSACTION_FORCED_STATUS = "transaction_forced_status"

# Tontine / cagnotte (phase 1)
TONTINE_MODERATED = "tontine_moderated"
CAGNOTTE_MODERATED = "cagnotte_moderated"

# Litiges (phase 1)
DISPUTE_RESOLVED = "dispute_resolved"

# Réglages plateforme (phase 1)
SETTINGS_CHANGED = "settings_changed"

# Lecture générique (utilisé par défaut par AdminAuditTrailMiddleware quand
# aucune action métier n'a été explicitement définie par la vue).
ADMIN_REQUEST = "admin_request"


# Actions considérées comme sensibles : elles DOIVENT être accompagnées d'un
# motif (`reason`) non vide (voir AuditedActionMixin). Toute action absente de
# ce set est traitée comme non sensible (reason optionnel).
SENSITIVE_ACTIONS: frozenset[str] = frozenset(
    {
        STAFF_ROLE_CHANGED,
        STAFF_DEACTIVATED,
        STAFF_REACTIVATED,
        STAFF_TOTP_RESET,
        USER_SUSPENDED,
        USER_REACTIVATED,
        USER_PII_REVEALED,
        KYC_APPROVED,
        KYC_REJECTED,
        WALLET_ADJUSTED,
        TRANSACTION_FORCED_STATUS,
        TONTINE_MODERATED,
        CAGNOTTE_MODERATED,
        DISPUTE_RESOLVED,
        SETTINGS_CHANGED,
    }
)


def is_sensitive(action: str) -> bool:
    """Une action "sensible" modifie un état métier ou touche à des données
    personnelles : elle doit toujours être motivée (`reason`)."""
    return action in SENSITIVE_ACTIONS
