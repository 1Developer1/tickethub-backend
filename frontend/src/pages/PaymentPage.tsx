import { useState } from 'react';
import { useParams, useNavigate } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import toast from 'react-hot-toast';
import { bookingsApi } from '@/api/bookings';
import { paymentsApi } from '@/api/payments';
import { extractError } from '@/api/client';
import { CountdownTimer } from '@/components/checkout/CountdownTimer';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Skeleton } from '@/components/ui/Skeleton';
import { formatPrice } from '@/lib/format';

const cardSchema = z.object({
  cardNumber: z.string().regex(/^[0-9\s]{13,19}$/, 'Geçerli bir kart numarası girin'),
  cardHolder: z.string().min(2, 'Kart sahibinin adı gerekli'),
  expiry: z.string().regex(/^(0[1-9]|1[0-2])\/\d{2}$/, 'AA/YY formatında'),
  cvc: z.string().regex(/^\d{3,4}$/, '3 veya 4 haneli CVC'),
});

type CardForm = z.infer<typeof cardSchema>;

export function PaymentPage() {
  const { reservationId } = useParams<{ reservationId: string }>();
  const navigate = useNavigate();
  const [processing, setProcessing] = useState(false);

  const { data: reservation, isLoading } = useQuery({
    queryKey: ['reservation', reservationId],
    queryFn: () => bookingsApi.getById(reservationId!),
    enabled: Boolean(reservationId),
  });

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<CardForm>({ resolver: zodResolver(cardSchema) });

  const onSubmit = async () => {
    if (!reservation) return;
    setProcessing(true);
    try {
      const idempotencyKey = crypto.randomUUID();
      const payment = await paymentsApi.charge({
        reservationId: reservation.id,
        amountInCents: reservation.totalPriceInCents,
        idempotencyKey,
      });
      await bookingsApi.confirm(reservation.id, payment.paymentIntentId);
      toast.success('Ödeme başarılı! Biletlerin hazır.');
      navigate('/tickets');
    } catch (err) {
      toast.error(extractError(err));
    } finally {
      setProcessing(false);
    }
  };

  if (isLoading) {
    return (
      <div className="container-app py-8 max-w-xl">
        <Skeleton className="h-8 w-1/3 mb-6" />
        <Skeleton className="h-96 rounded-xl" />
      </div>
    );
  }

  if (!reservation) {
    return <div className="container-app py-16 text-center">Rezervasyon bulunamadı.</div>;
  }

  return (
    <div className="bg-surface min-h-screen">
      <div className="container-app py-8 max-w-xl">
        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-secondary">Ödeme</h1>
            <p className="text-sm text-text-muted mt-1">
              Toplam: <span className="font-bold text-primary">{formatPrice(reservation.totalPriceInCents)}</span>
            </p>
          </div>
          <CountdownTimer
            expiresAt={reservation.expiresAt}
            onExpire={() => {
              toast.error('Süre doldu');
              navigate(`/events/${reservation.eventId}`);
            }}
          />
        </div>

        <form
          onSubmit={handleSubmit(onSubmit)}
          className="bg-white rounded-2xl p-6 shadow-card border border-gray-100 space-y-4"
        >
          <Input
            label="Kart Numarası"
            placeholder="4242 4242 4242 4242"
            autoComplete="cc-number"
            inputMode="numeric"
            error={errors.cardNumber?.message}
            {...register('cardNumber')}
          />

          <Input
            label="Kart Üzerindeki İsim"
            placeholder="AHMET YILMAZ"
            autoComplete="cc-name"
            error={errors.cardHolder?.message}
            {...register('cardHolder')}
          />

          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Son Kullanım"
              placeholder="12/28"
              autoComplete="cc-exp"
              error={errors.expiry?.message}
              {...register('expiry')}
            />
            <Input
              label="CVC"
              placeholder="123"
              autoComplete="cc-csc"
              inputMode="numeric"
              error={errors.cvc?.message}
              {...register('cvc')}
            />
          </div>

          <div className="pt-4">
            <Button type="submit" fullWidth size="lg" loading={processing}>
              {formatPrice(reservation.totalPriceInCents)} Öde
            </Button>
          </div>

          <div className="text-xs text-text-muted text-center mt-2 flex items-center justify-center gap-1">
            <span>🔒</span>
            <span>Demo ödeme — gerçek para işlem görmez</span>
          </div>
        </form>

        <div className="mt-4 p-4 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800">
          <strong>Test Kart:</strong> 4242 4242 4242 4242 / herhangi CVC / gelecek tarih
        </div>
      </div>
    </div>
  );
}
