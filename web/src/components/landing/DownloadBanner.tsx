import { ArrowRight } from 'lucide-react';
import { motion, useReducedMotion } from 'framer-motion';
import heroMockup from '../../assets/mockup-hero-hs.png';
import paiementMobile from '../../assets/paiement-mobile-portrait.png';
import { easeOutExpo, fadeUp, slideFromRight, staggerContainer } from '../../lib/motion';
import { Reveal } from '../motion';

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
      className="inline-flex min-h-[52px] min-w-[180px] items-center gap-3 rounded-xl bg-white px-4 py-3 text-slate-900 shadow-lg transition hover:bg-stone-50"
      variants={fadeUp}
      whileHover={reduce ? undefined : { y: -3, scale: 1.02 }}
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

export function DownloadBanner() {
  const reduce = useReducedMotion();

  return (
    <section className="relative overflow-hidden bg-brand-dark px-4 py-14 sm:px-6 sm:py-20 lg:px-8">
      <motion.div
        className="bg-grid-cta pointer-events-none absolute inset-0 opacity-40"
        aria-hidden
        animate={reduce ? undefined : { opacity: [0.3, 0.45, 0.3] }}
        transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
      />
      <div
        className="pointer-events-none absolute -left-16 top-1/4 h-64 w-64 rounded-full bg-white/5 blur-3xl animate-orb-drift"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -right-20 bottom-0 h-80 w-80 rounded-full bg-brand/30 blur-3xl animate-orb-drift-reverse"
        aria-hidden
      />

      <div className="relative mx-auto grid max-w-7xl items-center gap-10 lg:grid-cols-2 lg:gap-12">
        <Reveal as="div">
          <motion.div
            initial={reduce ? false : 'hidden'}
            whileInView="visible"
            viewport={{ once: true, margin: '-80px' }}
            variants={staggerContainer}
          >
            <motion.h2
              className="font-display text-3xl font-bold text-white sm:text-4xl"
              variants={fadeUp}
            >
              Téléchargez l&apos;app COTICI
            </motion.h2>
            <motion.p
              className="mt-4 max-w-md text-base font-light leading-relaxed text-white/85"
              variants={fadeUp}
            >
              Rejoignez des groupes qui épargnent ensemble en Côte d&apos;Ivoire et en Afrique de
              l&apos;Ouest. Gratuit, sécurisé, 100 % Mobile Money.
            </motion.p>

            <motion.div
              className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap"
              variants={staggerContainer}
            >
              <StoreBadge store="Google Play" />
              <StoreBadge store="App Store" />
            </motion.div>

            <motion.a
              href="#telecharger"
              className="btn-shine mt-6 inline-flex min-h-[48px] items-center gap-2 rounded-full border border-white/30 bg-white/10 px-7 py-3 text-sm font-semibold text-white backdrop-blur-sm"
              variants={fadeUp}
              whileHover={reduce ? undefined : { scale: 1.03, backgroundColor: 'rgba(255,255,255,0.2)' }}
              whileTap={reduce ? undefined : { scale: 0.98 }}
            >
              Commencer gratuitement
              <ArrowRight className="h-4 w-4" />
            </motion.a>
          </motion.div>
        </Reveal>

        <motion.div
          className="relative flex min-h-[300px] items-center justify-center sm:min-h-[360px] lg:min-h-[400px] lg:justify-end"
          initial={reduce ? false : 'hidden'}
          whileInView="visible"
          viewport={{ once: true, margin: '-60px' }}
          variants={slideFromRight}
          transition={{ duration: 0.85, ease: easeOutExpo }}
        >
          <motion.img
            src={paiementMobile}
            alt="Cotisation via Orange Money, MTN, Wave ou Moov"
            width={390}
            height={844}
            className="absolute right-[8%] z-10 w-[min(42%,200px)] max-w-[200px] -rotate-12 object-contain opacity-90 drop-shadow-[0_24px_48px_rgba(0,0,0,0.35)] sm:right-[12%] sm:w-[min(44%,220px)] lg:right-[18%] lg:w-[220px]"
            loading="lazy"
            decoding="async"
            initial={reduce ? false : { opacity: 0, x: 40, rotate: -18 }}
            whileInView={{ opacity: 0.9, x: 0, rotate: -12 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8, delay: 0.15, ease: easeOutExpo }}
          />
          <motion.img
            src={heroMockup}
            alt="Application COTICI — accueil, solde et tontines"
            width={619}
            height={1032}
            className={`relative z-20 w-full max-w-[min(100%,260px)] object-contain drop-shadow-[0_32px_64px_rgba(0,0,0,0.4)] sm:max-w-[280px] lg:max-w-[300px] xl:max-w-[320px] ${
              reduce ? '' : 'animate-float-phone'
            }`}
            loading="lazy"
            decoding="async"
            whileHover={reduce ? undefined : { scale: 1.02 }}
          />
        </motion.div>
      </div>
    </section>
  );
}
