# TicketHub — Kronolojik Çalışma Akışı

> "Uygulama başladığında ne olur, HTTP istek gelince ne çalışır, sıra ne?"

---

## Neden karışık görünüyor?

Normal bir script yukarıdan aşağı çalışır:

```
satır 1 → satır 2 → satır 3 → bitti
```

Bu uygulama ise **3 farklı zamanda** çalışan kodlar içerir:

| Zaman | Ne oluyor | Örnek |
|-------|-----------|-------|
| **BAŞLATMA** (1 kez) | Nesneler oluşturuluyor, bağlantılar açılıyor | `npm run dev` anı |
| **İSTEK GELDİĞİNDE** (her request) | Middleware zinciri + handler çalışıyor | `POST /bookings/hold` |
| **ARKA PLAN** (async, gecikmeli) | Worker'lar kuyruktan iş alıyor | 10 dk sonra expire, email gönderimi |

---

## FAZ 1: BAŞLATMA KRONOLOJİSİ

`npm run dev` yazdın → `tsx watch src/main.ts` çalışır → Node.js `main.ts` dosyasını yükler.

Ama `main.ts` çalışmadan ÖNCE, `import` satırları nedeniyle modüller yüklenir.

### 1.1 — Modül yükleme sırası (import chain)

Node.js `import` gördüğünde o dosyayı HEMEN çalıştırır. Bu "module-level code" dediğimiz şey:

```
main.ts
  │
  ├── import { buildApp } from './app.js'
  │     │
  │     ├── import { logger } from './shared/logger/index.js'
  │     │     └── ⚡ ÇALIŞIR: const logger = pino({...})
  │     │        → Pino logger nesnesi OLUŞTURULDU (bellekte)
  │     │        → Henüz bir şey loglamıyor, sadece hazır bekliyor
  │     │
  │     ├── import { errorHandler } from './shared/errors/error-handler.js'
  │     │     └── ⚡ ÇALIŞIR: import { isProduction } from '../../config/index.js'
  │     │           └── ⚡ ÇALIŞIR: const config = loadConfig()
  │     │              → Zod ile process.env parse edilir
  │     │              → PORT, DATABASE_URL, JWT_SECRET... hepsi doğrulanır
  │     │              → BİR TANE BİLE EKSİKSE → process.exit(1) ❌ UYGULAMA BAŞLAMAZ
  │     │              → Hepsi OK → config nesnesi bellekte
  │     │
  │     ├── import { requestIdPlugin } from './shared/middleware/request-id.js'
  │     │     └── ⚡ Fonksiyon tanımı bellekte (henüz çalışmıyor)
  │     │
  │     ├── import { authPlugin } from './shared/middleware/auth.js'
  │     │     └── ⚡ Fonksiyon tanımı bellekte
  │     │
  │     ├── import { rateLimitPlugin } from './shared/middleware/rate-limit.js'
  │     │     └── ⚡ Fonksiyon tanımı bellekte
  │     │
  │     ├── import { bookingRoutes } from './modules/booking/booking.routes.js'
  │     │     │
  │     │     └── import { bookingService } from './booking.service.js'
  │     │           │
  │     │           ├── import { bookingRepository } from './booking.repository.js'
  │     │           │     └── import { prisma } from '../../shared/database/prisma-client.js'
  │     │           │           └── ⚡ ÇALIŞIR: const prisma = new PrismaClient({...})
  │     │           │              → DB connection pool OLUŞTURULDU
  │     │           │              → Henüz sorgu yok, pool hazır bekliyor
  │     │           │
  │     │           ├── import { acquireSeatLock } from '../../shared/lock/redlock.js'
  │     │           │     └── import { redis } from '../redis/redis-client.js'
  │     │           │           └── ⚡ ÇALIŞIR: const redis = new Redis({...})
  │     │           │              → Redis bağlantısı AÇILDI (main)
  │     │           │           └── ⚡ ÇALIŞIR: const bullmqRedis = new Redis({...})
  │     │           │              → Redis bağlantısı AÇILDI (bullmq)
  │     │           │     └── ⚡ ÇALIŞIR: const redlock = new Redlock([redis])
  │     │           │        → Redlock nesnesi oluşturuldu
  │     │           │
  │     │           ├── import { syncEventBus } from '../../shared/events/sync-event-bus.js'
  │     │           │     └── ⚡ ÇALIŞIR: const syncEventBus = new SyncEventBus()
  │     │           │        → Boş handler map: {} — henüz listener yok
  │     │           │
  │     │           └── import { asyncEventBus } from '../../shared/events/async-event-bus.js'
  │     │                 └── ⚡ ÇALIŞIR: const queues = new Map()
  │     │                    → Boş queue map — queue'lar ilk kullanımda lazy oluşturulacak
  │     │
  │     └── ... (diğer route importları aynı pattern)
  │
  └── ⚡ ÇALIŞIR: main() fonksiyonu çağrılır (satır 89)
```

**Kritik nokta:** `import` sırası bağımlılık ağacına göre otomatik belirlenir. Sen kontrol etmiyorsun. Node.js "en dipteki bağımlılığı önce çalıştır" mantığıyla çözer.

### 1.2 — `main()` fonksiyonu çalışır

```
main()
│
├── 1. const app = await buildApp()      ← Aşağıda detay (FAZ 1.3)
│
├── 2. process.on('SIGTERM', shutdown)   ← Shutdown handler KAYDET (henüz çalışmıyor)
│      process.on('SIGINT', shutdown)       "Ctrl+C gelirse şu fonksiyonu çağır" talimatı
│      process.on('unhandledRejection')
│      process.on('uncaughtException')
│
└── 3. await app.listen({ port: 3000 })  ← HTTP sunucu BAŞLADI
       → "TicketHub API running at http://0.0.0.0:3000"
       → Artık istek kabul ediliyor ✅
```

### 1.3 — `buildApp()` detayı — Fastify katman katman inşa ediliyor

```
buildApp()
│
├── 1. const app = Fastify({ logger, genReqId, bodyLimit })
│      → Fastify instance oluşturuldu (boş — henüz route yok, middleware yok)
│
├── 2. await app.register(helmet)
│      → Güvenlik header'ları (X-Frame-Options vb.) KAYITLI
│      → Henüz çalışmıyor — istek gelince response'a eklenir
│
├── 3. await app.register(cors)
│      → CORS kuralları KAYITLI
│
├── 4. await app.register(requestIdPlugin)
│      → app.addHook('onRequest', ...) çağrıldı
│      → "Her istek geldiğinde UUID üret" talimatı KAYDEDİLDİ
│      → Henüz istek yok, henüz çalışmıyor
│
├── 5. await app.register(rateLimitPlugin)
│      → Rate limit sayaçları Redis'te tutulacak — kurallar KAYDEDİLDİ
│
├── 6. await app.register(authPlugin)
│      → app.decorateRequest('user', undefined)
│      │  → Her request nesnesine "user" alanı EKLEME talimatı
│      │
│      → app.addHook('onRequest', [JWT doğrula])
│         → "Her istek geldiğinde token kontrol et" talimatı KAYDEDİLDİ
│
├── 7. app.setErrorHandler(errorHandler)
│      → "Herhangi bir hata olursa bu fonksiyonu çağır" talimatı
│
├── 8. await app.register(healthRoutes)
│      → GET /health route'u KAYITLI
│
└── 9. await app.register(apiRoutes, { prefix: '/api/v1' })
       │
       ├── userRoutes    → POST /api/v1/auth/register, /login, /refresh...
       ├── venueRoutes   → GET/POST /api/v1/venues...
       ├── eventRoutes   → GET/POST /api/v1/events...
       ├── pricingRoutes → GET /api/v1/pricing/:eventId...
       ├── bookingRoutes → POST /api/v1/bookings/hold...
       ├── paymentRoutes → POST /api/v1/payments/charge...
       └── ticketRoutes  → GET /api/v1/tickets/:id...

       Her register çağrısında:
       → Route TANIMLARI Fastify'ın routing tablosuna ekleniyor
       → Handler FONKSİYONLARI bellekte referanslanıyor
       → Henüz HİÇBİRİ çalışmıyor — ilk istek gelene kadar bekliyor
```

### 1.4 — Başlatma sonrası bellekteki durum

```
┌─────────────────────────────────────────────────────────┐
│                    NODE.JS PROCESS                       │
│                                                          │
│  Singleton Nesneler (modül yüklenirken oluştu):          │
│  ┌──────────┐  ┌───────────┐  ┌──────────────┐         │
│  │  config   │  │  logger   │  │    prisma     │         │
│  │ (Zod ile  │  │ (Pino)    │  │ (Connection   │         │
│  │  parse    │  │           │  │  Pool hazır)  │         │
│  │  edilmiş) │  │           │  │              │         │
│  └──────────┘  └───────────┘  └──────────────┘         │
│                                                          │
│  ┌──────────┐  ┌───────────┐  ┌──────────────┐         │
│  │  redis    │  │ bullmqRedis│  │   redlock    │         │
│  │ (main     │  │ (BullMQ    │  │ (Distributed │         │
│  │  client)  │  │  client)   │  │  lock)       │         │
│  └──────────┘  └───────────┘  └──────────────┘         │
│                                                          │
│  ┌──────────────┐  ┌─────────────────┐                  │
│  │ syncEventBus │  │  asyncEventBus  │                  │
│  │ handlers: {} │  │  queues: Map()  │                  │
│  │ (boş)        │  │  (boş — lazy)   │                  │
│  └──────────────┘  └─────────────────┘                  │
│                                                          │
│  Fastify Instance:                                       │
│  ┌─────────────────────────────────────────┐            │
│  │  Hooks (sıralı):                        │            │
│  │    1. requestIdPlugin  (onRequest)      │            │
│  │    2. rateLimitPlugin  (onRequest)      │            │
│  │    3. authPlugin       (onRequest)      │            │
│  │                                         │            │
│  │  Error Handler: errorHandler            │            │
│  │                                         │            │
│  │  Routes: 20+ endpoint kayıtlı          │            │
│  │    /health                              │            │
│  │    /api/v1/auth/*                       │            │
│  │    /api/v1/events/*                     │            │
│  │    /api/v1/bookings/*                   │            │
│  │    ...                                  │            │
│  └─────────────────────────────────────────┘            │
│                                                          │
│  HTTP Server: 0.0.0.0:3000 LISTENING ✅                  │
│                                                          │
│  Process Event Handlers:                                 │
│    SIGTERM → shutdown()                                  │
│    SIGINT  → shutdown()                                  │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

**Dikkat:** Hiçbir service, repository, domain entity nesnesi henüz oluşturulmadı. Onlar FONKSIYON olarak bellekte — çağrılmayı bekliyorlar.

---

## FAZ 2: HTTP İSTEK KRONOLOJİSİ

Kullanıcı `POST /api/v1/bookings/hold` gönderdi. Ne olur?

### 2.1 — Fastify Hook Zinciri (middleware pipeline)

```
HTTP İSTEK GELDİ: POST /api/v1/bookings/hold
│  { "eventId": "evt-42", "seats": [{"section":"VIP","row":1,"seat":15}] }
│  Headers: { Authorization: "Bearer eyJhbG...", X-Request-Id: "abc-123" }
│
│
▼ ═══════════════════════════════════════════
│  HOOK 1: requestIdPlugin (onRequest)
│  ─────────────────────────────────────────
│  → headers['x-request-id'] var mı? → "abc-123" var
│  → request.id = "abc-123"
│  → reply.header('X-Request-Id', 'abc-123')
│  → Tüm sonraki log'larda bu ID geçecek
│
▼ ═══════════════════════════════════════════
│  HOOK 2: rateLimitPlugin (onRequest)
│  ─────────────────────────────────────────
│  → Redis'ten: GET rate:192.168.1.1:/api/v1/bookings/hold
│  → Sayaç: 5/20 (limit aşılmamış)
│  → Redis'e: INCR rate:192.168.1.1:/api/v1/bookings/hold
│  → Devam et ✅
│  
│  (Limit aşılsaydı: 429 Too Many Requests döner, zincir DURUR)
│
▼ ═══════════════════════════════════════════
│  HOOK 3: authPlugin (onRequest)
│  ─────────────────────────────────────────
│  → Route config: { public: true } mi? → HAYIR (booking korumalı)
│  → Authorization header: "Bearer eyJhbG..."
│  → jwt.verify(token, secret) → { sub: "user-1", role: "USER", exp: ... }
│  → request.user = { sub: "user-1", role: "USER" }
│  → Devam et ✅
│  
│  (Token yoksa/geçersizse: 401 Unauthorized döner, zincir DURUR)
│
▼ ═══════════════════════════════════════════
│  ROUTE MATCH: POST /api/v1/bookings/hold
│  ─────────────────────────────────────────
│  Fastify routing tablosundan eşleşen handler bulundu
│  → bookingRoutes içindeki app.post('/hold', ...) handler'ı
│
▼ ═══════════════════════════════════════════
│  preHandler: (bu route'ta rateLimit config var ama
│  ayrı preHandler tanımlı değil — authorize() yok
│  çünkü booking'de authPlugin yeterli)
│
▼ ═══════════════════════════════════════════
│  HANDLER: route handler fonksiyonu çalışır
│  ─────────────────────────────────────────
│  → Aşağıda detay (FAZ 2.2)
│
▼ ═══════════════════════════════════════════
│  RESPONSE: Fastify reply gönderir
│  ─────────────────────────────────────────
│  → Helmet güvenlik header'ları eklenir
│  → X-Request-Id header'ı eklenir
│  → JSON serialize edilir
│  → HTTP 201 Created gönderilir
│
▼ ═══════════════════════════════════════════
│  onResponse hook (loglama)
│  ─────────────────────────────────────────
│  → Pino: { method: "POST", path: "/api/v1/bookings/hold",
│             statusCode: 201, duration: 45, requestId: "abc-123" }
└──────────────────────────────────────────
```

### 2.2 — Route Handler detayı (booking/hold)

```
booking.routes.ts → handler fonksiyonu
│
├── 1. ZOD VALIDATION (senkron, ~0.1ms)
│      const input = createReservationSchema.parse(request.body)
│      → { eventId: "evt-42", seats: [{section:"VIP",row:1,seat:15}] }
│      → Geçersizse: ZodError fırlatılır → errorHandler yakalar → 400
│
└── 2. bookingService.createReservation(userId, input)
       ↓ (aşağıda tam akış)
```

### 2.3 — bookingService.createReservation() iç akışı

Bu fonksiyon çalışırken 6 farklı alt sistem kullanılıyor. Kronolojik sıra:

```
bookingService.createReservation("user-1", { eventId: "evt-42", seats: [...] })
│
│ ┌─ Alt sistem: PostgreSQL
│ ├─ Alt sistem: Redis (lock)
│ ├─ Alt sistem: Redis (cache — pricing)
│ ├─ Alt sistem: BullMQ (queue)
│ ├─ Alt sistem: SyncEventBus (in-process)
│ └─ Alt sistem: Domain nesneleri (bellekte)
│
│
├── ADIM 1: Scalping kontrolü (~2ms)
│   │  bookingRepository.getUserSeatCount("user-1", "evt-42")
│   │  → prisma.seatHold.count({ where: { eventId, userId, status: HELD|CONFIRMED } })
│   │  → PostgreSQL sorgusu: SELECT COUNT(*) FROM seat_holds WHERE ...
│   │  → Sonuç: 0 (henüz bilet yok)
│   │  → 0 + 1 ≤ 6 → OK ✅
│   │
│   │  (6'dan fazlaysa: ValidationError → 400 "Maximum 6 seats")
│   │
│
├── ADIM 2: Distributed Lock al (~5ms)
│   │  acquireSeatLock("evt-42", "VIP-1-15")
│   │  → redlock.acquire(["lock:seat:evt-42:VIP-1-15"], 30000)
│   │  → Redis komutu: SET lock:seat:evt-42:VIP-1-15 <random> NX PX 30000
│   │     NX = sadece key yoksa set et (atomik)
│   │     PX = 30 saniye TTL
│   │  → Başarılı: lock nesnesi döner
│   │  → Başarısız: SeatUnavailableError → 409 "another user is selecting"
│   │
│   │  ⚠️ Bu andan itibaren koltuk KİLİTLİ — başka process ALINAMAZ
│   │
│
├── ADIM 3: Koltuk müsaitlik kontrolü (~2ms)
│   │  bookingRepository.isSeatAvailable("evt-42", "VIP", 1, 15)
│   │  → prisma.seatHold.findFirst({ where: { eventId, section, row, seat, status: HELD|CONFIRMED } })
│   │  → Sonuç: null (kimse tutmamış)
│   │  → Müsait ✅
│   │
│   │  (Zaten tutulmuşsa: SeatUnavailableError → lock release → 409)
│   │
│
├── ADIM 4: Fiyat sorgula (~1ms cache, ~5ms miss)
│   │  pricingService.getSectionPrice("evt-42", "VIP")
│   │  → currentPriceProjection.get("evt-42", "VIP")
│   │     → Önce Redis cache: GET price:current:evt-42:VIP
│   │       → HIT: 75000 (750.00 TL) — Redis'ten döndü
│   │       → MISS: DB'den oku → Redis'e yaz → dön
│   │  → Sonuç: 75000 (cents)
│   │
│
├── ADIM 5: Domain nesneleri OLUŞTUR (bellekte, ~0.1ms)
│   │
│   │  ┌─ SeatHold.create({...})
│   │  │  → new SeatHold({ seatHoldId, eventId, section:"VIP", row:1, seat:15, price:75000, expiresAt })
│   │  │  → Invariant check: expiresAt > now? ✅
│   │  │  → Bellekte SeatHold nesnesi var — henüz DB'de DEĞİL
│   │  │
│   │  ├─ Money.fromCents(75000)
│   │  │  → new Money(75000, "TRY")
│   │  │  → Invariant check: ≥ 0? ✅  Integer? ✅
│   │  │
│   │  └─ Reservation.create({id, userId, eventId, seatHolds, totalPrice, expiresAt, eventStartsAt})
│   │     → new Reservation({ ...params, status: "PENDING", version: 1 })
│   │     → _domainEvents.push({ type: "reservation.created", ... })
│   │     → Bellekte Reservation nesnesi var — henüz DB'de DEĞİL
│   │     → İçinde: 1 SeatHold + 1 Money + 1 domain event
│   │
│
├── ADIM 6: DB'ye kaydet (transaction, ~10ms)
│   │  bookingRepository.createReservation(reservation)
│   │  → reservation.toPersistence()
│   │     → { id, userId, eventId, status:"PENDING", totalPriceInCents:75000, version:1, expiresAt }
│   │  → prisma.$transaction(async (tx) => {
│   │       tx.reservation.create({ data: {...} })         ← SQL: INSERT INTO reservations ...
│   │       tx.seatHold.createMany({ data: [{...}] })     ← SQL: INSERT INTO seat_holds ...
│   │     })
│   │  → İki INSERT tek transaction'da — ya ikisi de başarılı, ya ikisi de geri alınır
│   │  → DB'de kayıt VAR artık ✅
│   │
│
├── ADIM 7: BullMQ delayed job schedule et (~2ms)
│   │  asyncEventBus.emit('reservation.expired', {reservationId}, {delay: 600000})
│   │  → getOrCreateQueue('reservation.expired')
│   │     → İlk çağrı: new Queue('reservation.expired', {connection: bullmqRedis})
│   │     → Queue nesnesi oluşturuldu ve Map'e kaydedildi
│   │  → queue.add('reservation.expired', {reservationId: "res-1"}, {delay: 600000})
│   │     → Redis komutu: ZADD bull:reservation.expired:delayed <timestamp+10min> <jobData>
│   │  → Job Redis'te kayıtlı — 10 dakika sonra çalışacak
│   │  → İstek BURADA BEKLEMİYOR — hemen devam ediyor
│   │
│
├── ADIM 8: Sync event yayınla (~0.1ms)
│   │  syncEventBus.emit('reservation.created', {...})
│   │  → handlers['reservation.created'] → (boş dizi — bu projede dinleyen yok)
│   │  → Dinleyen olsaydı: sırayla await ile çalıştırılırdı
│   │  → Hata fırlatsa: reservation oluşturma GERİ ALINIRDI (aynı try bloğunda)
│   │
│
├── ADIM 9: Lock'ı serbest bırak (~1ms)
│   │  → finally bloğu: lock.release()
│   │  → Redis komutu: DEL lock:seat:evt-42:VIP-1-15 (Lua script ile atomik)
│   │  → Koltuk kilidi AÇILDI — başka process artık lock alabilir
│   │
│
└── ADIM 10: Response dön
    → return {
        reservationId: "res-1",
        expiresAt: "2026-04-09T15:10:00.000Z",
        totalPriceInCents: 75000,
        totalPrice: "750.00 TRY",
        seats: [{ section: "VIP", row: 1, seat: 15, priceInCents: 75000 }]
      }
    → route handler'a döner
    → reply.status(201).send({ data: result })
    → HTTP 201 Created → kullanıcıya gider

TOPLAM SÜRE: ~25ms
```

### 2.4 — Hata durumunda akış

```
Herhangi bir adımda hata fırlatılırsa:
│
├── Domain hatası (SeatUnavailableError, ValidationError, vb.)
│   → throw → route handler'dan fırlar
│   → Fastify error handler yakalar (errorHandler fonksiyonu)
│   → error instanceof AppError? → EVET
│   → reply.status(409).send({ error: { code: "SEAT_UNAVAILABLE", message: "..." } })
│
├── Zod validation hatası
│   → throw ZodError → errorHandler yakalar
│   → reply.status(400).send({ error: { code: "VALIDATION_ERROR", ... } })
│
├── Beklenmeyen hata (null reference, network error, vb.)
│   → throw Error → errorHandler yakalar
│   → error instanceof AppError? → HAYIR
│   → logger.error({ err, requestId }) — loglama
│   → reply.status(500).send({ error: { code: "INTERNAL_ERROR" } })
│   → Production'da stack trace GİZLİ, development'ta GÖSTERİLİR
│
└── Lock alındı ama sonraki adımda hata
    → finally bloğu MUTLAKA çalışır
    → lock.release() — koltuk kilidi açılır
    → Kullanıcı hata görür ama koltuk kilitli KALMAZ
```

---

## FAZ 3: ARKA PLAN İŞLERİ

### 3.1 — 10 dakika sonra: reservation expire

```
Zaman: T+10 dakika (reservation oluşturulmasından 10 dk sonra)

BullMQ iç mekanizma:
│
├── Redis'te: ZADD bull:reservation.expired:delayed <timestamp> <jobData>
│   → BullMQ her saniye kontrol eder: "delayed job'lardan zamanı gelen var mı?"
│   → T+10dk oldu → job'u "waiting" kuyruğuna taşı
│
├── Worker (eğer varsa):
│   → createWorker('reservation.expired', processor)
│   → Worker Redis'ten BRPOPLPUSH ile job alır (blocking — bekler)
│   → Job geldi: { reservationId: "res-1" }
│
└── processor fonksiyonu çalışır:
    │
    ├── bookingService.expireReservation("res-1")
    │   │
    │   ├── bookingRepository.findById("res-1")
    │   │   → DB'den yükle
    │   │   → Reservation.fromPersistence({...})  ← Entity oluştur
    │   │   → SeatHold.fromPersistence({...})     ← Value object oluştur
    │   │   → Money.fromCents(75000)              ← Value object oluştur
    │   │
    │   ├── reservation.isPending()?
    │   │   → EVET: devam
    │   │   → HAYIR (zaten CONFIRMED): return — sessizce bitir
    │   │
    │   ├── reservation.expire()  ← Entity command method
    │   │   → status: PENDING → EXPIRED
    │   │   → version: 1 → 2
    │   │   → _domainEvents.push({ type: "reservation.expired" })
    │   │
    │   ├── bookingRepository.updateReservation(reservation)
    │   │   → UPDATE reservations SET status='EXPIRED', version=2
    │   │     WHERE id='res-1' AND version=1
    │   │   → 1 satır güncellendi ✅
    │   │
    │   └── bookingRepository.releaseSeats("res-1")
    │       → UPDATE seat_holds SET status='RELEASED'
    │         WHERE reservation_id='res-1'
    │       → Koltuk artık müsait — başka kullanıcılar görebilir
    │
    └── Worker log: "Job completed"
```

### 3.2 — Ödeme sonrası: QR üretimi + email (paralel)

```
Kullanıcı POST /bookings/:id/confirm yaptı
→ reservation.confirmPayment(paymentId)
→ asyncEventBus.emit('reservation.confirmed', {...})   ← Queue'ya eklendi
→ asyncEventBus.emit('notification.send', {...})       ← Queue'ya eklendi
→ HTTP 200 döner — kullanıcı BEKLEMEZ

Arka planda (worker process):

  Queue: reservation.confirmed
  │
  └── Worker → ticketsService.generateTickets(reservationId)
      → DB'den reservation + seatHolds çek
      → Her seatHold için:
         → generateQRPayload({ticketId, eventId, section, row, seat})
           → JSON → Base64 → HMAC-SHA256 sign → "payload.signature"
         → prisma.ticket.create({ qrPayload, status: "VALID" })
      → Log: "Tickets generated"

  Queue: notification.send
  │
  └── Worker → nodemailer.sendMail({ to, subject, html })
      → SMTP: localhost:1025 (MailHog)
      → Email gönderildi (dev'de MailHog'da görünür)
      → prisma.notification.create({ status: "SENT" })
      → Log: "Notification sent"

      Başarısız olursa:
      → BullMQ retry: 1. deneme → 1dk bekle → 2. deneme → 5dk → 3. deneme
      → 3 denemede de başarısız: Dead Letter Queue'ya taşınır
```

---

## FAZ 4: KAPANMA KRONOLOJİSİ

```
Ctrl+C basıldı (veya docker stop)
│
├── process.on('SIGINT') tetiklenir
│   → shutdown('SIGINT') çağrılır
│
└── shutdown():
    │
    ├── 1. await app.close()
    │      → Yeni istek kabul DURUR
    │      → Devam eden istekler tamamlanana kadar BEKLE
    │      → HTTP sunucu kapandı
    │
    ├── 2. await shutdownQueues()
    │      → Her aktif worker'a: "bitir, yeni job alma"
    │      → İşlenmekte olan job varsa: tamamlanmasını bekle
    │      → Worker'lar kapandı
    │
    ├── 3. await asyncEventBus.closeAll()
    │      → Queue nesnelerini kapat (Redis connection)
    │
    ├── 4. await disconnectDatabase()
    │      → prisma.$disconnect()
    │      → Connection pool'daki tüm bağlantılar kapatıldı
    │
    ├── 5. await disconnectRedis()
    │      → redis.quit() + bullmqRedis.quit()
    │      → Redis bağlantıları kapatıldı
    │
    └── 6. process.exit(0)
           → Process temiz şekilde sonlandı ✅
```

---

## ÖZET: 4 FAZ TEK TABLODA

| Faz | Ne zaman | Ne oluşuyor | Kim tetikliyor |
|-----|----------|-------------|----------------|
| **1. Başlatma** | `npm run dev` | Singleton'lar (prisma, redis, logger, config), Fastify instance, hook/route kayıtları | Node.js `import` zinciri + `main()` |
| **2. İstek** | Her HTTP request | Zod parse, domain entity, value object, DB sorgu, Redis lock | Fastify hook zinciri → route handler |
| **3. Arka plan** | Async, gecikmeli | BullMQ worker job işleme, QR üretimi, email | Redis'teki job zamanı geldiğinde |
| **4. Kapanma** | SIGTERM/SIGINT | Bağlantı kapatma, worker durdurma | OS sinyali (Ctrl+C, docker stop) |

---

## "Nesne ne zaman oluşuyor?" haritası

| Nesne | Ne zaman oluşuyor | Kaç tane | Ömrü |
|-------|-------------------|----------|------|
| `config` | Başlatmada (import anı) | 1 (singleton) | Process boyunca |
| `logger` | Başlatmada (import anı) | 1 (singleton) | Process boyunca |
| `prisma` | Başlatmada (import anı) | 1 (singleton) | Process boyunca |
| `redis` | Başlatmada (import anı) | 2 (main + bullmq) | Process boyunca |
| `redlock` | Başlatmada (import anı) | 1 (singleton) | Process boyunca |
| `syncEventBus` | Başlatmada (import anı) | 1 (singleton) | Process boyunca |
| `asyncEventBus` | Başlatmada (import anı) | 1 (singleton) | Process boyunca |
| `Fastify instance` | `buildApp()` anı | 1 | Process boyunca |
| **BullMQ Queue** | İlk `asyncEventBus.emit()` anı (lazy) | Event tipi başına 1 | Process boyunca |
| **BullMQ Worker** | `startNotificationWorkers()` anı | Worker tipi başına 1 | Process boyunca |
| **Reservation (entity)** | Her `createReservation()` çağrısında | İstek başına 1 | Fonksiyon scope (istek bitince GC) |
| **SeatHold (value object)** | Her `createReservation()` çağrısında | İstek başına N (koltuk sayısı) | Fonksiyon scope |
| **Money (value object)** | Her fiyat hesaplamasında | İstek başına birkaç | Fonksiyon scope |
| **Lock (redlock)** | Her `acquireSeatLock()` çağrısında | Koltuk başına 1 | try-finally scope (max 30s) |
| **Zod parsed input** | Her route handler başında | İstek başına 1 | Fonksiyon scope |

**Kalıcı (singleton)** = uygulama boyunca yaşar, bir kez oluşur.
**Geçici (per-request)** = her istek için yeni oluşur, istek bitince çöp toplanır.
