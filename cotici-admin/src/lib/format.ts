import { CURRENCY, LOCALE } from './constants';

/** Convertit une valeur API (nombre ou chaine decimale DRF) en nombre. */
export function toNumber(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Formate un montant en francs CFA : "125 000 F CFA". */
export function formatAmount(value: number | string | null | undefined): string {
  const amount = toNumber(value);
  if (amount === null) return '—';
  return new Intl.NumberFormat(LOCALE, {
    style: 'currency',
    currency: CURRENCY,
    maximumFractionDigits: 0,
  }).format(amount);
}

/** Formate un montant sans symbole de devise : "125 000". */
export function formatNumber(value: number | string | null | undefined): string {
  const amount = toNumber(value);
  if (amount === null) return '—';
  return new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 0 }).format(amount);
}

/** Formate un pourcentage : "12,5 %". */
export function formatPercent(value: number | null | undefined, fractionDigits = 1): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return new Intl.NumberFormat(LOCALE, {
    style: 'percent',
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(value);
}

function parseDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Date courte : "01/08/2026". */
export function formatDate(value: string | Date | null | undefined): string {
  const date = parseDate(value);
  if (!date) return '—';
  return new Intl.DateTimeFormat(LOCALE, { dateStyle: 'short' }).format(date);
}

/** Date et heure : "01/08/2026 14:32". */
export function formatDateTime(value: string | Date | null | undefined): string {
  const date = parseDate(value);
  if (!date) return '—';
  return new Intl.DateTimeFormat(LOCALE, {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(date);
}

/** Date au format ISO court "2026-08-01" (valeur d'un <input type="date">). */
export function toDateInputValue(value: string | Date | null | undefined): string {
  const date = parseDate(value);
  if (!date) return '';
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

/** Ecart relatif lisible : "il y a 3 h". */
export function formatRelative(value: string | Date | null | undefined): string {
  const date = parseDate(value);
  if (!date) return '—';
  const seconds = Math.round((date.getTime() - Date.now()) / 1000);
  const formatter = new Intl.RelativeTimeFormat(LOCALE, { numeric: 'auto' });
  const thresholds: [Intl.RelativeTimeFormatUnit, number][] = [
    ['second', 60],
    ['minute', 60],
    ['hour', 24],
    ['day', 30],
    ['month', 12],
  ];
  let current = seconds;
  for (const [unit, limit] of thresholds) {
    if (Math.abs(current) < limit) return formatter.format(Math.round(current), unit);
    current /= limit;
  }
  return formatter.format(Math.round(current), 'year');
}

/**
 * Masque un numero de telephone : "+225 07•••••42".
 *
 * Les donnees personnelles ne sont revelees en clair que via une action
 * explicite protegee par la permission user.pii_reveal (verifiee cote serveur)
 * et tracee dans le journal d'audit.
 */
export function maskPhone(value: string | null | undefined): string {
  if (!value) return '—';
  const trimmed = value.trim();
  const hasPlus = trimmed.startsWith('+');
  const digits = trimmed.replace(/\D/g, '');
  if (digits.length < 6) return hasPlus ? `+${digits}` : digits;

  // Indicatif pays : 3 chiffres pour la zone UEMOA (225, 226, 221...), 2 sinon.
  const countryLength = hasPlus ? (digits.length > 10 ? 3 : 2) : 0;
  const country = digits.slice(0, countryLength);
  const rest = digits.slice(countryLength);
  const head = rest.slice(0, 2);
  const tail = rest.slice(-2);
  const hidden = '•'.repeat(Math.max(rest.length - 4, 1));
  const prefix = country ? `+${country} ` : '';
  return `${prefix}${head}${hidden}${tail}`;
}

/** Masque une adresse e-mail : "ax•••@payme.ws". */
export function maskEmail(value: string | null | undefined): string {
  if (!value) return '—';
  const [local, domain] = value.split('@');
  if (!domain) return '•'.repeat(value.length);
  const head = local.slice(0, 2);
  return `${head}${'•'.repeat(Math.max(local.length - 2, 1))}@${domain}`;
}

/** Masque un identifiant long en ne gardant que les extremites. */
export function maskIdentifier(value: string | null | undefined, visible = 4): string {
  if (!value) return '—';
  if (value.length <= visible * 2) return value;
  return `${value.slice(0, visible)}…${value.slice(-visible)}`;
}

/** Nom affichable d'un membre du staff. */
export function formatFullName(input: {
  first_name?: string | null;
  last_name?: string | null;
  username?: string | null;
}): string {
  const full = [input.first_name, input.last_name].filter(Boolean).join(' ').trim();
  return full || input.username || '—';
}

/** Initiales pour l'avatar de la barre superieure. */
export function initials(input: {
  first_name?: string | null;
  last_name?: string | null;
  username?: string | null;
}): string {
  const first = input.first_name?.[0] ?? '';
  const last = input.last_name?.[0] ?? '';
  const combined = `${first}${last}`.trim();
  if (combined) return combined.toUpperCase();
  return (input.username?.slice(0, 2) ?? '?').toUpperCase();
}

/** Duree mm:ss, utilisee par le minuteur d'inactivite. */
export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}
