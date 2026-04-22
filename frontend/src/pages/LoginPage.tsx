import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Link, useLocation, useNavigate } from 'react-router';
import toast from 'react-hot-toast';
import { authApi } from '@/api/auth';
import { useAuthStore } from '@/stores/authStore';
import { extractError } from '@/api/client';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

const schema = z.object({
  email: z.string().email('Geçerli bir email girin'),
  password: z.string().min(1, 'Şifre gerekli'),
});

type Form = z.infer<typeof schema>;

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const setAuth = useAuthStore((s) => s.setAuth);
  const [submitting, setSubmitting] = useState(false);

  const from = (location.state as { from?: string })?.from ?? '/';

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<Form>({ resolver: zodResolver(schema) });

  const onSubmit = async (data: Form) => {
    setSubmitting(true);
    try {
      const res = await authApi.login(data);
      setAuth({ accessToken: res.accessToken, refreshToken: res.refreshToken }, res.user);
      toast.success(`Hoş geldin, ${res.user.name}!`);
      navigate(from, { replace: true });
    } catch (err) {
      toast.error(extractError(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="container-app py-12 md:py-16 flex justify-center">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-card p-6 md:p-8 border border-gray-100">
          <h1 className="text-2xl font-bold text-secondary mb-1">Giriş Yap</h1>
          <p className="text-sm text-text-muted mb-6">
            Biletlerini yönetmek için hesabına giriş yap.
          </p>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <Input
              label="Email"
              type="email"
              placeholder="ahmet@example.com"
              autoComplete="email"
              error={errors.email?.message}
              {...register('email')}
            />
            <Input
              label="Şifre"
              type="password"
              autoComplete="current-password"
              error={errors.password?.message}
              {...register('password')}
            />
            <Button type="submit" fullWidth size="lg" loading={submitting}>
              Giriş Yap
            </Button>
          </form>

          <p className="text-sm text-center text-text-muted mt-6">
            Hesabın yok mu?{' '}
            <Link to="/auth/register" className="text-primary font-semibold hover:underline">
              Hemen kaydol
            </Link>
          </p>
        </div>

        <div className="mt-4 p-4 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800">
          <strong>Demo:</strong> user@tickethub.com / password123 (seed data'dan)
        </div>
      </div>
    </div>
  );
}
