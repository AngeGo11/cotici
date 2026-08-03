import { useEffect, useState } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import QRCode from 'qrcode';
import { KeyRound, Smartphone } from 'lucide-react';
import { DEFAULT_ROUTE, REDIRECT_PARAM, ROUTES } from '@/app/routes';
import { ApiError, errorMessage } from '@/lib/api/client';
import { Button, Copyable, Input } from '@/components/ui';
import { useAuth } from './useAuth';
import { AuthLayout } from './AuthLayout';

const CODE_LENGTH = 6;

/**
 * Premier enrolement TOTP d'un compte staff.
 * Le secret n'est affiche qu'une seule fois et n'est jamais persiste cote client.
 */
export default function TotpSetupPage() {
  const { pendingStage, provisioningUri, totpSecret, verifyTotp, status } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);

  // QR genere localement (data-URI) : l'URI d'enrolement contient le secret
  // TOTP et ne doit jamais transiter par un service tiers.
  useEffect(() => {
    if (!provisioningUri) {
      setQrDataUrl(null);
      return;
    }
    let cancelled = false;
    void QRCode.toDataURL(provisioningUri, { margin: 1, width: 320 })
      .then((url) => {
        if (!cancelled) setQrDataUrl(url);
      })
      .catch(() => {
        // Degradation acceptable : la cle secrete reste saisissable a la main.
        if (!cancelled) setQrDataUrl(null);
      });
    return () => {
      cancelled = true;
    };
  }, [provisioningUri]);

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
      navigate(searchParams.get(REDIRECT_PARAM) ?? DEFAULT_ROUTE, { replace: true });
    } catch (caught) {
      setCode('');
      setError(
        caught instanceof ApiError && caught.status === 400
          ? 'Code invalide. Verifiez l’heure de votre appareil.'
          : errorMessage(caught),
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthLayout
      title="Configuration de la double authentification"
      subtitle="Enregistrez ce compte dans votre application d’authentification avant de continuer."
    >
      <div className="space-y-4">
        <ol className="space-y-2 text-xxs text-slate-600">
          <li className="flex gap-2">
            <span className="font-semibold text-slate-900">1.</span>
            <span>
              Ouvrez une application TOTP (Google Authenticator, Aegis, 1Password…).
            </span>
          </li>
          <li className="flex gap-2">
            <span className="font-semibold text-slate-900">2.</span>
            <span>Scannez le QR code ci-dessous, ou saisissez la clé secrète à la main.</span>
          </li>
          <li className="flex gap-2">
            <span className="font-semibold text-slate-900">3.</span>
            <span>Saisissez le code genere pour finaliser l’activation.</span>
          </li>
        </ol>

        {qrDataUrl && (
          <div className="flex justify-center">
            <img
              src={qrDataUrl}
              alt="QR code d’enrôlement de la double authentification"
              className="h-44 w-44 rounded-md border border-slate-200 bg-white p-2"
            />
          </div>
        )}

        {totpSecret ? (
          <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
            <p className="field-label">Clé secrète</p>
            <Copyable value={totpSecret} />
            <p className="mt-2 text-xxs text-slate-500">
              Cette cle ne sera plus affichee. Ne la partagez avec personne.
            </p>
          </div>
        ) : (
          <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xxs text-amber-800">
            <Smartphone className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
            <p>
              Aucune cle recue du serveur. Contactez un administrateur pour reinitialiser votre
              double authentification.
            </p>
          </div>
        )}

        {provisioningUri && (
          <div>
            <p className="field-label">URI d’enrolement</p>
            <Copyable value={provisioningUri} />
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3" noValidate>
          <Input
            label="Code de verification"
            inputMode="numeric"
            autoComplete="one-time-code"
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
            Activer la double authentification
          </Button>
        </form>
      </div>
    </AuthLayout>
  );
}
