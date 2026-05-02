from django.conf import settings
from django.db import models
from django.utils.translation import gettext_lazy as _

class AuditLog(models.Model):

    class Action(models.TextChoices):
        # Auth / compte
        SIGNUP = "signup", _("Inscription")
        LOGIN = "login", _("Connexion")
        LOGOUT = "logout", _("Déconnexion")
        PIN_CHANGED = "pin_changed", _("PIN modifié")
        PROFILE_UPDATED = "profile_updated", _("Profil mis à jour")

        # Wallet / transactions
        WALLET_CREATED = "wallet_created", _("Portefeuille créé")
        DEPOSIT_INITIATED = "deposit_initiated", _("Dépôt initié")
        DEPOSIT_CONFIRMED = "deposit_confirmed", _("Dépôt confirmé")
        WITHDRAWAL_INITIATED = "withdrawal_initiated", _("Retrait initié")
        WITHDRAWAL_CONFIRMED = "withdrawal_confirmed", _("Retrait confirmé")
        WITHDRAWAL_REJECTED = "withdrawal_rejected", _("Retrait rejeté")
        TRANSFER_INITIATED = "transfer_initiated", _("Transfert initié")
        TRANSFER_COMPLETED = "transfer_completed", _("Transfert effectué")
        TRANSFER_FAILED = "transfer_failed", _("Transfert échoué")
        TRANSACTION_CREATED = "transaction_created", _("Transaction créée")
        TRANSACTION_SUCCEEDED = "transaction_succeeded", _("Transaction réussie")
        TRANSACTION_FAILED = "transaction_failed", _("Transaction échouée")
        TRANSACTION_CANCELLED = "transaction_cancelled", _("Transaction annulée")

        # Épargne
        SAVINGS_GOAL_CREATED = "savings_goal_created", _("Objectif d'épargne créé")
        SAVINGS_GOAL_UPDATED = "savings_goal_updated", _("Objectif d'épargne mis à jour")
        SAVINGS_GOAL_DELETED = "savings_goal_deleted", _("Objectif d'épargne supprimé")
        SAVINGS_CONTRIBUTION_ADDED = "savings_contribution_added", _("Versement épargne ajouté")
        SAVINGS_WITHDRAWAL_REQUESTED = "savings_withdrawal_requested", _("Retrait épargne demandé")
        SAVINGS_WITHDRAWAL_APPROVED = "savings_withdrawal_approved", _("Retrait épargne approuvé")
        SAVINGS_WITHDRAWAL_REJECTED = "savings_withdrawal_rejected", _("Retrait épargne rejeté")
        SAVINGS_GOAL_REACHED = "savings_goal_reached", _("Objectif d'épargne atteint")

        # Tontine
        TONTINE_CREATED = "tontine_created", _("Tontine créée")
        TONTINE_UPDATED = "tontine_updated", _("Tontine mise à jour")
        TONTINE_CLOSED = "tontine_closed", _("Tontine clôturée")
        MEMBER_INVITED = "member_invited", _("Membre invité")
        MEMBER_JOINED = "member_joined", _("Membre rejoint")
        MEMBER_LEFT = "member_left", _("Membre parti")
        MEMBER_REMOVED = "member_removed", _("Membre retiré")
        RULE_UPDATED = "rule_updated", _("Règles de tontine mises à jour")
        CONTRIBUTION_RECORDED = "contribution_recorded", _("Cotisation enregistrée")
        PENALTY_ASSIGNED = "penalty_assigned", _("Pénalité attribuée")
        PENALTY_PAID = "penalty_paid", _("Pénalité réglée")
        ROUND_STARTED = "round_started", _("Tour démarré")
        ROUND_CLOSED = "round_closed", _("Tour clôturé")
        PAYOUT_EXECUTED = "payout_executed", _("Décaissement effectué")

        # Solidarité
        SOLIDARITY_GROUP_CREATED = "solidarity_group_created", _("Groupe solidaire créé")
        AID_REQUEST_CREATED = "aid_request_created", _("Demande d'aide créée")
        AID_REQUEST_VALIDATED = "aid_request_validated", _("Demande d'aide validée")
        AID_REQUEST_REJECTED = "aid_request_rejected", _("Demande d'aide rejetée")
        AID_DISBURSEMENT_EXECUTED = "aid_disbursement_executed", _("Aide décaissée")

        # Invitations
        INVITATION_LINK_GENERATED = "invitation_link_generated", _("Lien d'invitation généré")
        INVITATION_SENT = "invitation_sent", _("Invitation envoyée")
        INVITATION_ACCEPTED = "invitation_accepted", _("Invitation acceptée")
        INVITATION_DECLINED = "invitation_declined", _("Invitation refusée")
        INVITATION_EXPIRED = "invitation_expired", _("Invitation expirée")
        INVITATION_REVOKED = "invitation_revoked", _("Invitation révoquée")

        # Conformité
        OFFBOARDING_REQUESTED = "offboarding_requested", _("Sortie demandée")
        OFFBOARDING_STARTED = "offboarding_started", _("Sortie engagée")
        OFFBOARDING_APPROVED = "offboarding_approved", _("Sortie approuvée")
        OFFBOARDING_REJECTED = "offboarding_rejected", _("Sortie refusée")
        OFFBOARDING_CANCELLED = "offboarding_cancelled", _("Sortie annulée")

        ACCOUNT_PURGED = "account_purged", _("Compte effacé")

    class Status(models.TextChoices):
        SUCCESS = "success", _("Succès")
        FAILURE = "failure", _("Échec")



    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='audit_logs',
    )
    # Snapshot du nom au moment de l'action (résiste à la suppression de l'utilisateur)
    user_display = models.CharField(max_length=255, blank=True)

    action = models.CharField(max_length=64, choices=Action.choices)
    resource = models.CharField(max_length=255, blank=True, default='-')
    status = models.CharField(
        max_length=10,
        choices=Status.choices,
        default=Status.SUCCESS,
    )
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    timestamp = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-timestamp']
        verbose_name = 'Entrée d\'audit'
        verbose_name_plural = 'Journal d\'audit'

    def __str__(self):
        return f"[{self.timestamp:%Y-%m-%d %H:%M:%S}] {self.user_display} — {self.action} — {self.resource}"
