from apps.wallet.models import Wallet
from apps.wallet.services.monthly_stats import get_monthly_entrees_sorties


def build_user_wallet_payload(user) -> dict:
    wallet, _ = Wallet.objects.get_or_create(user=user)
    entrees, sorties = get_monthly_entrees_sorties(user)
    return {
        "id": user.id,
        "username": user.username,
        "email": user.email or "",
        "first_name": user.first_name or "",
        "last_name": user.last_name or "",
        "date_joined": user.date_joined,
        "numero_telephone": user.numero_telephone,
        "solde_courant": wallet.solde_courant,
        "entrees_ce_mois": entrees,
        "sorties_ce_mois": sorties,
    }
