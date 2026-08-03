import { motion, useReducedMotion } from 'framer-motion';
import { Facebook, Instagram, Mail, MapPin, Phone, Twitter } from 'lucide-react';
import logo from '@assets/logo_cotici.png';
import { FOOTER_LINKS } from '../../landing/data';
import { fadeUp, staggerContainer } from '../../lib/motion';
import { Reveal } from '../motion';

export function Footer() {
  const reduce = useReducedMotion();

  return (
    <footer className="bg-slate-900 text-slate-300">
      <Reveal as="div" className="mx-auto grid max-w-7xl gap-10 px-4 py-14 sm:px-6 lg:grid-cols-4 lg:px-8">
        <motion.div
          className="lg:col-span-1"
          initial={reduce ? false : 'hidden'}
          whileInView="visible"
          viewport={{ once: true }}
          variants={staggerContainer}
        >
          <motion.a href="#accueil" className="flex items-center gap-2" variants={fadeUp}>
            <img
              src={logo}
              alt=""
              className="h-9 w-9 rounded-lg brightness-110"
              width={36}
              height={36}
            />
            <span className="font-display text-lg font-bold text-white">COTICI</span>
          </motion.a>
          <motion.p
            className="mt-4 text-sm leading-relaxed text-slate-400"
            variants={fadeUp}
          >
            La plateforme qui digitalise tontines, solidarité, cagnottes et épargne personnelle
            pour l&apos;Afrique de l&apos;Ouest.
          </motion.p>
        </motion.div>

        {[
          { title: 'Liens rapides', links: FOOTER_LINKS.quick },
          { title: 'À propos', links: FOOTER_LINKS.about },
        ].map((col) => (
          <motion.div
            key={col.title}
            variants={fadeUp}
            initial={reduce ? false : 'hidden'}
            whileInView="visible"
            viewport={{ once: true }}
          >
            <h3 className="font-display text-sm font-bold uppercase tracking-wider text-white">
              {col.title}
            </h3>
            <ul className="mt-4 space-y-2.5">
              {col.links.map((l) => (
                <li key={l.href}>
                  <a
                    href={l.href}
                    className="link-hover-line text-sm text-slate-400 transition hover:text-white"
                  >
                    {l.label}
                  </a>
                </li>
              ))}
            </ul>
          </motion.div>
        ))}

        <motion.div
          variants={fadeUp}
          initial={reduce ? false : 'hidden'}
          whileInView="visible"
          viewport={{ once: true }}
        >
          <h3 className="font-display text-sm font-bold uppercase tracking-wider text-white">
            Contact
          </h3>
          <ul className="mt-4 space-y-3 text-sm text-slate-400">
            <li className="flex items-start gap-2">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
              Abidjan, Côte d&apos;Ivoire
            </li>
            <li className="flex items-center gap-2">
              <Phone className="h-4 w-4 shrink-0 text-brand" />
              +225 00 00 00 00 00
            </li>
            <li className="flex items-center gap-2">
              <Mail className="h-4 w-4 shrink-0 text-brand" />
              contact@cotici.app
            </li>
          </ul>
        </motion.div>
      </Reveal>

      <div className="border-t border-slate-800">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-4 py-6 sm:flex-row sm:px-6 lg:px-8">
          <p className="text-xs text-slate-500">
            © {new Date().getFullYear()} COTICI. Tous droits réservés.
          </p>
          <div className="flex gap-3">
            {[
              { icon: Facebook, label: 'Facebook' },
              { icon: Instagram, label: 'Instagram' },
              { icon: Twitter, label: 'Twitter' },
            ].map(({ icon: Icon, label }) => (
              <motion.a
                key={label}
                href="#"
                aria-label={label}
                className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-800 text-slate-400 transition hover:bg-brand hover:text-white"
                whileHover={reduce ? undefined : { y: -2, scale: 1.08 }}
                whileTap={reduce ? undefined : { scale: 0.95 }}
              >
                <Icon size={16} />
              </motion.a>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}
