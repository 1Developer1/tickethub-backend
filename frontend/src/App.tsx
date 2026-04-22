import { Outlet } from 'react-router';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';

export function App() {
  return (
    <div className="flex flex-col min-h-screen bg-white">
      <Header />
      <main className="flex-1">
        <Outlet />
      </main>
      <Footer />
    </div>
  );
}
