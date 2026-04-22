import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Link, useNavigate } from 'react-router';
import toast from 'react-hot-toast';
import { authApi } from '@/api/auth';
import { useAuthStore } from '@/stores/authStore';
import { extractError } from '@/api/client';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

const schema = z
  .object({
    name: z.string().min(2, 'İsim en az 2 karakter').max(100),
    email: z.string().email('Geçerli bir email girin'),
    password: z.string().min(8, 'Şifre en az 8 karakter olmalı'),
    confirmPassword: z.string(),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: 'Şifreler eşleşmiyor',
    path: ['confirmPassword'],
  });

type Form = z.infer<typeof schema>;

export function RegisterPage() {
  const navigate = useNavigate();
  const setAuth = useAuthStore((s) => s.setAuth);
  const [submitting, setSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<Form>({ resolver: zodResolver(schema) });

  const onSubmit = async (data: Form) => {
    setSubmitting(true);
    try {
      const res = await authApi.register({
        name: data.name,
        email: data.email,
        password: data.password,
      });
      setAuth({ accessToken: res.accessToken, refreshToken: res.refreshToken }, res.user);
      toast.success(`Hoş geldin, ${res.user.name}!`);
      navigate('/', { replace: true });
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
          <h1 className="text-2xl font-bold text-secondary mb-1">Hesap Oluştur</h1>
          <p className="text-sm text-text-muted mb-6">Ücretsiz kaydol, saniyeler içinde bilet al.</p>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <Input
              label="Adın Soyadın"
              placeholder="Ahmet Yılmaz"
              autoComplete="name"
              error={errors.name?.message}
              {...register('name')}
            />
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
              autoComplete="new-password"
              hint="En az 8 karakter"
              error={errors.password?.message}
              {...register('password')}
            />
            <Input
              label="Şifre (tekrar)"
              type="password"
              autoComplete="new-password"
              error={errors.confirmPassword?.message}
              {...register('confirmPassword')}
            />
            <Button type="submit" fullWidth size="lg" loading={submitting}>
              Hesap Oluştur
            </Button>
          </form>

          <p className="text-sm text-center text-text-muted mt-6">
            Zaten hesabın var mı?{' '}
            <Link to="/auth/login" className="text-primary font-semibold hover:underline">
              Giriş yap
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
