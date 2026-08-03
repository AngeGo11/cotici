import { useState } from 'react';
import { Clock, LogOut, PanelLeft } from 'lucide-react';
import { useAuth } from '@/auth/useAuth';
import { Badge, Button, ConfirmDialog } from '@/components/ui';
import { cn } from '@/components/ui/cn';
import { formatDuration, formatFullName, initials } from '@/lib/format';

export function Topbar({
  onToggleSidebar,
  idleRemaining,
  idleWarning,
}: {
  onToggleSidebar: () => void;
  /** Millisecondes restantes avant deconnexion automatique. */
  idleRemaining: number;
  idleWarning: boolean;
}) {
  const { user, logout } = useAuth();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      await logout();
    } finally {
      setLoggingOut(false);
      setConfirmOpen(false);
    }
  };

  return (
    <>
      <header className="flex h-12 shrink-0 items-center gap-3 border-b border-slate-200 bg-white px-3">
        <button
          type="button"
          onClick={onToggleSidebar}
          className="rounded p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
          aria-label="Replier ou deplier la navigation"
        >
          <PanelLeft className="h-4 w-4" aria-hidden />
        </button>

        <div className="ml-auto flex items-center gap-3">
          <span
            className={cn(
              'flex items-center gap-1 rounded px-1.5 py-0.5 text-xxs tabular',
              idleWarning ? 'bg-amber-50 text-amber-700' : 'text-slate-400',
            )}
            title="Deconnexion automatique en cas d’inactivite"
          >
            <Clock className="h-3 w-3" aria-hidden />
            {formatDuration(idleRemaining)}
          </span>

          {user && (
            <div className="flex items-center gap-2 border-l border-slate-200 pl-3">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-800 text-xxs font-semibold text-white">
                {initials(user)}
              </span>
              <div className="hidden leading-tight sm:block">
                <p className="text-xxs font-medium text-slate-900">{formatFullName(user)}</p>
                <Badge tone="brand">{user.role || 'staff'}</Badge>
              </div>
            </div>
          )}

          <Button
            size="sm"
            variant="ghost"
            onClick={() => setConfirmOpen(true)}
            icon={<LogOut className="h-3.5 w-3.5" aria-hidden />}
          >
            Deconnexion
          </Button>
        </div>
      </header>

      <ConfirmDialog
        open={confirmOpen}
        title="Se deconnecter"
        message="Votre session sera fermee. Les donnees non enregistrees seront perdues."
        confirmLabel="Se deconnecter"
        loading={loggingOut}
        onConfirm={handleLogout}
        onClose={() => setConfirmOpen(false)}
      />
    </>
  );
}
