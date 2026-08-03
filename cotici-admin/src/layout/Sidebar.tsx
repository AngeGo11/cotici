import { NavLink } from 'react-router-dom';
import { useMemo } from 'react';
import { useAuth } from '@/auth/useAuth';
import { cn } from '@/components/ui/cn';
import { APP_NAME } from '@/lib/constants';
import { NAVIGATION } from './navigation';

/**
 * Navigation laterale filtree par permissions.
 * Le filtrage n'est qu'un confort d'usage : chaque endpoint reste protege
 * cote serveur.
 */
export function Sidebar({ collapsed = false }: { collapsed?: boolean }) {
  const { canAny } = useAuth();

  const sections = useMemo(
    () =>
      NAVIGATION.map((section) => ({
        ...section,
        items: section.items.filter((item) => canAny(item.permissions)),
      })).filter((section) => section.items.length > 0),
    [canAny],
  );

  return (
    <aside
      className={cn(
        'flex h-screen shrink-0 flex-col border-r border-slate-200 bg-white transition-all',
        collapsed ? 'w-14' : 'w-56',
      )}
    >
      <div className="flex h-12 items-center gap-2 border-b border-slate-100 px-3">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded bg-brand text-xxs font-bold text-white">
          CI
        </span>
        {!collapsed && (
          <span className="truncate text-[13px] font-semibold text-slate-900">{APP_NAME}</span>
        )}
      </div>

      <nav className="flex-1 overflow-y-auto px-2 py-3" aria-label="Navigation principale">
        {sections.map((section) => (
          <div key={section.label} className="mb-4">
            {!collapsed && (
              <p className="mb-1 px-2 text-xxs font-semibold uppercase tracking-wide text-slate-400">
                {section.label}
              </p>
            )}
            <ul className="space-y-0.5">
              {section.items.map((item) => {
                const Icon = item.icon;
                return (
                  <li key={item.to}>
                    <NavLink
                      to={item.to}
                      title={collapsed ? item.label : undefined}
                      className={({ isActive }) =>
                        cn(
                          'flex items-center gap-2 rounded-md px-2 py-1.5 text-[13px] transition-colors',
                          isActive
                            ? 'bg-brand-light font-medium text-brand-dark'
                            : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
                        )
                      }
                    >
                      <Icon className="h-4 w-4 shrink-0" aria-hidden />
                      {!collapsed && (
                        <>
                          <span className="truncate">{item.label}</span>
                          {item.upcoming && (
                            <span className="ml-auto rounded bg-slate-100 px-1 text-[9px] font-medium uppercase text-slate-500">
                              bientot
                            </span>
                          )}
                        </>
                      )}
                    </NavLink>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
    </aside>
  );
}
