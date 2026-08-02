import type { ReactNode } from 'react';
import { Construction } from 'lucide-react';
import { Badge, Card } from '@/components/ui';
import { PageHeader } from '@/layout/PageHeader';

export interface ModulePlaceholderProps {
  title: string;
  description: string;
  phase: 1 | 2;
  /** Fonctionnalites prevues, listees pour cadrer le perimetre a venir. */
  features: string[];
  /** Endpoints du contrat d'API deja reserves pour ce module. */
  endpoints?: string[];
  icon?: ReactNode;
}

/**
 * Page d'attente commune aux modules non encore implementes.
 * La structure de dossiers ({ pages/, api/, components/ }) est deja en place
 * pour accueillir l'implementation reelle sans reorganisation.
 */
export function ModulePlaceholder({
  title,
  description,
  phase,
  features,
  endpoints = [],
  icon,
}: ModulePlaceholderProps) {
  return (
    <div>
      <PageHeader
        title={title}
        description={description}
        actions={<Badge tone={phase === 1 ? 'info' : 'neutral'}>Phase {phase}</Badge>}
      />

      <Card>
        <div className="flex flex-col items-center gap-3 py-8 text-center">
          <span className="text-slate-300">
            {icon ?? <Construction className="h-8 w-8" aria-hidden />}
          </span>
          <div>
            <p className="text-sm font-medium text-slate-800">Module a venir</p>
            <p className="mt-1 text-xxs text-slate-500">
              Cette section sera livree en phase {phase}. L’interface et les appels API
              correspondants ne sont pas encore actifs.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 border-t border-slate-100 pt-4 md:grid-cols-2">
          <div>
            <p className="field-label">Fonctionnalites prevues</p>
            <ul className="space-y-1">
              {features.map((feature) => (
                <li key={feature} className="flex gap-2 text-[13px] text-slate-600">
                  <span className="text-slate-300">•</span>
                  {feature}
                </li>
              ))}
            </ul>
          </div>

          {endpoints.length > 0 && (
            <div>
              <p className="field-label">Endpoints reserves</p>
              <ul className="space-y-1">
                {endpoints.map((endpoint) => (
                  <li key={endpoint} className="font-mono text-xxs text-slate-500">
                    {endpoint}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
