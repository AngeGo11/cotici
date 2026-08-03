import { useEffect, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Menu, X } from 'lucide-react';
import logo from '@assets/logo_cotici.png';
import { NAV_LINKS } from '../../landing/data';
import { easeOutExpo, fadeIn } from '../../lib/motion';

export function Header() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const reduce = useReducedMotion();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <motion.header
      className={`sticky top-0 z-50 transition-[background,box-shadow,border] duration-500 ${
        scrolled
          ? 'border-b border-slate-200/80 bg-white/80 shadow-sm shadow-slate-900/5 backdrop-blur-xl'
          : 'border-b border-transparent bg-white/60 backdrop-blur-md'
      }`}
      initial={reduce ? false : 'hidden'}
      animate="visible"
      variants={fadeIn}
      transition={{ duration: 0.6, ease: easeOutExpo }}
    >
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
        <a href="#accueil" className="group flex items-center gap-2.5">
          <motion.img
            src={logo}
            alt=""
            className="h-9 w-9 rounded-xl"
            width={36}
            height={36}
            whileHover={reduce ? undefined : { scale: 1.05, rotate: -3 }}
            transition={{ type: 'spring', stiffness: 400, damping: 20 }}
          />
          <span className="font-display text-xl font-bold text-slate-900">
            COT<span className="text-gradient-brand">ICI</span>
          </span>
        </a>

        <nav className="hidden items-center gap-7 lg:flex" aria-label="Navigation">
          {NAV_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="link-hover-line text-sm font-medium text-slate-600 transition-colors hover:text-brand"
            >
              {link.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <motion.a
            href="#telecharger"
            className="btn-shine hidden rounded-full bg-brand px-5 py-2.5 text-sm font-semibold text-white shadow-md shadow-green-900/15 sm:inline-flex"
            whileHover={reduce ? undefined : { scale: 1.04, y: -1 }}
            whileTap={reduce ? undefined : { scale: 0.98 }}
          >
            Télécharger l&apos;App
          </motion.a>
          <button
            type="button"
            className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 text-slate-700 transition hover:border-brand/30 hover:bg-brand-light/50 lg:hidden"
            onClick={() => setOpen((v) => !v)}
            aria-label={open ? 'Fermer' : 'Menu'}
          >
            {open ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </div>

      <motion.nav
        className="overflow-hidden border-t border-slate-100 bg-white/95 backdrop-blur-xl lg:hidden"
        initial={false}
        animate={{ height: open ? 'auto' : 0, opacity: open ? 1 : 0 }}
        transition={{ duration: 0.35, ease: easeOutExpo }}
      >
        <ul className="space-y-1 px-4 py-4">
          {NAV_LINKS.map((link) => (
            <li key={link.href}>
              <a
                href={link.href}
                className="block rounded-lg px-3 py-2.5 text-sm font-medium text-slate-600 transition hover:bg-brand-light hover:text-brand"
                onClick={() => setOpen(false)}
              >
                {link.label}
              </a>
            </li>
          ))}
          <li className="pt-2">
            <a
              href="#telecharger"
              className="btn-shine flex min-h-[44px] items-center justify-center rounded-full bg-brand text-sm font-semibold text-white"
              onClick={() => setOpen(false)}
            >
              Télécharger l&apos;App
            </a>
          </li>
        </ul>
      </motion.nav>
    </motion.header>
  );
}
