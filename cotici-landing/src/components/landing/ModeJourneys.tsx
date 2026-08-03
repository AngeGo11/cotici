import { useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import type { ModeId, ModeMockupKey } from '../../landing/data';
import { MODE_COMPARISON, MODE_JOURNEYS } from '../../landing/data';
import mockupCagnotteAssociation from '../../assets/mockup-cagnotte-association-portrait.png';
import mockupMonEpargne from '../../assets/mockup-mon-epargne-portrait.png';
import mockupTontineGroupe from '../../assets/mockup-tontine-groupe-portrait.png';
import mockupTontineGroupePt2 from '../../assets/tontine-groupe-pt2-portrait.png';
import mockupTontineSolidaire from '../../assets/mockup-tontine-solidaire-portrait.png';
import { Reveal } from '../motion';
import {
  contentSwitch,
  easeOutExpo,
  fadeUp,
  springSnappy,
  staggerContainer,
} from '../../lib/motion';

const MODE_MOCKUPS: Record<ModeMockupKey, { src: string; alt: string }> = {
  'tontine-groupe': {
    src: mockupTontineGroupe,
    alt: 'Création d’une tontine de groupe',
  },
  'tontine-groupe-pt2': {
    src: mockupTontineGroupePt2,
    alt: 'Règles avancées — ordre de ramassage',
  },
  'tontine-solidaire': {
    src: mockupTontineSolidaire,
    alt: 'Création d’une tontine solidaire',
  },
  'cagnotte-association': {
    src: mockupCagnotteAssociation,
    alt: 'Création d’une cagnotte association',
  },
  'mon-epargne': {
    src: mockupMonEpargne,
    alt: 'Mon épargne — objectif personnel',
  },
};

function JourneyMockup({
  mockupKey,
  mockupKeySecondary,
}: {
  mockupKey: ModeMockupKey;
  mockupKeySecondary?: ModeMockupKey;
}) {
  const reduce = useReducedMotion();

  if (mockupKeySecondary) {
    const primary = MODE_MOCKUPS[mockupKey];
    const secondary = MODE_MOCKUPS[mockupKeySecondary];
    return (
      <div className="relative mx-auto h-[320px] w-full max-w-[440px] sm:h-[360px]">
        <motion.img
          src={primary.src}
          alt={primary.alt}
          width={390}
          height={844}
          className="absolute left-[2%] top-[4%] z-10 w-[min(46%,190px)] -rotate-[14deg] object-contain drop-shadow-[0_28px_56px_rgba(0,80,50,0.16)] sm:w-[180px]"
          loading="lazy"
          initial={reduce ? false : { opacity: 0, x: -24, rotate: -20 }}
          animate={{ opacity: 1, x: 0, rotate: -14 }}
          transition={{ duration: 0.7, ease: easeOutExpo, delay: 0.1 }}
        />
        <motion.img
          src={secondary.src}
          alt={secondary.alt}
          width={390}
          height={844}
          className="absolute right-[2%] bottom-[6%] z-20 w-[min(50%,210px)] rotate-[10deg] object-contain drop-shadow-[0_32px_64px_rgba(0,80,50,0.2)] sm:w-[200px]"
          loading="lazy"
          initial={reduce ? false : { opacity: 0, x: 24, rotate: 16 }}
          animate={{ opacity: 1, x: 0, rotate: 10 }}
          transition={{ duration: 0.7, ease: easeOutExpo, delay: 0.2 }}
        />
      </div>
    );
  }

  const asset = MODE_MOCKUPS[mockupKey];
  return (
    <motion.img
      src={asset.src}
      alt={asset.alt}
      width={473}
      height={932}
      className={`relative z-10 w-full max-w-[min(100%,260px)] object-contain drop-shadow-[0_24px_48px_rgba(0,80,50,0.14)] sm:max-w-[280px] lg:max-w-[300px] ${
        reduce ? '' : 'animate-float-phone'
      }`}
      loading="lazy"
      decoding="async"
      initial={reduce ? false : { opacity: 0, scale: 0.94, y: 20 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ duration: 0.75, ease: easeOutExpo }}
    />
  );
}

export function ModeJourneys() {
  const [activeId, setActiveId] = useState<ModeId>('groupe');
  const journey = MODE_JOURNEYS.find((j) => j.id === activeId)!;
  const Icon = journey.icon;
  const reduce = useReducedMotion();

  return (
    <section
      id="modes"
      className="relative overflow-hidden bg-gradient-to-br from-white via-stone-50 to-brand-light/40 px-4 py-16 sm:px-6 sm:py-24 lg:px-8"
    >
      <div
        className="pointer-events-none absolute -right-24 top-8 h-96 w-96 rounded-full bg-brand/10 blur-3xl animate-orb-drift"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute bottom-0 left-1/4 h-72 w-72 rounded-full bg-brand-light/55 blur-3xl animate-orb-drift-reverse"
        aria-hidden
      />

      <Reveal as="div" className="relative z-10 mx-auto max-w-6xl text-center">
        <p className="text-sm font-semibold uppercase tracking-widest text-brand">Nos modes</p>
        <h2 className="mt-2 font-display text-3xl font-bold text-slate-900 sm:text-4xl">
          Chaque mode a sa propre logique
        </h2>
        <p className="mx-auto mt-3 max-w-2xl text-slate-500">
          Tontine à tours de rôle, solidarité autour d’un bénéficiaire, cagnotte ouverte ou épargne
          personnelle — le parcours change selon ce que vous lancez.
        </p>

        <div className="mx-auto mt-8 grid max-w-3xl grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
          {MODE_COMPARISON.map(({ id, highlight }) => {
            const mode = MODE_JOURNEYS.find((j) => j.id === id)!;
            const isActive = activeId === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setActiveId(id)}
                className={`relative rounded-2xl border px-3 py-3 text-center transition-colors sm:py-4 ${
                  isActive
                    ? 'border-brand/40 text-brand'
                    : 'border-stone-200/80 bg-white/60 text-slate-700 hover:border-brand/25 hover:bg-white'
                }`}
              >
                {isActive && (
                  <motion.span
                    layoutId="modeTabHighlight"
                    className="absolute inset-0 rounded-2xl border border-brand bg-white shadow-md shadow-green-900/8"
                    transition={springSnappy}
                  />
                )}
                <span className="relative z-10 block">
                  <p
                    className={`font-display text-xs font-bold sm:text-sm ${
                      isActive ? 'text-brand' : 'text-slate-700'
                    }`}
                  >
                    {mode.shortLabel}
                  </p>
                  <p className="mt-1 text-[10px] leading-tight text-slate-500 sm:text-xs">
                    {highlight}
                  </p>
                </span>
              </button>
            );
          })}
        </div>
      </Reveal>

      <AnimatePresence mode="wait">
        <motion.div
          key={activeId}
          className="relative z-10 mx-auto mt-12 grid max-w-6xl items-start gap-10 lg:mt-14 lg:grid-cols-[minmax(0,1fr)_minmax(260px,380px)] lg:items-start lg:gap-14"
          initial={reduce ? false : 'hidden'}
          animate="visible"
          exit="exit"
          variants={contentSwitch}
          transition={{ duration: 0.45, ease: easeOutExpo }}
        >
          <motion.div variants={staggerContainer} initial="hidden" animate="visible">
            <motion.div
              className="card-glass mb-6 flex items-start gap-4 rounded-2xl p-5 shadow-glow"
              variants={fadeUp}
            >
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-brand-light text-brand">
                <Icon size={24} strokeWidth={2} />
              </span>
              <div>
                <h3 className="font-display text-xl font-bold text-slate-900">{journey.label}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">{journey.essence}</p>
                <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-brand">
                  {journey.difference}
                </p>
              </div>
            </motion.div>

            <ol className="space-y-4">
              {journey.steps.map((step, index) => (
                <motion.li
                  key={step.title}
                  className="flex gap-4"
                  variants={fadeUp}
                  custom={index}
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand font-display text-sm font-bold text-white shadow-md shadow-green-900/20">
                    {index + 1}
                  </span>
                  <div>
                    <h4 className="font-display font-bold text-slate-900">{step.title}</h4>
                    <p className="mt-1 text-sm leading-relaxed text-slate-500">
                      {step.description}
                    </p>
                  </div>
                </motion.li>
              ))}
            </ol>

            <motion.div
              id="fonctionnalites"
              className="mt-10 border-t border-stone-200/80 pt-8"
              variants={fadeUp}
            >
              <p className="text-xs font-semibold uppercase tracking-wider text-brand">
                Fonctionnalités — {journey.shortLabel}
              </p>
              <ul className="mt-4 space-y-3">
                {journey.features.map((f) => {
                  const FIcon = f.icon;
                  return (
                    <li
                      key={f.title}
                      className="card-glass flex gap-3 rounded-xl p-3 transition-shadow hover:shadow-glow"
                    >
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-light text-brand">
                        <FIcon size={18} strokeWidth={2} />
                      </span>
                      <div className="min-w-0">
                        <h4 className="font-display text-sm font-bold text-slate-900">
                          {f.title}
                        </h4>
                        <p className="mt-0.5 text-xs leading-relaxed text-slate-500">
                          {f.description}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </motion.div>
          </motion.div>

          <div className="relative flex min-h-[320px] items-center justify-center lg:sticky lg:top-28 lg:justify-end">
            <div
              className="pointer-events-none absolute h-72 w-72 rounded-full bg-brand/12 blur-3xl animate-orb-drift"
              aria-hidden
            />
            <JourneyMockup
              mockupKey={journey.mockupKey}
              mockupKeySecondary={journey.mockupKeySecondary}
            />
          </div>
        </motion.div>
      </AnimatePresence>
    </section>
  );
}
