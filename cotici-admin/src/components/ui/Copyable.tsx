import { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { cn } from './cn';

export function Copyable({
  value,
  label,
  className,
  mono = true,
}: {
  value: string | null | undefined;
  /** Texte affiche s'il differe de la valeur copiee (valeur masquee). */
  label?: string;
  className?: string;
  mono?: boolean;
}) {
  const [copied, setCopied] = useState(false);

  if (!value) return <span className="text-slate-400">—</span>;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };

  return (
    <span className={cn('inline-flex items-center gap-1', className)}>
      <span className={cn('truncate', mono && 'font-mono text-xxs')}>{label ?? value}</span>
      <button
        type="button"
        onClick={handleCopy}
        className="rounded p-0.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
        aria-label={copied ? 'Copie' : 'Copier'}
        title={copied ? 'Copie' : 'Copier'}
      >
        {copied ? (
          <Check className="h-3 w-3 text-emerald-600" aria-hidden />
        ) : (
          <Copy className="h-3 w-3" aria-hidden />
        )}
      </button>
    </span>
  );
}
