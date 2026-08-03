/** Courbes et variantes partagées — style landing premium */
export const easeOutExpo = [0.22, 1, 0.36, 1] as const;

export const springSnappy = { type: 'spring' as const, stiffness: 420, damping: 32 };

export const springSoft = { type: 'spring' as const, stiffness: 260, damping: 28 };

export const fadeUp = {
  hidden: { opacity: 0, y: 40 },
  visible: { opacity: 1, y: 0 },
};

export const fadeIn = {
  hidden: { opacity: 0 },
  visible: { opacity: 1 },
};

export const scaleIn = {
  hidden: { opacity: 0, scale: 0.92 },
  visible: { opacity: 1, scale: 1 },
};

export const slideFromRight = {
  hidden: { opacity: 0, x: 48 },
  visible: { opacity: 1, x: 0 },
};

export const staggerContainer = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.1, delayChildren: 0.05 },
  },
};

export const viewportOnce = { once: true, margin: '-60px' as const };

export const contentSwitch = {
  hidden: { opacity: 0, y: 16, filter: 'blur(4px)' },
  visible: { opacity: 1, y: 0, filter: 'blur(0px)' },
  exit: { opacity: 0, y: -12, filter: 'blur(4px)' },
};
