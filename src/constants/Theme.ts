import { Colors } from '@/constants/Colors';

/**
 * Tokens d’interface : espacements (base 4px), rayons, ombres, fonds.
 * À réutiliser progressivement sur les écrans pour homogénéiser COTICI.
 */
export const Theme = {
  screen: {
    /** Fond par défaut derrière cartes blanches */
    bg: Colors.gray[50],
    /** Cartes / surfaces pleine largeur */
    surface: Colors.white,
  },

  spacing: {
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 24,
    xxl: 32,
    /** Marge horizontale standard des écrans */
    page: 24,
  },

  radius: {
    sm: 12,
    md: 16,
    lg: 20,
    xl: 24,
    pill: 999,
  },

  /** Ombres légères (iOS + Android elevation) */
  shadow: {
    /** Cartes blanches sur fond gris */
    card: {
      shadowColor: Colors.black,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.06,
      shadowRadius: 14,
      elevation: 3,
    },
    /** Moins prononcée — listes, lignes */
    soft: {
      shadowColor: Colors.black,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.04,
      shadowRadius: 8,
      elevation: 2,
    },
    /** Carte solde orange — halo chaud */
    brandHero: {
      shadowColor: '#C2410C',
      shadowOffset: { width: 0, height: 10 },
      shadowOpacity: 0.22,
      shadowRadius: 20,
      elevation: 8,
    },
    /** FAB central */
    fab: {
      shadowColor: '#9A3412',
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.35,
      shadowRadius: 12,
      elevation: 10,
    },
    /** Carte accent vert (épargne / succès) */
    successHero: {
      shadowColor: '#065F46',
      shadowOffset: { width: 0, height: 10 },
      shadowOpacity: 0.22,
      shadowRadius: 18,
      elevation: 8,
    },
  },
} as const;
