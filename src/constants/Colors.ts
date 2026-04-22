const palette = {
  orange: '#FF7800',
  green: '#009E60',
  red: '#DC2626',
  blue: '#3B82F6',
  white: '#FFFFFF',
  black: '#111827',
} as const;

/** Bottom navigation & FAB — strict brand tokens for chrome */
export const NavBrand = {
  primaryOrange: '#FF7800',
  emeraldGreen: '#009E60',
  neutralGrey: '#A0A0A0',
  pureWhite: '#FFFFFF',
} as const;

export const Colors = {
  // Brand — all CTA buttons, active tab, links, interactive elements
  brand: palette.orange,

  // Success — positive amounts, progress, validation, savings growth
  success: palette.green,

  // Danger — negative amounts, late status, reject, logout, errors
  danger: palette.red,

  // Info — tips, banners, informational badges
  info: palette.blue,

  white: palette.white,
  black: palette.black,

  gray: {
    50: '#F9FAFB',
    100: '#F3F4F6',
    200: '#E5E7EB',
    300: '#D1D5DB',
    400: '#9CA3AF',
    500: '#6B7280',
    600: '#4B5563',
    700: '#374151',
    900: '#111827',
  },

  // Provider-specific (only for mobile money operator cards)
  provider: {
    orange: '#FF7800',
    mtn: '#FFCC00',
    wave: '#1DC3E0',
    moov: '#009E60',
  },
} as const;

export function withOpacity(hex: string, opacity: number): string {
  const alpha = Math.round(opacity * 255)
    .toString(16)
    .padStart(2, '0');
  return `${hex}${alpha}`;
}
