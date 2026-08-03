/** Constantes globales du back-office. */

export const APP_NAME = 'COTICI Back-office';

/**
 * Base de l'API. Vide en developpement : le proxy Vite sert "/api" depuis
 * la meme origine, condition necessaire au cookie de session SameSite=Strict.
 */
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '';

/** Nom du cookie CSRF pose par Django. */
export const CSRF_COOKIE_NAME = 'csrftoken';

/** Nom de l'en-tete CSRF attendu par Django. */
export const CSRF_HEADER_NAME = 'X-CSRFToken';

/** Deconnexion automatique apres inactivite (15 min). */
export const IDLE_TIMEOUT_MS = 15 * 60 * 1000;

/** Delai avant expiration ou l'on previent l'utilisateur (1 min). */
export const IDLE_WARNING_MS = 60 * 1000;

/** Taille de page par defaut des listes paginees DRF. */
export const DEFAULT_PAGE_SIZE = 25;

export const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

/** Devise unique de la plateforme (zone UEMOA). */
export const CURRENCY = 'XOF';

export const LOCALE = 'fr-FR';
