"""Routeur DRF du back-office (`/api/admin/`).

`StaffViewSet`, `TontineViewSet`, `WalletViewSet` et `TransactionAdminViewSet`
sont routés ; les autres modules métier (users, cagnottes, settings, metrics)
restent en stub non routés (voir `api/views/*.py`).
"""
from __future__ import annotations

from rest_framework.routers import DefaultRouter

from apps.administration.api.views.cagnottes import CagnotteViewSet
from apps.administration.api.views.disputes import DisputeViewSet
from apps.administration.api.views.kyc import KycViewSet
from apps.administration.api.views.savings import AdminSavingsViewSet
from apps.administration.api.views.solidarity import SolidarityViewSet
from apps.administration.api.views.staff import StaffViewSet
from apps.administration.api.views.tontines import TontineViewSet
from apps.administration.api.views.transactions import TransactionAdminViewSet
from apps.administration.api.views.users import AdminUserViewSet
from apps.administration.api.views.wallets import WalletViewSet

router = DefaultRouter()
router.register("staff", StaffViewSet, basename="admin-staff")
router.register("tontines", TontineViewSet, basename="admin-tontines")
router.register("wallets", WalletViewSet, basename="admin-wallets")
router.register("transactions", TransactionAdminViewSet, basename="admin-transactions")
router.register("solidarity", SolidarityViewSet, basename="admin-solidarity")
router.register("users", AdminUserViewSet, basename="admin-users")
router.register("savings", AdminSavingsViewSet, basename="admin-savings")
router.register("cagnottes", CagnotteViewSet, basename="admin-cagnottes")
router.register("disputes", DisputeViewSet, basename="admin-disputes")
router.register("kyc", KycViewSet, basename="admin-kyc")
