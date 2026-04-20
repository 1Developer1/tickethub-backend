# SyncEventBus — 3 Dilde Karşılaştırma

> EventBus bir framework DEĞİL. Bizim yazdığımız basit bir class.
> İçinde bir **sözlük** (dictionary/map) var, o kadar.
> Sözlük: `{ "event adı" → [fonksiyon1, fonksiyon2, ...] }`

---

## TypeScript (Projemizdeki Gerçek Kod)

```typescript
// ── Event tipleri (type safety için) ──
interface EventMap {
  'reservation.created':   { reservationId: string; userId: string };
  'reservation.confirmed': { reservationId: string; paymentId: string };
  'reservation.expired':   { reservationId: string };
}

// Handler fonksiyon tipi
type EventHandler<T extends keyof EventMap> = (payload: EventMap[T]) => Promise<void>;

// Handler'ları tutan sözlük tipi
type HandlerMap = {
  [K in keyof EventMap]?: EventHandler<K>[];
};


// ── EventBus class'ı ──
class SyncEventBus {

  // ★ Tüm "hafıza" bu — event adı → fonksiyon listesi
  private handlers: HandlerMap = {};

  // "Bu event olursa beni çağır" — listeye fonksiyon ekler
  on<T extends keyof EventMap>(event: T, handler: EventHandler<T>): void {
    if (!this.handlers[event]) {
      this.handlers[event] = [];
    }
    this.handlers[event]!.push(handler);
  }

  // "Bu event oldu" — listedeki tüm fonksiyonları sırayla çağırır
  async emit<T extends keyof EventMap>(event: T, payload: EventMap[T]): Promise<void> {
    const handlers = this.handlers[event] as EventHandler<T>[] | undefined;
    if (!handlers) return;

    for (const handler of handlers) {
      await handler(payload);  // sırayla çalıştır, biri patlarsa dur
    }
  }

  // Test için temizlik
  clear(): void {
    this.handlers = {};
  }
}

// ★ Singleton — tüm uygulama boyunca tek nesne
export const syncEventBus = new SyncEventBus();


// ── Kullanım ──

// 1. Handler kaydet (uygulama başlarken, bir kez)
syncEventBus.on('reservation.confirmed', async (payload) => {
  console.log(`Email gönder: ${payload.reservationId}`);
});

syncEventBus.on('reservation.confirmed', async (payload) => {
  console.log(`QR üret: ${payload.reservationId}`);
});

// 2. Event yayınla (service içinde, her istekte)
await syncEventBus.emit('reservation.confirmed', {
  reservationId: 'res-123',
  paymentId: 'pay-456',
});
// → "Email gönder: res-123"
// → "QR üret: res-123"
```

---

## Java

```java
import java.util.*;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.function.Consumer;

// ── Event tipleri ──
// Java'da her event ayrı bir record/class olur

record ReservationCreated(String reservationId, String userId) {}
record ReservationConfirmed(String reservationId, String paymentId) {}
record ReservationExpired(String reservationId) {}


// ── EventBus class'ı ──
public class SyncEventBus {

    // ★ Tüm "hafıza" bu — event CLASS'ı → fonksiyon listesi
    //
    // TypeScript'te key string'di ("reservation.confirmed")
    // Java'da key Class objesi (ReservationConfirmed.class)
    //
    // Neden Class? Java'da string ile tip güvenliği sağlanamaz.
    // Class<T> kullanınca derleyici yanlış tipe handler eklemeyi engeller.
    private final Map<Class<?>, List<Consumer<?>>> handlers = new HashMap<>();


    // "Bu event olursa beni çağır"
    public <T> void on(Class<T> eventType, Consumer<T> handler) {
        handlers.computeIfAbsent(eventType, k -> new CopyOnWriteArrayList<>())
                .add(handler);
    }

    // "Bu event oldu" — listedeki tüm fonksiyonları sırayla çağırır
    @SuppressWarnings("unchecked")
    public <T> void emit(T event) {
        List<Consumer<?>> list = handlers.get(event.getClass());
        if (list == null) return;

        for (Consumer<?> handler : list) {
            ((Consumer<T>) handler).accept(event);  // fonksiyonu çağır
        }
    }

    // Test için temizlik
    public void clear() {
        handlers.clear();
    }


    // ★ Singleton — tüm uygulama boyunca tek nesne
    private static final SyncEventBus INSTANCE = new SyncEventBus();
    public static SyncEventBus getInstance() { return INSTANCE; }
    private SyncEventBus() {} // dışarıdan new yapılamaz


    // ── Kullanım ──
    public static void main(String[] args) {

        SyncEventBus bus = SyncEventBus.getInstance();

        // 1. Handler kaydet (uygulama başlarken, bir kez)
        bus.on(ReservationConfirmed.class, event -> {
            System.out.println("Email gönder: " + event.reservationId());
        });

        bus.on(ReservationConfirmed.class, event -> {
            System.out.println("QR üret: " + event.reservationId());
        });

        // 2. Event yayınla (service içinde, her istekte)
        bus.emit(new ReservationConfirmed("res-123", "pay-456"));
        // → "Email gönder: res-123"
        // → "QR üret: res-123"
    }
}
```

---

## C#

```csharp
using System;
using System.Collections.Generic;
using System.Threading.Tasks;

// ── Event tipleri ──
// C#'ta her event ayrı bir record olur (Java gibi)

record ReservationCreated(string ReservationId, string UserId);
record ReservationConfirmed(string ReservationId, string PaymentId);
record ReservationExpired(string ReservationId);


// ── EventBus class'ı ──
public class SyncEventBus
{
    // ★ Tüm "hafıza" bu — event TYPE'ı → fonksiyon listesi
    //
    // TypeScript'te: { "reservation.confirmed": [fn1, fn2] }
    // C#'ta:         { typeof(ReservationConfirmed): [fn1, fn2] }
    //
    // Delegate nedir? C#'ın "fonksiyon referansı" tipi.
    // Func<T, Task> = "T alıp Task dönen fonksiyon"
    private readonly Dictionary<Type, List<Delegate>> _handlers = new();


    // "Bu event olursa beni çağır"
    public void On<T>(Func<T, Task> handler)
    {
        var type = typeof(T);
        if (!_handlers.ContainsKey(type))
            _handlers[type] = new List<Delegate>();

        _handlers[type].Add(handler);
    }

    // "Bu event oldu" — listedeki tüm fonksiyonları sırayla çağırır
    public async Task EmitAsync<T>(T eventData)
    {
        var type = typeof(T);
        if (!_handlers.TryGetValue(type, out var list)) return;

        foreach (var handler in list)
        {
            await ((Func<T, Task>)handler)(eventData);  // fonksiyonu çağır
        }
    }

    // Test için temizlik
    public void Clear() => _handlers.Clear();


    // ★ Singleton — tüm uygulama boyunca tek nesne
    public static SyncEventBus Instance { get; } = new SyncEventBus();
    private SyncEventBus() { } // dışarıdan new yapılamaz
}


// ── Kullanım ──
public class Program
{
    public static async Task Main()
    {
        var bus = SyncEventBus.Instance;

        // 1. Handler kaydet (uygulama başlarken, bir kez)
        bus.On<ReservationConfirmed>(async e =>
        {
            Console.WriteLine($"Email gönder: {e.ReservationId}");
        });

        bus.On<ReservationConfirmed>(async e =>
        {
            Console.WriteLine($"QR üret: {e.ReservationId}");
        });

        // 2. Event yayınla (service içinde, her istekte)
        await bus.EmitAsync(new ReservationConfirmed("res-123", "pay-456"));
        // → "Email gönder: res-123"
        // → "QR üret: res-123"
    }
}
```

---

## 3 Dilin Karşılaştırması

```
┌─────────────────────┬──────────────────────┬──────────────────────┬──────────────────────┐
│                     │ TypeScript           │ Java                 │ C#                   │
├─────────────────────┼──────────────────────┼──────────────────────┼──────────────────────┤
│ Sözlük tipi         │ { [string]: fn[] }   │ Map<Class, List>     │ Dictionary<Type,List>│
│ Sözlük key'i        │ string               │ Class<?>             │ Type                 │
│                     │ "reservation.confirmed"│ReservationConfirmed │ typeof(Reservation   │
│                     │                      │       .class         │       Confirmed)     │
│ Fonksiyon referansı │ async (payload) => { }│ Consumer<T>         │ Func<T, Task>        │
│ Singleton           │ export const = new() │ private constructor  │ private constructor  │
│                     │                      │ + static INSTANCE    │ + static Instance    │
│ Event tanımı        │ interface EventMap    │ record (her event    │ record (her event    │
│                     │ (tek yerde, hepsi)   │ ayrı dosya)          │ ayrı dosya)          │
│ emit parametresi    │ (eventAdı, payload)  │ (eventNesnesi)       │ (eventNesnesi)       │
│ Tip güvenliği       │ EventMap ile         │ Class<T> ile         │ typeof(T) ile        │
└─────────────────────┴──────────────────────┴──────────────────────┴──────────────────────┘
```

---

## Sözlüğün İçine Ne Ekleniyor — Adım Adım

```
BAŞLANGIÇ:
  handlers = { }                          ← boş sözlük

on("reservation.confirmed", emailGonder):
  handlers = {
    "reservation.confirmed": [ emailGonder ]    ← 1 fonksiyon referansı
  }

on("reservation.confirmed", qrUret):
  handlers = {
    "reservation.confirmed": [ emailGonder, qrUret ]   ← 2 fonksiyon referansı
  }

on("reservation.expired", koltuklariSerbest):
  handlers = {
    "reservation.confirmed": [ emailGonder, qrUret ],
    "reservation.expired":   [ koltuklariSerbest ]      ← yeni event, yeni liste
  }

emit("reservation.confirmed", { id: "123" }):
  → handlers["reservation.confirmed"] → [emailGonder, qrUret]
  → emailGonder({ id: "123" })    ← çağır
  → qrUret({ id: "123" })         ← çağır
  → bitti. EventBus'ta veri KALMIYOR.
```
