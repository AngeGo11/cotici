import { useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ChevronDown } from 'lucide-react';
import { easeOutExpo, fadeUp, staggerContainer } from '../../lib/motion';
import { Reveal } from '../motion';

const FAQ = [
  {
    q: 'Quels modes d’épargne propose COTICI ?',
    a: 'Quatre modes : tontine de groupe, tontine solidaire, cagnotte association et épargne personnelle — accessibles depuis une seule application.',
  },
  {
    q: 'Quels opérateurs Mobile Money sont acceptés ?',
    a: 'Orange Money, MTN, Wave et Moov pour vos dépôts et cotisations.',
  },
  {
    q: 'Mes fonds sont-ils sécurisés ?',
    a: 'Accès protégé par OTP SMS, historique transparent et règles visibles pour chaque groupe.',
  },
  {
    q: 'Quelle différence entre tontine classique et solidaire ?',
    a: 'La tontine de groupe suit des tours de ramassage. La solidaire ajoute une cagnotte tournante et un fonds d’urgence validé par le groupe.',
  },
] as const;

export function FaqSection() {
  const [open, setOpen] = useState(0);
  const reduce = useReducedMotion();

  return (
    <section id="faq" className="bg-stone-50 px-4 py-16 sm:px-6 lg:px-8">
      <Reveal as="div" className="mx-auto max-w-2xl">
        <h2 className="text-center font-display text-3xl font-bold text-slate-900">FAQ</h2>
        <motion.ul
          className="mt-10 space-y-3"
          initial={reduce ? false : 'hidden'}
          whileInView="visible"
          viewport={{ once: true, margin: '-40px' }}
          variants={staggerContainer}
        >
          {FAQ.map((item, i) => {
            const isOpen = open === i;
            return (
              <motion.li
                key={item.q}
                variants={fadeUp}
                className={`overflow-hidden rounded-2xl border bg-white shadow-sm transition-shadow ${
                  isOpen
                    ? 'border-brand/25 shadow-glow'
                    : 'border-slate-100 hover:border-brand/15 hover:shadow-md'
                }`}
              >
                <button
                  type="button"
                  className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left"
                  onClick={() => setOpen(isOpen ? -1 : i)}
                  aria-expanded={isOpen}
                >
                  <span className="font-medium text-slate-900">{item.q}</span>
                  <motion.span
                    animate={{ rotate: isOpen ? 180 : 0 }}
                    transition={{ duration: 0.3, ease: easeOutExpo }}
                    className="shrink-0 text-slate-400"
                  >
                    <ChevronDown size={20} />
                  </motion.span>
                </button>
                <AnimatePresence initial={false}>
                  {isOpen && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.35, ease: easeOutExpo }}
                      className="overflow-hidden"
                    >
                      <p className="border-t border-slate-50 px-5 pb-4 pt-3 text-sm leading-relaxed text-slate-500">
                        {item.a}
                      </p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.li>
            );
          })}
        </motion.ul>
      </Reveal>
    </section>
  );
}
