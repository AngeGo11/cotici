import type { ReactNode } from 'react';
import { Inbox } from 'lucide-react';

export function EmptyState({
  title = 'Aucun resultat',
  description,
  icon,
  action,
}: {
  title?: string;
  description?: ReactNode;
  icon?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-12 text-center">
      <span className="text-slate-300">
        {icon ?? <Inbox className="h-8 w-8" aria-hidden />}
      </span>
      <p className="text-[13px] font-medium text-slate-700">{title}</p>
      {description && <p className="max-w-sm text-xxs text-slate-500">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
