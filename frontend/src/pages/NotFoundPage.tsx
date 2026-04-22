import { Link } from 'react-router';
import { Button } from '@/components/ui/Button';

export function NotFoundPage() {
  return (
    <div className="container-app py-20 text-center">
      <div className="text-6xl mb-4">🎫</div>
      <h1 className="text-4xl font-extrabold text-secondary mb-2">404</h1>
      <p className="text-lg text-text-muted mb-6">Aradığın sayfa bulunamadı.</p>
      <Link to="/">
        <Button size="lg">Ana Sayfaya Dön</Button>
      </Link>
    </div>
  );
}
