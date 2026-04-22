import { Link } from 'react-router';

export function Footer() {
  return (
    <footer className="bg-secondary text-white/80 mt-auto">
      <div className="container-app py-12 grid grid-cols-2 md:grid-cols-4 gap-8">
        <div>
          <h3 className="text-white font-bold mb-3">TicketHub</h3>
          <p className="text-sm leading-relaxed">
            Türkiye'nin en büyük etkinliklerinin biletlerini güvenli ödeme ile anında alın.
          </p>
        </div>

        <div>
          <h4 className="text-white font-semibold mb-3">Kategoriler</h4>
          <ul className="space-y-2 text-sm">
            <li><Link to="/events?category=CONCERT" className="hover:text-white">Konser</Link></li>
            <li><Link to="/events?category=THEATER" className="hover:text-white">Tiyatro</Link></li>
            <li><Link to="/events?category=SPORTS" className="hover:text-white">Spor</Link></li>
            <li><Link to="/events?category=FESTIVAL" className="hover:text-white">Festival</Link></li>
          </ul>
        </div>

        <div>
          <h4 className="text-white font-semibold mb-3">Hesabım</h4>
          <ul className="space-y-2 text-sm">
            <li><Link to="/auth/login" className="hover:text-white">Giriş Yap</Link></li>
            <li><Link to="/auth/register" className="hover:text-white">Kaydol</Link></li>
            <li><Link to="/tickets" className="hover:text-white">Biletlerim</Link></li>
            <li><Link to="/profile" className="hover:text-white">Profilim</Link></li>
          </ul>
        </div>

        <div>
          <h4 className="text-white font-semibold mb-3">Yardım</h4>
          <ul className="space-y-2 text-sm">
            <li><a href="#" className="hover:text-white">Sıkça Sorulan Sorular</a></li>
            <li><a href="#" className="hover:text-white">İade Politikası</a></li>
            <li><a href="#" className="hover:text-white">Gizlilik</a></li>
            <li><a href="#" className="hover:text-white">İletişim</a></li>
          </ul>
        </div>
      </div>

      <div className="border-t border-secondary-light">
        <div className="container-app py-4 text-center text-xs text-white/60">
          © {new Date().getFullYear()} TicketHub. Portfolio projesi — gerçek satış yapılmaz.
        </div>
      </div>
    </footer>
  );
}
