# DDD Yapı Taşları — Şablon & Karar Rehberi

> TicketHub projesinden çıkarılmış, kopyala-yapıştır şablonlar.

---

## 1. KARAR MATRİSİ — Hangi Yapı Taşını Ne Zaman Kullanmalı?

| Soru | Cevap | Kullanılacak Yapı | Proje Örneği |
|------|-------|-------------------|--------------|
| Karmaşık iş kuralı var mı? | Hayır, sadece CRUD | **Service + Repository** (domain klasörü AÇMA) | Users, Venues, Events |
| Kimliksiz ama kuralı olan veri var mı? | Evet | **Value Object** | Money, SeatHold |
| Yaşam döngüsü (state machine) var mı? | Evet | **Entity (Aggregate Root)** | Reservation |
| "Neden bu duruma geldik?" sorusu önemli mi? | Evet | **Event Sourcing Lite** | Pricing |
| Dış servis yarın değişebilir mi? | Evet | **Port/Adapter** | Payments (Stripe→iyzico) |
| İş kuralı birden fazla entity'yi kapsıyor mu? | Evet | **Domain Service** | (Projede yok — aşağıda örneği var) |

---

## 2. VALUE OBJECT

### Ne zaman yaz?

| Durum | Value Object? | Neden |
|-------|:---:|-------|
| Para (amount + currency) | **Evet** | Float hata, currency karışması engellemeli |
| Email adresi | **Evet** | Format validation, normalize (lowercase) |
| Adres (sokak + şehir + posta kodu) | **Evet** | Birlikte anlamlı, ayrı ayrı anlamsız |
| Tarih aralığı (start + end) | **Evet** | `end > start` invariantı var |
| Koordinat (lat + lng) | **Evet** | Birlikte bir "nokta" tanımlar |
| Tek primitive (userId, email string) | **Hayır** | `type UserId = string` yeterli |
| İç içe entity (alt kayıt, kendi ID'si var) | **Hayır** | Entity veya child entity olmalı |

### 5 zorunlu özellik

| # | Özellik | Nasıl | Olmazsa ne olur |
|---|---------|-------|-----------------|
| 1 | **Immutable** | `private readonly` field, her metot yeni instance döner | Shared reference bug (A değişir, B etkilenir) |
| 2 | **Private constructor** | `private constructor()` | Dışarıdan `new Money(-500)` → geçersiz nesne dolaşır |
| 3 | **Factory method** | `static create()` / `static fromCents()` | Creation + validation logic karışır |
| 4 | **Self-validation** | Constructor'da invariant check + throw | Geçersiz nesne 5 katman sonra patlar |
| 5 | **Equality by value** | `equals()` metodu, `===` kullanma | Aynı 150 TL farklı çıkar (referans karşılaştırma) |

### Kod şablonu

```typescript
// ─── dosya: xxx.value-object.ts ───

interface XxxProps {
  fieldA: string;
  fieldB: number;
}

export class Xxx {
  // ① Private constructor — dışarıdan new YASAK
  private constructor(private readonly props: Readonly<XxxProps>) {}

  // ② Factory — iş kuralı kontrolü BURADA
  static create(props: XxxProps): Xxx {
    if (props.fieldB < 0) {
      throw new Error('fieldB cannot be negative');
    }
    return new Xxx(props);
  }

  // ③ DB'den yükleme — validation ATLA (zaten geçersiz olabilir)
  static fromPersistence(props: XxxProps): Xxx {
    return new Xxx(props);
  }

  // ④ Convenience factory
  static empty(): Xxx {
    return new Xxx({ fieldA: '', fieldB: 0 });
  }

  // ⑤ Getter — setter YOK
  get fieldA(): string { return this.props.fieldA; }
  get fieldB(): number { return this.props.fieldB; }

  // ⑥ Davranış — YENİ instance döner (eski değişmez)
  withFieldB(newValue: number): Xxx {
    return Xxx.create({ ...this.props, fieldB: newValue });
  }

  // ⑦ Aritmetik (Money gibi nümerik VO'larda)
  add(other: Xxx): Xxx {
    return new Xxx({
      ...this.props,
      fieldB: this.props.fieldB + other.props.fieldB,
    });
  }

  // ⑧ Eşitlik — referans DEĞİL, değer karşılaştırma
  equals(other: Xxx): boolean {
    return (
      this.props.fieldA === other.props.fieldA &&
      this.props.fieldB === other.props.fieldB
    );
  }

  // ⑨ Serialization
  toJSON(): XxxProps {
    return { ...this.props };
  }

  toString(): string {
    return `Xxx(${this.props.fieldA}, ${this.props.fieldB})`;
  }
}
```

### `create()` vs `fromPersistence()` farkı

| | `create()` | `fromPersistence()` |
|--|-----------|---------------------|
| **Ne zaman** | Yeni nesne oluşturulurken | DB'den var olan veri yüklenirken |
| **Validation** | Tüm invariantları kontrol eder | Kontrol YAPMAZ |
| **Neden farklı** | Geçersiz veri girişini ENGELLE | DB'deki expired/geçersiz veri yüklenebilmeli |
| **Örnek** | `SeatHold.create({expiresAt: geçmiş})` → HATA | `SeatHold.fromPersistence({expiresAt: geçmiş})` → OK |

---

## 3. ENTITY (AGGREGATE ROOT)

### Ne zaman yaz?

| Soru | Evet → Entity | Hayır → Service yeterli |
|------|---------------|------------------------|
| Nesnenin benzersiz kimliği (ID) var mı? | Reservation ID | - |
| Durum geçişleri (state machine) var mı? | PENDING → CONFIRMED | Sadece create/update |
| Birbirine bağımlı iş kuralları var mı? | "hold süresi + status + 48h kuralı" | Tek alan validasyonu |
| Kural bypass edilirse ciddi hasar olur mu? | Para kaybı, çift satış | Sadece veri kalitesi |
| Nesne zaman içinde değişiyor mu? | Evet, status/version değişir | Oluştur ve değişmez |

### Entity'nin 6 bölgesi

| # | Bölge | İçeriği | Kural |
|---|-------|---------|-------|
| 1 | **Private State** | `private constructor(props)`, `private _domainEvents[]` | Dışarıdan DEĞİŞTİRİLEMEZ |
| 2 | **Factory Methods** | `static create()`, `static fromPersistence()` | Tek oluşturma kapısı |
| 3 | **Getters** | `get id()`, `get status()` | Setter YOK |
| 4 | **Command Methods** | `confirmPayment()`, `cancel()`, `expire()` | Durumu DEĞİŞTİREN, invariant kontrolü İÇİNDE |
| 5 | **Query Methods** | `isPending()`, `isHoldExpired()` | Durumu SORGULAYAN, yan etkisiz |
| 6 | **Persistence** | `toPersistence()` | DB formatına dönüşüm |

### Her command method'un 4 adımı

| Adım | Ne yapar | Örnek (`confirmPayment`) |
|------|----------|--------------------------|
| ① Guard (invariant) | Ön koşul kontrol, ihlalde throw | `if (status !== 'PENDING') throw` |
| ② Mutate (state) | İç durumu değiştir | `status = 'CONFIRMED'` |
| ③ Version (concurrency) | Optimistic lock sayacı artır | `version += 1` |
| ④ Event (bildirim) | Domain event üret (yayınlama) | `_domainEvents.push({type: 'confirmed'})` |

### Command method'da throw vs sessiz dönüş

| Tetikleyen | Durum | Davranış | Neden |
|-----------|-------|----------|-------|
| **Kullanıcı** (API call) | Yanlış durum | `throw Error` | Kullanıcıya hata mesajı gösterilmeli |
| **Sistem** (cron, worker) | Beklenen çakışma | `return` sessizce | Race condition, kullanıcı görmez |

### Kod şablonu

```typescript
// ─── dosya: xxx.entity.ts ───

import type { XxxDomainEvent } from './xxx.events.js';

type XxxStatus = 'DRAFT' | 'ACTIVE' | 'CLOSED' | 'CANCELLED';

interface XxxProps {
  id: string;
  status: XxxStatus;
  // ... domain field'ları
  version: number;
  createdAt: Date;
}

export class Xxx {
  // ① Private state
  private _domainEvents: XxxDomainEvent[] = [];
  private constructor(private props: XxxProps) {}

  // ② Factory — yeni oluşturma
  static create(params: Omit<XxxProps, 'status' | 'version' | 'createdAt'>): Xxx {
    const entity = new Xxx({
      ...params,
      status: 'DRAFT',       // Başlangıç durumu
      version: 1,            // İlk version
      createdAt: new Date(),
    });

    entity._domainEvents.push({
      type: 'xxx.created',
      aggregateId: params.id,
      // ... event payload
    });

    return entity;
  }

  // ② Factory — DB'den yükleme
  static fromPersistence(props: XxxProps): Xxx {
    return new Xxx(props);
  }

  // ③ Getters (setter YOK)
  get id(): string { return this.props.id; }
  get status(): XxxStatus { return this.props.status; }
  get version(): number { return this.props.version; }

  // Domain event'leri çek ve temizle
  pullDomainEvents(): XxxDomainEvent[] {
    const events = [...this._domainEvents];
    this._domainEvents = [];
    return events;
  }

  // ④ Command — durum değiştiren (4 ADIM)
  activate(): void {
    // Adım 1: Guard (invariant)
    if (this.props.status !== 'DRAFT') {
      throw new Error(`Cannot activate: current status is '${this.props.status}'`);
    }

    // Adım 2: Mutate
    this.props.status = 'ACTIVE';

    // Adım 3: Version
    this.props.version += 1;

    // Adım 4: Event
    this._domainEvents.push({
      type: 'xxx.activated',
      aggregateId: this.props.id,
    });
  }

  // ④ Command — sistem tetiklemeli (sessiz dönüş)
  autoClose(): void {
    if (this.props.status !== 'ACTIVE') {
      return; // throw DEĞİL — race condition beklenen
    }

    this.props.status = 'CLOSED';
    this.props.version += 1;
    this._domainEvents.push({ type: 'xxx.closed', aggregateId: this.props.id });
  }

  // ⑤ Query — yan etkisiz
  isActive(): boolean {
    return this.props.status === 'ACTIVE';
  }

  // ⑥ Persistence
  toPersistence(): Record<string, unknown> {
    return {
      id: this.props.id,
      status: this.props.status,
      version: this.props.version,
      createdAt: this.props.createdAt,
    };
  }
}
```

---

## 4. DOMAIN EVENTS

### Ne zaman üret?

| Durum | Event üret? | Neden |
|-------|:-----------:|-------|
| Entity durumu değişti | **Evet** | Diğer modüller tepki vermeli (email, pricing, QR) |
| Sadece veri okundu (query) | **Hayır** | Yan etki yok → bildirmeye gerek yok |
| Validation başarısız (throw) | **Hayır** | Bir şey olmadı, bildirilecek bir durum yok |

### Event nerede üretilir, nerede yayınlanır?

| Adım | Kim | Nerede | Ne yapar |
|------|-----|--------|----------|
| 1. Üretim | **Entity** | `confirmPayment()` içinde | `_domainEvents.push(...)` |
| 2. Çekme | **Service** | `confirmReservation()` içinde | `entity.pullDomainEvents()` |
| 3. Yayınlama | **Service** | Aynı metot | `eventBus.emit(event)` |

> Entity altyapıyı BİLMEZ (Redis, BullMQ nedir bilmez). Sadece "ne oldu" söyler, "nereye gönder" service karar verir.

### Sync vs Async event seçimi

| Soru | Sync (in-process) | Async (BullMQ) |
|------|:------------------:|:--------------:|
| Başarısızlık ana işlemi bozmalı mı? | **Evet** (aynı transaction) | Hayır |
| Uzun süren iş mi? (email, QR) | Hayır | **Evet** |
| Retry gerekli mi? | Hayır | **Evet** |
| Kullanıcıyı bekletir mi? | Evet (kısa) | **Hayır** |

### Kod şablonu

```typescript
// ─── dosya: xxx.events.ts ───

// Her event tipi ayrı interface — discriminated union

export interface XxxCreatedEvent {
  type: 'xxx.created';
  aggregateId: string;
  // olay verileri...
}

export interface XxxActivatedEvent {
  type: 'xxx.activated';
  aggregateId: string;
  activatedBy: string;
}

export interface XxxClosedEvent {
  type: 'xxx.closed';
  aggregateId: string;
  reason: string;
}

// Union type — consumer tarafında switch/if ile tip güvenli ayrım
export type XxxDomainEvent =
  | XxxCreatedEvent
  | XxxActivatedEvent
  | XxxClosedEvent;
```

```typescript
// Consumer tarafında kullanım (TypeScript discriminated union):
for (const event of entity.pullDomainEvents()) {
  switch (event.type) {
    case 'xxx.created':
      // TypeScript burada XxxCreatedEvent olduğunu BİLİR
      break;
    case 'xxx.activated':
      // event.activatedBy ← autocomplete çalışır
      break;
  }
}
```

---

## 5. DOMAIN SERVICE

### Ne zaman gerekir?

| Durum | Nereye yaz | Neden |
|-------|-----------|-------|
| Kural tek entity'nin kendi verisiyle çözülüyor | **Entity** command method | Entity kendi invariantını korur |
| Kural birden fazla entity/aggregate arası | **Domain Service** | Hiçbir entity tek başına karar veremez |
| DB sorgusu veya dış servis gerekiyor | **Application Service** | Domain katmanı altyapı bilmemeli |

### Gerçek dünya örnekleri

| Senaryo | Domain Service mı? | Neden |
|---------|:---:|-------|
| "Aynı anda 2 farklı etkinlikte hold yapamaz" | **Evet** | 2 ayrı Reservation'ı birlikte kontrol etmek gerek |
| "Transfer: A'dan B'ye para aktar" | **Evet** | 2 Account entity birlikte güncellenmeli |
| "VIP üye %10 indirim alır" | **Hayır** | Tek entity (Order) kendi fiyatını hesaplayabilir |
| "Stokta var mı?" (DB sorgusu) | **Hayır** | Application service — DB erişimi domain'de olmamalı |

### Kod şablonu

```typescript
// ─── dosya: booking-domain.service.ts ───
// Domain service: SADECE iş kuralı, altyapı (DB, Redis) YOK

export class BookingDomainService {

  /**
   * Birden fazla aggregate'i kapsayan iş kuralı.
   * Tek bir entity bu kararı veremez.
   */
  validateCrossReservationRules(
    newReservation: Reservation,
    existingReservations: Reservation[], // Caller (app service) DB'den çeker
  ): void {
    // Kural: aynı anda max 1 aktif PENDING reservation
    const activePending = existingReservations.filter(r => r.isPending());
    if (activePending.length > 0) {
      throw new Error('You already have a pending reservation. Complete or cancel it first.');
    }

    // Kural: aynı etkinlikte toplam max 6 koltuk (tüm reservation'lar dahil)
    const sameEventHolds = existingReservations
      .filter(r => r.eventId === newReservation.eventId)
      .filter(r => r.isPending() || r.isConfirmed())
      .reduce((sum, r) => sum + r.seatHolds.length, 0);

    if (sameEventHolds + newReservation.seatHolds.length > 6) {
      throw new Error(`Maximum 6 seats per event. You already have ${sameEventHolds}.`);
    }
  }
}
```

```typescript
// Application service kullanımı:
const existingReservations = await reservationRepo.findByUserId(userId);  // DB sorgusu
bookingDomainService.validateCrossReservationRules(newReservation, existingReservations);
// ↑ Domain service DB BİLMEZ — veriyi application service sağlar
```

### Domain Service vs Application Service karşılaştırma

| | Domain Service | Application Service |
|--|---------------|---------------------|
| **İçeriği** | Saf iş kuralı | Orkestrasyon (sıralama, koordinasyon) |
| **Bağımlılık** | Sadece domain nesneleri | DB, Redis, Queue, dış servis |
| **Test** | Unit test (mock yok) | Integration test (mock gerekir) |
| **Örnek** | "2 entity arası kural kontrol" | "lock al → entity oluştur → DB kaydet → event yayınla" |
| **Dosya yeri** | `domain/` klasöründe | Modül kök dizininde (`.service.ts`) |

---

## 6. EVENT SOURCING LITE

### Ne zaman kullan?

| Soru | Evet → Event Sourcing | Hayır → Normal CRUD |
|------|----------------------|---------------------|
| "Neden bu duruma geldik?" sorusu önemli mi? | Fiyat değişiklik geçmişi | Kullanıcı profil güncelleme |
| Regülasyon/audit zorunluluğu var mı? | Finansal işlem geçmişi | Blog yazısı düzenleme |
| Geçmiş veriden analiz yapılacak mı? | Fiyat trendi raporu | Adres değişikliği |
| Tüm sisteme mi, tek modüle mi? | **Tek modül yeterli** → Lite | Tüm sistem → Framework kullan |

### Normal CRUD vs Event Sourcing karşılaştırma

```
CRUD:              UPDATE prices SET amount=750 WHERE id=1
                   → Önceki değer (500) KAYBOLDU

Event Sourcing:    INSERT INTO pricing_events (type, payload)
                   VALUES ('SURGE_APPLIED', {old:500, new:750, reason:'high_demand'})
                   → Hem eski hem yeni değer, hem NEDEN değiştiği KAYITLI
```

### Kod şablonu

```typescript
// ─── dosya: xxx.events.ts (event tanımları) ───

export interface PriceSetEvent {
  type: 'PRICE_SET';
  value: number;
  setBy: string;
}

export interface PriceAdjustedEvent {
  type: 'PRICE_ADJUSTED';
  oldValue: number;
  newValue: number;
  reason: string;
}

export type PricingEvent = PriceSetEvent | PriceAdjustedEvent;

// Replay fonksiyonu: event listesinden güncel durumu hesapla
export function replay(events: PricingEvent[]): { currentValue: number } {
  let currentValue = 0;

  for (const event of events) {
    switch (event.type) {
      case 'PRICE_SET':
        currentValue = event.value;
        break;
      case 'PRICE_ADJUSTED':
        currentValue = event.newValue;
        break;
    }
  }

  return { currentValue };
}
```

```typescript
// ─── repository: SADECE INSERT (update/delete YOK) ───

async appendEvent(data: {
  aggregateId: string;
  type: string;
  payload: object;        // ← Event verisi (JSON)
}): Promise<void> {
  await db.pricingEvent.create({ data });
  // UPDATE veya DELETE metodu YOK — bu bilinçli kısıtlama
}
```

```typescript
// ─── projection: Event'lerden hesaplanmış güncel durum ───
// Her zaman event'lerden yeniden oluşturulabilir (rebuild)

async rebuild(aggregateId: string): Promise<CurrentState> {
  const events = await repo.getEvents(aggregateId);   // Tüm event'ler
  const state = replay(events);                        // Fold/reduce
  await repo.upsertProjection(aggregateId, state);     // Cache tablosu güncelle
  await cache.set(`price:${aggregateId}`, state, 30);  // Redis cache
  return state;
}
```

### Okuma katmanları (hız sırası)

| Katman | Hız | Kaynak | Ne zaman güncellenir |
|--------|:---:|--------|---------------------|
| ① Redis cache | ~0.1ms | `cache.get()` | Her yazımda set edilir, TTL ile expire |
| ② DB projeksiyon tablosu | ~2ms | `currentPrices` tablosu | Her yazımda upsert |
| ③ Event replay (son çare) | ~50ms | Tüm event'leri oku + fold | Projeksiyon yoksa veya rebuild gerekirse |

---

## 7. AGGREGATE BOUNDARY (Sınır Kuralları)

### Aggregate nedir?

```
┌─────────────────────────────────────┐
│       Reservation (ROOT)             │  ← Dış dünya SADECE root ile konuşur
│                                      │
│  ┌──────────┐  ┌──────────┐         │
│  │ SeatHold │  │ SeatHold │         │  ← İç nesnelere doğrudan erişim YOK
│  └──────────┘  └──────────┘         │
│                                      │
│  Money (totalPrice)                  │  ← Value object
│                                      │
└─────────────────────────────────────┘
```

### Aggregate kuralları

| Kural | Açıklama | İhlal edilirse |
|-------|----------|----------------|
| Dış erişim sadece root üzerinden | `reservation.seatHolds` → ReadonlyArray | Birisi doğrudan SeatHold ekler → tutarsızlık |
| Bir transaction = bir aggregate | Reservation + SeatHold'ları birlikte kaydet | SeatHold kaydedilir ama Reservation kaydedilmez → orphan veri |
| Aggregate'ler arası referans ID ile | `reservation.eventId` (Event nesnesini tutmaz) | Circular dependency, bellek şişmesi |
| İç nesneler root'suz var olamaz | SeatHold tek başına anlamsız | Hangi reservation'a ait olduğu belirsiz |

---

## 8. HIZLI REFERANS — "Bu kodu nereye yazmalıyım?"

```
İş kuralı nerede yazılmalı?
│
├─ Tek entity kendi verisiyle karar verebiliyor mu?
│  YES → Entity command method
│         reservation.confirmPayment()
│         reservation.cancel()
│
├─ Birden fazla entity/aggregate arası kural mı?
│  YES → Domain Service
│         bookingDomainService.validateCrossReservationRules()
│
├─ DB sorgusu veya dış servis gerekiyor mu?
│  YES → Application Service
│         bookingService.createReservation()  // lock + DB + queue
│
├─ Genel hesaplama, entity ile ilgisiz mi?
│  YES → Pure function veya Value Object
│         replayPricingEvents()
│         Money.fromCents(1999).multiply(3)
│
└─ Validation (girdi kontrolü) mü?
   YES → Zod schema (route katmanında)
         createReservationSchema.parse(request.body)
```

---

## 9. DOSYA İSİMLENDİRME KONVANSİYONU

| Tür | Dosya adı | Örnek |
|-----|----------|-------|
| Value Object | `xxx.value-object.ts` | `money.value-object.ts` |
| Entity / Aggregate Root | `xxx.entity.ts` | `reservation.entity.ts` |
| Domain Events | `xxx.events.ts` | `reservation.events.ts` |
| Domain Service | `xxx-domain.service.ts` | `booking-domain.service.ts` |
| Application Service | `xxx.service.ts` | `booking.service.ts` |
| Repository | `xxx.repository.ts` | `booking.repository.ts` |
| Zod Schemas | `xxx.schema.ts` | `booking.schema.ts` |
| Routes | `xxx.routes.ts` | `booking.routes.ts` |

### Klasör yapısı

```
modules/
├── simple-module/           ← Basit CRUD (domain klasörü YOK)
│   ├── xxx.routes.ts
│   ├── xxx.service.ts
│   ├── xxx.repository.ts
│   ├── xxx.schema.ts
│   └── __tests__/
│
├── complex-module/          ← Karmaşık iş kuralı (domain klasörü VAR)
│   ├── domain/
│   │   ├── xxx.entity.ts
│   │   ├── xxx.events.ts
│   │   ├── yyy.value-object.ts
│   │   └── xxx-domain.service.ts   ← (varsa)
│   ├── xxx.routes.ts
│   ├── xxx.service.ts              ← Application service
│   ├── xxx.repository.ts
│   ├── xxx.schema.ts
│   └── __tests__/
│
└── eventsourced-module/     ← Event sourcing lite
    ├── domain/
    │   └── xxx.events.ts    ← Append-only event tanımları + replay
    ├── projections/
    │   ├── current.projection.ts
    │   └── history.projection.ts
    ├── xxx.routes.ts
    ├── xxx.service.ts
    ├── xxx.repository.ts    ← SADECE insert (update/delete YOK)
    └── __tests__/
```
