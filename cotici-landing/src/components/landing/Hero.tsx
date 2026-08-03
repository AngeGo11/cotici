import { motion, useReducedMotion } from 'framer-motion';
import heroMockup from '../../assets/mockup-hero-hs.png';
import { easeOutExpo, fadeUp, slideFromRight, staggerContainer } from '../../lib/motion';

const STORE_ICONS = {
  'Google Play': {
    src: 'https://img.icons8.com/color/48/google-play.png',
    alt: 'Google Play',
    width: 48,
    height: 48,
  },
  'App Store': {
    src: 'https://img.icons8.com/liquid-glass-color/32/apple-app-store.png',
    alt: 'Apple App Store',
    width: 32,
    height: 32,
  },
} as const;

function StoreBadge({ store }: { store: keyof typeof STORE_ICONS }) {
  const icon = STORE_ICONS[store];
  const reduce = useReducedMotion();

  return (
    <motion.a
      href="#telecharger"
      className="inline-flex min-h-[52px] min-w-[180px] items-center gap-3 rounded-xl bg-white px-4 py-3 text-slate-900 shadow-lg shadow-slate-900/8 ring-1 ring-slate-900/5"
      variants={fadeUp}
      whileHover={
        reduce
          ? undefined
          : { y: -4, scale: 1.02, boxShadow: '0 20px 40px rgba(0,80,50,0.12)' }
      }
      whileTap={reduce ? undefined : { scale: 0.98 }}
    >
      <img
        src={icon.src}
        alt={icon.alt}
        width={icon.width}
        height={icon.height}
        className="h-10 w-10 shrink-0 object-contain"
        loading="lazy"
      />
      <span className="text-left leading-tight">
        <span className="block text-[10px] font-light text-slate-500">Disponible sur</span>
        <span className="block text-sm font-semibold">{store}</span>
      </span>
    </motion.a>
  );
}

export function Hero() {
  const reduce = useReducedMotion();

  return (
    <section
      id="accueil"
      className="relative overflow-hidden bg-mesh-light bg-gradient-to-br from-white via-stone-50/90 to-brand-light/30"
    >
      <div
        className="pointer-events-none absolute -right-24 top-0 h-[28rem] w-[28rem] rounded-full bg-brand/10 blur-3xl animate-orb-drift"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute bottom-0 left-1/4 h-80 w-80 rounded-full bg-accent-light/50 blur-3xl animate-orb-drift-reverse"
        aria-hidden
      />

      <div className="relative mx-auto grid max-w-7xl items-center gap-10 px-4 py-14 sm:px-6 sm:py-20 lg:grid-cols-[1fr_minmax(220px,360px)] lg:gap-12 lg:py-16 lg:px-8 xl:grid-cols-[1fr_400px]">
        <motion.div
          className="z-10 max-w-xl lg:py-6"
          initial={reduce ? false : 'hidden'}
          animate="visible"
          variants={staggerContainer}
        >
          <motion.p
            className="mb-4 inline-block rounded-full border border-brand/20 bg-white/80 px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.2em] text-brand backdrop-blur-sm"
            variants={fadeUp}
          >
            Fintech · Afrique de l&apos;Ouest
          </motion.p>
          <motion.h1
            className="font-display text-4xl font-bold leading-[1.05] tracking-tight text-slate-900 sm:text-5xl lg:text-[3.35rem]"
            variants={fadeUp}
          >
            Téléchargez, Cotisez,{' '}
            <span className="text-gradient-brand">Épargnez ensemble !</span>
          </motion.h1>
          <motion.p
            className="mt-6 max-w-lg text-base font-light leading-relaxed text-slate-500 sm:text-lg"
            variants={fadeUp}
          >
            Gérez tontines de groupe, solidarité, cagnottes d&apos;association et épargne
            personnelle de façon simple, rapide et sécurisée.
          </motion.p>
          <motion.div
            id="telecharger"
            className="mt-10 flex flex-col gap-3 sm:flex-row sm:flex-wrap"
            variants={staggerContainer}
          >
            <StoreBadge store="Google Play" />
            <StoreBadge store="App Store" />
          </motion.div>
        </motion.div>

        <motion.div
          className="perspective-mockup relative flex min-h-[300px] items-center justify-center py-4 sm:min-h-[360px] lg:min-h-[500px] lg:justify-end lg:py-0"
          initial={reduce ? false : 'hidden'}
          animate="visible"
          variants={slideFromRight}
          transition={{ duration: 0.9, delay: 0.15, ease: easeOutExpo }}
        >
          <div
            className="pointer-events-none absolute inset-0 rounded-full bg-gradient-to-tr from-brand/15 to-accent/10 blur-3xl"
            aria-hidden
          />
          <motion.img
            src={heroMockup}
            alt="Application COTICI sur iPhone — accueil, solde et tontines"
            width={619}
            height={1032}
            className={`relative z-10 w-full max-w-[min(100%,290px)] object-contain mix-blend-multiply sm:max-w-[340px] lg:max-h-[min(75vh,580px)] lg:max-w-[360px] xl:max-w-[400px] ${
              reduce ? '' : 'animate-float-phone'
            }`}
            loading="eager"
            decoding="async"
            whileHover={reduce ? undefined : { scale: 1.02, rotate: 1 }}
            transition={{ type: 'spring', stiffness: 200, damping: 22 }}
          />
        </motion.div>
      </div>
    </section>
  );
}
