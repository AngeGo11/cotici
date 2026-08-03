"""Pagination par défaut des listes du back-office administrateur."""
from __future__ import annotations

from rest_framework.pagination import PageNumberPagination


class AdminPageNumberPagination(PageNumberPagination):
    page_size = 25
    page_size_query_param = "page_size"
    max_page_size = 200
