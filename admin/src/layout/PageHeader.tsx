import type { ReactNode } from 'react';
import { Breadcrumbs } from './Breadcrumbs';

export function PageHeader({
  title,
  description,
  actions,
  showBreadcrumbs = true,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  showBreadcrumbs?: boolean;
}) {
  return (
    <div className="mb-4">
      {showBreadcrumbs && <Breadcrumbs />}
      <div className="mt-1.5 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-lg font-semibold text-slate-900">{title}</h1>
          {description && <p className="mt-0.5 text-xxs text-slate-500">{description}</p>}
        </div>
        {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}
