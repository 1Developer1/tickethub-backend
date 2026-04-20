# ADR-005: Redis Distributed Lock for Seat Selection

## Status: Accepted

## Context
Koltuk secimi isleminde ayni koltuga ayni anda birden fazla kullanici talepte bulunabilir. Race condition onlenmezse ayni koltuk birden fazla kisiye satilabilir. Birden fazla server instance calistigindan tek process ici lock yetersizdir.

## Decision
Redis tabanli distributed lock (Redlock algoritmasi) kullanilmaktadir:
- **Neden DB lock yetmez**: Birden fazla application server calisiyor; database row-level lock transaction suresini uzatir ve connection pool'u tüketir.
- **Redlock**: Cogunluk tabanli lock mekanizmasi; N Redis node'unun cogunlugundan lock alinirsa islem guvenlidir.
- **Single Redis node**: Mevcut olcekte tek Redis instance yeterlidir. Redlock algoritmasi ileride multi-node'a gecisi kolaylastirir.

Lock suresi 30 saniye olarak ayarlanmistir; islem bu sure icinde tamamlanmazsa lock otomatik serbest kalir.

## Consequences
- Redis'e operasyonel bagimlilik eklenir; Redis down olursa koltuk secimi calismaz.
- Lock suresi dogru ayarlanmazsa premature release veya uzun bekleme suresi olusabilir.
- Monitoring ve alerting ile lock metrikleri izlenmelidir.

## Alternatives Considered
- **PostgreSQL advisory lock**: Ek altyapi gerektirmez, ancak multi-instance senaryoda connection baslangic maliyeti yuksektir.
- **Optimistic locking (version column)**: Retry mantigi gerektirir; yogun trafik altinda retry storm riski olusur.
