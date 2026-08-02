import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { z } from 'zod';
import { Lock, ShieldCheck, User } from 'lucide-react';
import { DEFAULT_ROUTE, REDIRECT_PARAM, ROUTES } from '@/app/routes';
import { ApiError, errorMessage } from '@/lib/api/client';
import { APP_NAME } from '@/lib/constants';
import { Button, Input } from '@/components/ui';
import { useAuth } from './useAuth';
import { AuthLayout } from './AuthLayout';

const loginSchema = z.object({
  username: z.string().min(1, 'Identifiant requis.'),
  password: z.string().min(1, 'Mot de passe requis.'),
});

type LoginForm = z.infer<typeof loginSchema>;

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<LoginForm>({ defaultValues: { username: '', password: '' } });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);

    const parsed = loginSchema.safeParse(values);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        setError(issue.path[0] as keyof LoginForm, { message: issue.message });
      }
      return;
    }

    try {
      const response = await login(parsed.data.username, parsed.data.password);
      const search = searchParams.toString();
      const suffix = search ? `?${search}` : '';

      // Session ouverte des le mot de passe (2FA desactivee cote serveur) :
      // on entre directement dans le back-office.
      if (response.session_established) {
        navigate(searchParams.get(REDIRECT_PARAM) ?? DEFAULT_ROUTE, { replace: true });
        return;
      }

      navigate(
        response.stage === 'totp_setup_required'
          ? `${ROUTES.totpSetup}${suffix}`
          : `${ROUTES.totp}${suffix}`,
        { replace: true },
      );
    } catch (error) {
      if (error instanceof ApiError) {
        for (const [field, messages] of Object.entries(error.fieldErrors)) {
          // Le backend nomme le champ `identifiant`, le formulaire `username`.
          const target = field === 'identifiant' ? 'username' : field;
          if (target === 'username' || target === 'password') {
            setError(target, { message: messages[0] });
          }
        }
      }
      // Message volontairement generique : ne pas reveler si le compte existe.
      setFormError(
        error instanceof ApiError && error.status === 400
          ? 'Identifiants invalides.'
          : errorMessage(error),
      );
    }
  });

  return (
    <AuthLayout
      title="Connexion"
      subtitle={`Acces reserve au personnel autorise de ${APP_NAME}.`}
    >
      <form onSubmit={onSubmit} className="space-y-3" noValidate>
        <Input
          label="Identifiant"
          autoComplete="username"
          autoFocus
          icon={<User className="h-3.5 w-3.5" aria-hidden />}
          error={errors.username?.message}
          {...register('username')}
        />
        <Input
          label="Mot de passe"
          type="password"
          autoComplete="current-password"
          icon={<Lock className="h-3.5 w-3.5" aria-hidden />}
          error={errors.password?.message}
          {...register('password')}
        />

        {formError && (
          <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xxs text-red-700">
            {formError}
          </p>
        )}

        <Button type="submit" fullWidth loading={isSubmitting} size="lg">
          Continuer
        </Button>

        <p className="flex items-center justify-center gap-1.5 pt-1 text-xxs text-slate-500">
          <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
          Double authentification obligatoire a l’etape suivante.
        </p>
      </form>
    </AuthLayout>
  );
}
