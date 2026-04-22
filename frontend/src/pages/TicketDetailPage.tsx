import { Link, useParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { QRCodeCanvas } from 'qrcode.react';
import { ticketsApi } from '@/api/tickets';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';

export function TicketDetailPage() {
  const { id } = useParams<{ id: string }>();

  const { data: ticket, isLoading, error } = useQuery({
    queryKey: ['ticket', id],
    queryFn: () => ticketsApi.getById(id!),
    enabled: Boolean(id),
  });

  const downloadQR = () => {
    const canvas = document.querySelector<HTMLCanvasElement>('#qr-canvas canvas');
    if (!canvas) return;
    const url = canvas.toDataURL('image/png');
    const link = document.createElement('a');
    link.href = url;
    link.download = `tickethub-${id?.slice(0, 8)}.png`;
    link.click();
  };

  if (isLoading) {
    return (
      <div className="container-app py-8 max-w-md">
        <Skeleton className="h-96 rounded-xl" />
      </div>
    );
  }

  if (error || !ticket) {
    return (
      <div className="container-app py-16 text-center">
        <h2 className="text-xl font-semibold text-red-500 mb-2">Bilet bulunamadı</h2>
        <Link to="/tickets" className="text-primary hover:underline">
          Biletlerime dön
        </Link>
      </div>
    );
  }

  return (
    <div className="bg-surface min-h-screen">
      <div className="container-app py-8 max-w-md">
        {/* Ticket card */}
        <div className="bg-white rounded-2xl overflow-hidden shadow-card border border-gray-100">
          {/* Header stripe */}
          <div className="bg-gradient-to-r from-secondary to-primary text-white p-5 flex items-center justify-between">
            <div>
              <div className="text-xs text-white/70 mb-0.5">TicketHub</div>
              <div className="font-bold">E-Bilet</div>
            </div>
            <TicketStatus status={ticket.status} />
          </div>

          {/* QR */}
          <div className="p-6 flex flex-col items-center">
            <div
              id="qr-canvas"
              className="p-4 bg-white rounded-xl border-2 border-gray-100 shadow-sm"
            >
              <QRCodeCanvas value={ticket.qrPayload} size={220} level="H" marginSize={2} />
            </div>

            <p className="text-xs text-text-muted mt-3 text-center">
              Giriş kapısında bu QR kodu gösterin
            </p>
          </div>

          {/* Meta */}
          <div className="px-6 pb-6 space-y-2 text-sm border-t border-dashed border-gray-200 pt-4">
            <Row label="Bilet No">
              <code className="text-xs">{ticket.id}</code>
            </Row>
            <Row label="Rezervasyon">
              <code className="text-xs">{ticket.reservationId.slice(0, 8)}...</code>
            </Row>
            <Row label="Oluşturulma">
              {new Date(ticket.createdAt).toLocaleString('tr-TR')}
            </Row>
          </div>
        </div>

        {/* Actions */}
        <div className="mt-4 space-y-2">
          <Button fullWidth onClick={downloadQR}>
            QR Kodu İndir (PNG)
          </Button>
          <Link to="/tickets">
            <Button fullWidth variant="outline">
              Biletlerime Dön
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}

function TicketStatus({ status }: { status: string }) {
  if (status === 'VALID')
    return <Badge tone="success" className="bg-white/20 text-white">Geçerli</Badge>;
  if (status === 'USED')
    return <Badge tone="neutral" className="bg-white/20 text-white">Kullanıldı</Badge>;
  return <Badge tone="error" className="bg-white/20 text-white">İptal</Badge>;
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-text-muted">{label}</span>
      <span className="text-secondary font-medium">{children}</span>
    </div>
  );
}
