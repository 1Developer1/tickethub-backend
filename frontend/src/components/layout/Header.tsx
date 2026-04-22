import { Link, useNavigate } from 'react-router';
import { useState } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { authApi } from '@/api/auth';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/cn';

export function Header() {
  const navigate = useNavigate();
  const { user, refreshToken, clear } = useAuthStore();
  const [menuOpen, setMenuOpen] = useState(false);

  const handleLogout = async () => {
    try {
      if (refreshToken) await authApi.logout(refreshToken);
    } catch {
      // ignore — server-side revoke failure shouldn't block client logout
    }
    clear();
    navigate('/');
  };

  return (
    <header className="sticky top-0 z-40 bg-secondary shadow-md">
      <div className="container-app h-16 flex items-center justify-between">
        {/* Logo */}
        <Link to="/" className="flex items-center gap-2 text-white">
          <span className="text-2xl">🎫</span>
          <span className="text-xl font-bold tracking-tight">TicketHub</span>
        </Link>

        {/* Desktop nav */}
        <nav className="hidden md:flex items-center gap-1">
          <NavItem to="/events">Etkinlikler</NavItem>
          {user && <NavItem to="/tickets">Biletlerim</NavItem>}
        </nav>

        {/* Account area */}
        <div className="hidden md:flex items-center gap-3">
          {user ? (
            <div className="flex items-center gap-2">
              <Link
                to="/profile"
                className="text-white/80 hover:text-white text-sm px-3 py-2 rounded-lg transition-colors"
              >
                {user.name}
              </Link>
              <Button variant="outline" size="sm" onClick={handleLogout}>
                Çıkış
              </Button>
            </div>
          ) : (
            <>
              <Link
                to="/auth/login"
                className="text-white/90 hover:text-white text-sm font-medium px-3 py-2"
              >
                Giriş
              </Link>
              <Link to="/auth/register">
                <Button size="sm">Kaydol</Button>
              </Link>
            </>
          )}
        </div>

        {/* Mobile menu toggle */}
        <button
          className="md:hidden text-white p-2"
          onClick={() => setMenuOpen((o) => !o)}
          aria-label="Menüyü aç/kapat"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            {menuOpen ? (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            )}
          </svg>
        </button>
      </div>

      {/* Mobile menu */}
      {menuOpen && (
        <div className="md:hidden border-t border-secondary-light bg-secondary">
          <nav className="container-app py-3 flex flex-col gap-1">
            <MobileLink to="/events" onClick={() => setMenuOpen(false)}>
              Etkinlikler
            </MobileLink>
            {user && (
              <MobileLink to="/tickets" onClick={() => setMenuOpen(false)}>
                Biletlerim
              </MobileLink>
            )}
            {user ? (
              <>
                <MobileLink to="/profile" onClick={() => setMenuOpen(false)}>
                  Profil ({user.name})
                </MobileLink>
                <button
                  onClick={handleLogout}
                  className="text-left text-white/90 px-3 py-2 rounded-lg hover:bg-secondary-light"
                >
                  Çıkış
                </button>
              </>
            ) : (
              <>
                <MobileLink to="/auth/login" onClick={() => setMenuOpen(false)}>
                  Giriş
                </MobileLink>
                <MobileLink to="/auth/register" onClick={() => setMenuOpen(false)}>
                  Kaydol
                </MobileLink>
              </>
            )}
          </nav>
        </div>
      )}
    </header>
  );
}

function NavItem({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <Link
      to={to}
      className="text-white/80 hover:text-white text-sm font-medium px-3 py-2 rounded-lg transition-colors"
    >
      {children}
    </Link>
  );
}

function MobileLink({
  to,
  children,
  onClick,
}: {
  to: string;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <Link
      to={to}
      onClick={onClick}
      className={cn(
        'text-white/90 font-medium px-3 py-2 rounded-lg hover:bg-secondary-light',
      )}
    >
      {children}
    </Link>
  );
}
