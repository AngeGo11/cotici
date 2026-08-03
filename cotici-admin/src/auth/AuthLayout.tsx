import type { ReactNode } from 'react';
import { APP_NAME } from '@/lib/constants';

/** Cadre commun aux ecrans de connexion et de double authentification. */
export function AuthLayout({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-5 text-center">
          <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-lg bg-brand text-sm font-bold text-white">
            CI
          </div>
          <h1 className="mt-3 text-base font-semibold text-slate-900">{title}</h1>
          {subtitle && <p className="mt-1 text-xxs text-slate-500">{subtitle}</p>}
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-panel">
          {children}
        </div>

        <p className="mt-4 text-center text-xxs text-slate-400">
          {APP_NAME} — toutes les actions sont journalisees.
        </p>
      </div>
    </div>
  );
}
