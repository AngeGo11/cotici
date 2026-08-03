import { useEffect, useState } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { KeyRound } from 'lucide-react';
import { DEFAULT_ROUTE, REDIRECT_PARAM, ROUTES } from '@/app/routes';
import { ApiError, errorMessage } from '@/lib/api/client';
import { Button, Input } from '@/components/ui';
import { useAuth } from './useAuth';
import { AuthLayout } from './AuthLayout';

const CODE_LENGTH = 6;

export default function TotpPage() {
  const { pendingStage, verifyTotp, status } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (status === 'authenticated') {
      const target = searchParams.get(REDIRECT_PARAM) ?? DEFAULT_ROUTE;
      navigate(target, { replace: true });
    }
  }, [status, navigate, searchParams]);

  // Sans etape en attente, l'utilisateur a saute l'ecran de mot de passe.
  if (!pendingStage && status === 'anonymous') {
    return <Navigate to={ROUTES.login} replace />;
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);

    if (code.length !== CODE_LENGTH) {
      setError(`Le code doit contenir ${CODE_LENGTH} chiffres.`);
      return;
    }

    setSubmitting(true);
    try {
      await verifyTotp(code);
      const target = searchParams.get(REDIRECT_PARAM) ?? DEFAULT_ROUTE;
      navigate(target, { replace: true });
    } catch (caught) {
      setCode('');
      setError(
        caught instanceof ApiError && caught.status === 400
          ? 'Code invalide ou expire.'
          : errorMessage(caught),
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthLayout
      title="Double authentification"
      subtitle="Saisissez le code a 6 chiffres genere par votre application d’authentification."
    >
      <form onSubmit={handleSubmit} className="space-y-3" noValidate>
        <Input
          label="Code de verification"
          inputMode="numeric"
          autoComplete="one-time-code"
          autoFocus
          maxLength={CODE_LENGTH}
          placeholder="000000"
          value={code}
          onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))}
          className="text-center font-mono text-lg tracking-[0.4em]"
          icon={<KeyRound className="h-3.5 w-3.5" aria-hidden />}
          error={error ?? undefined}
        />

        <Button
          type="submit"
          fullWidth
          size="lg"
          loading={submitting}
          disabled={code.length !== CODE_LENGTH}
        >
          Verifier
        </Button>

        <button
          type="button"
          onClick={() => navigate(ROUTES.login, { replace: true })}
          className="w-full text-center text-xxs text-slate-500 hover:text-slate-800"
        >
          Revenir a l’ecran de connexion
        </button>
      </form>
    </AuthLayout>
  );
}
