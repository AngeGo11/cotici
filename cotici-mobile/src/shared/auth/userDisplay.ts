import type { AuthUser } from './types';

/** Prénom pour la salutation, ou username / fallback. */
export function getGreetingName(user: AuthUser | null): string {
  if (!user) return 'toi';
  const first = user.first_name.trim();
  if (first) return first;
  const u = user.username.trim();
  if (u) return u;
  return 'toi';
}

export function getUserInitials(user: AuthUser | null): string {
  if (!user) return '?';
  const fi = user.first_name.trim();
  const la = user.last_name.trim();
  if (fi && la) {
    return `${fi.charAt(0)}${la.charAt(0)}`.toUpperCase();
  }
  if (fi.length >= 2) return fi.slice(0, 2).toUpperCase();
  if (fi.length === 1) return `${fi.charAt(0)}${fi.charAt(0)}`.toUpperCase();
  const u = user.username.trim();
  if (u.length >= 2) return u.slice(0, 2).toUpperCase();
  if (u.length === 1) return `${u.charAt(0)}?`.toUpperCase();
  return '?';
}

/** Affichage solde style carte (points milliers), sans décimales parasites. */
/** Montant signé pour entrées (+) / sorties (−) du mois. */
export function formatMonthlyFlow(
  value: string | number | undefined,
  kind: 'in' | 'out',
): string {
  const n = parseBalanceNumber(value);
  if (n === null) return '—';
  const formatted = n.toLocaleString('fr-FR', { maximumFractionDigits: 0 });
  const prefix = kind === 'in' ? '+' : '−';
  return `${prefix}${formatted} F`;
}

function parseBalanceNumber(value: string | number | undefined | null): number | null {
  if (value === undefined || value === null || value === '') return null;
  const n = typeof value === 'number' ? value : Number(String(value).replace(/\s/g, ''));
  return Number.isFinite(n) ? Math.round(n) : null;
}

export function formatFcfaDots(value: string | number | undefined): string {
  if (value === undefined || value === null) return '—';
  const n =
    typeof value === 'string'
      ? parseFloat(value.replace(',', '.'))
      : Number(value);
  if (Number.isNaN(n)) return '—';
  const int = Math.trunc(n);
  return int.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

export function getDisplayFullName(user: AuthUser | null): string {
  if (!user) return '';
  const parts = [user.first_name.trim(), user.last_name.trim()].filter(Boolean);
  if (parts.length) return parts.join(' ');
  return user.username.trim() || user.numero_telephone;
}
