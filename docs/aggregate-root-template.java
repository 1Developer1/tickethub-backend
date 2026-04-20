/**
 * ══════════════════════════════════════════════════════════════
 * AGGREGATE ROOT SABLONU — Java
 * ══════════════════════════════════════════════════════════════
 *
 * Bu dosya bir referans sablondur. Yeni bir Aggregate Root
 * yazarken bu dosyayi kopyala, yorum satirlarini takip et.
 *
 * YAPI:
 * ┌─────────────────────────────────────────────────┐
 * │ AggregateRoot<ID>  (base class — bir kez yazilir)│
 * │   ├── ID, version, domainEvents                  │
 * │   ├── addEvent(), pullEvents(), incrementVersion()│
 * │   └── equals(), hashCode() (ID bazli)            │
 * ├─────────────────────────────────────────────────┤
 * │ Order (senin Aggregate Root'un)                  │
 * │   ├── private constructor                        │
 * │   ├── static create() — dogum                    │
 * │   ├── static fromPersistence() — canlandirma     │
 * │   ├── command metodlari — durum degisiklikleri   │
 * │   │     her biri: Guard → Mutate → Version → Event│
 * │   ├── query metodlari — salt okunur              │
 * │   └── toPersistence() — DB'ye kaydetme           │
 * ├─────────────────────────────────────────────────┤
 * │ OrderLine (icindeki Entity — varsa)              │
 * │ Money, Address (icindeki Value Object'ler)       │
 * └─────────────────────────────────────────────────┘
 *
 * KONTROL LISTESI — yeni Aggregate Root yazarken:
 * [ ] ID tipi belirlendi mi? (UUID, Long, String)
 * [ ] Hangi durumlari var? (enum tanimla)
 * [ ] Durum gecis diyagramini cizdim mi? (CREATED → X → Y → Z)
 * [ ] Yasak gecisleri belirledim mi? (Z → CREATED yasak)
 * [ ] Her gecis icin guard kurallari yazdim mi?
 * [ ] Her gecis icin domain event tanimladim mi?
 * [ ] version alani var mi? (optimistic concurrency)
 * [ ] Constructor private mi? (disaridan new yapilamasin)
 * [ ] create() ve fromPersistence() factory method'lari var mi?
 * [ ] Icindeki entity'lere disaridan dogrudan erisilebilir mi? (OLMAMALI)
 */

import java.util.*;
import java.time.Instant;

// ══════════════════════════════════════════════════════════════
// 1. DOMAIN EVENT — once event'leri tanimla
//    Her event bir record (immutable, equals otomatik)
//    Gecmis zaman isimlendir: OrderCreated, LineAdded (oldu-bitti)
// ══════════════════════════════════════════════════════════════

public interface DomainEvent {
    Instant occurredAt();
}

public record OrderCreatedEvent(
    UUID orderId,
    UUID customerId,
    Instant occurredAt
) implements DomainEvent {}

public record LineAddedEvent(
    UUID orderId,
    UUID lineId,
    String productId,
    int quantity,
    int unitPriceInCents,
    Instant occurredAt
) implements DomainEvent {}

public record OrderConfirmedEvent(
    UUID orderId,
    int totalPriceInCents,
    Instant occurredAt
) implements DomainEvent {}

public record OrderCancelledEvent(
    UUID orderId,
    String reason,
    boolean refundRequired,
    Instant occurredAt
) implements DomainEvent {}


// ══════════════════════════════════════════════════════════════
// 2. VALUE OBJECT — kumenin icindeki deger nesneleri
//    record ile yaz (immutable, equals otomatik)
//    Constructor'da gecerlilik kurallari zorla
// ══════════════════════════════════════════════════════════════

public record Money(int amountInCents, String currency) {

    // Constructor'da kurallar — gecersiz deger olusturulamaz
    public Money {
        if (amountInCents < 0)
            throw new IllegalArgumentException("Negatif para olamaz: " + amountInCents);
        if (currency == null || currency.isBlank())
            throw new IllegalArgumentException("Para birimi bos olamaz");
    }

    // Factory method
    public static Money fromCents(int amount, String currency) {
        return new Money(amount, currency);
    }

    public static Money zero(String currency) {
        return new Money(0, currency);
    }

    // Aritmetik — her islem YENI Money doner
    public Money add(Money other) {
        assertSameCurrency(other);
        return new Money(this.amountInCents + other.amountInCents, this.currency);
    }

    public Money subtract(Money other) {
        assertSameCurrency(other);
        int result = this.amountInCents - other.amountInCents;
        if (result < 0)
            throw new IllegalArgumentException("Sonuc negatif olamaz");
        return new Money(result, this.currency);
    }

    public Money multiply(double factor) {
        return new Money((int) Math.round(this.amountInCents * factor), this.currency);
    }

    private void assertSameCurrency(Money other) {
        if (!this.currency.equals(other.currency))
            throw new IllegalArgumentException(
                "Farkli para birimleri: " + this.currency + " vs " + other.currency);
    }

    // record: equals() ve hashCode() otomatik icerik bazli
}


// ══════════════════════════════════════════════════════════════
// 3. ICINDEKI ENTITY — kendi ID'si ve durumu olan alt nesne
//    Disaridan dogrudan erisilemez — root uzerinden yonetilir
// ══════════════════════════════════════════════════════════════

public class OrderLine {

    public enum LineStatus { ADDED, SHIPPED, RETURNED }

    private final UUID id;
    private final String productId;
    private final int quantity;
    private final Money unitPrice;
    private LineStatus status;

    // ❌ public constructor YOK — sadece Order (root) olusturabilir
    OrderLine(UUID id, String productId, int quantity, Money unitPrice) {
        if (productId == null || productId.isBlank())
            throw new IllegalArgumentException("Product ID bos olamaz");
        if (quantity < 1)
            throw new IllegalArgumentException("Miktar en az 1 olmali");

        this.id = id;
        this.productId = productId;
        this.quantity = quantity;
        this.unitPrice = unitPrice;
        this.status = LineStatus.ADDED;
    }

    // package-private: sadece ayni package'taki Order erisiebilir
    void markShipped() {
        if (this.status != LineStatus.ADDED)
            throw new IllegalStateException("Sadece ADDED line gonderillebilir");
        this.status = LineStatus.SHIPPED;
    }

    void markReturned() {
        if (this.status != LineStatus.SHIPPED)
            throw new IllegalStateException("Sadece SHIPPED line iade edilebilir");
        this.status = LineStatus.RETURNED;
    }

    // Getter'lar — disi okuyabilir ama degistiremez
    public UUID getId() { return id; }
    public String getProductId() { return productId; }
    public int getQuantity() { return quantity; }
    public Money getUnitPrice() { return unitPrice; }
    public LineStatus getStatus() { return status; }
    public Money getLineTotal() { return unitPrice.multiply(quantity); }

    // DB'den yuklerken status'u set etmek icin (package-private)
    static OrderLine fromPersistence(UUID id, String productId, int quantity,
                                     Money unitPrice, LineStatus status) {
        var line = new OrderLine(id, productId, quantity, unitPrice);
        line.status = status;
        return line;
    }
}


// ══════════════════════════════════════════════════════════════
// 4. DURUM TANIMLA — enum ile tum durumlari listele
//    Durum gecis diyagramini ONCE ciz, sonra kodla:
//
//    DRAFT ──addLine()──→ DRAFT (kendine dongu)
//    DRAFT ──confirm()──→ CONFIRMED
//    DRAFT ──cancel()───→ CANCELLED
//    CONFIRMED ──cancel()──→ CANCELLED (iade kosullu)
//    CONFIRMED ──shipLine()──→ CONFIRMED (line bazli)
//    [tum line SHIPPED] ──→ FULFILLED (otomatik)
//
//    YASAK GECISLER:
//    CANCELLED → herhangi sey ❌
//    FULFILLED → herhangi sey ❌
//    CONFIRMED → DRAFT ❌
// ══════════════════════════════════════════════════════════════

public enum OrderStatus {
    DRAFT,       // siparis olusturuldu, henuz onaylanmadi
    CONFIRMED,   // odeme yapildi
    FULFILLED,   // tum urunler gonderildi
    CANCELLED    // iptal edildi
}


// ══════════════════════════════════════════════════════════════
// 5. AGGREGATE ROOT BASE CLASS — bir kez yaz, hep kullan
//    ID, version, domain events yonetimi
// ══════════════════════════════════════════════════════════════

public abstract class AggregateRoot<ID> {

    protected final ID id;
    private int version;
    private final List<DomainEvent> domainEvents = new ArrayList<>();

    protected AggregateRoot(ID id) {
        this.id = Objects.requireNonNull(id, "Aggregate ID null olamaz");
        this.version = 0;
    }

    // ── ID ──
    public ID getId() { return id; }

    // ── VERSION — optimistic concurrency icin ──
    // Her durum degisikliginde arttirilir
    // Repository'de: UPDATE ... WHERE id = ? AND version = ?
    // Eslesmezse baskasi araya girmis demek → hata firlat
    public int getVersion() { return version; }

    protected void incrementVersion() { this.version++; }

    // DB'den yuklerken version'i set etmek icin
    protected void setVersion(int version) { this.version = version; }

    // ── DOMAIN EVENTS ──
    // Entity durum degistirdiginde event biriktir
    // Service katmaninda pullEvents() ile al, event bus'a yayinla
    protected void addEvent(DomainEvent event) {
        this.domainEvents.add(event);
    }

    public List<DomainEvent> pullEvents() {
        var copy = List.copyOf(this.domainEvents);
        this.domainEvents.clear();
        return copy;
    }

    // ── ESITLIK — ID bazli (Value Object'ten fark bu) ──
    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (!(o instanceof AggregateRoot<?> that)) return false;
        return id.equals(that.id);
    }

    @Override
    public int hashCode() {
        return id.hashCode();
    }
}


// ══════════════════════════════════════════════════════════════
// 6. AGGREGATE ROOT IMPLEMENTASYONU — senin domain nesnen
//
//    DIKKAT EDILECEKLER:
//    ✅ Constructor PRIVATE — disaridan new Order() yapilamaz
//    ✅ Iki factory method: create() (dogum) ve fromPersistence() (canlandirma)
//    ✅ Her command metodu: Guard → Mutate → Version → Event
//    ✅ Guard basarisiz olursa exception firlatilir, nesne degismez
//    ✅ Icindeki entity'lere (OrderLine) disaridan erisim yok
//    ✅ Getter'lar unmodifiable koleksiyon doner
// ══════════════════════════════════════════════════════════════

public class Order extends AggregateRoot<UUID> {

    private UUID customerId;
    private OrderStatus status;
    private final List<OrderLine> lines;
    private Money totalPrice;
    private Instant confirmedAt;
    private Instant cancelledAt;
    private final Instant createdAt;

    // ── PRIVATE CONSTRUCTOR — disaridan cagrilamaz ──
    private Order(UUID id, UUID customerId, List<OrderLine> lines,
                  Money totalPrice, OrderStatus status, Instant createdAt) {
        super(id);
        this.customerId = customerId;
        this.status = status;
        this.lines = new ArrayList<>(lines);
        this.totalPrice = totalPrice;
        this.createdAt = createdAt;
    }

    // ══════════════════════════════════════════
    // FACTORY METHOD 1: DOGUM — yeni nesne olustur
    // Sadece ilk olusturma icin kullanilir
    // ══════════════════════════════════════════
    public static Order create(UUID customerId) {
        var id = UUID.randomUUID();
        var order = new Order(
            id,
            customerId,
            new ArrayList<>(),
            Money.zero("TRY"),
            OrderStatus.DRAFT,
            Instant.now()
        );

        // Dogum event'i
        order.addEvent(new OrderCreatedEvent(id, customerId, Instant.now()));

        return order;
    }

    // ══════════════════════════════════════════
    // FACTORY METHOD 2: CANLANDIRMA — DB'den yukle
    // Repository icerisinde cagirilir
    // Kural kontrolu YAPILMAZ (veri zaten gecerli)
    // ══════════════════════════════════════════
    public static Order fromPersistence(UUID id, UUID customerId, OrderStatus status,
                                         List<OrderLine> lines, Money totalPrice,
                                         int version, Instant createdAt,
                                         Instant confirmedAt, Instant cancelledAt) {
        var order = new Order(id, customerId, lines, totalPrice, status, createdAt);
        order.setVersion(version);
        order.confirmedAt = confirmedAt;
        order.cancelledAt = cancelledAt;
        return order;
    }

    // ══════════════════════════════════════════
    // COMMAND METODLARI — durum degistiren islemler
    // Her biri: GUARD → MUTATE → VERSION → EVENT
    //
    // Guard basarisiz → exception, nesne DEGiSMEZ
    // Guard basarili → durum degisir, version artar, event biriktir
    // ══════════════════════════════════════════

    /**
     * Siparise urun ekle — DRAFT durumunda olmali
     */
    public void addLine(String productId, int quantity, Money unitPrice) {
        // ── GUARD ──
        if (this.status != OrderStatus.DRAFT)
            throw new IllegalStateException(
                "Siparis '" + status + "' durumunda — urun eklenemez. Sadece DRAFT siparise eklenir.");

        // ── MUTATE ──
        var lineId = UUID.randomUUID();
        var line = new OrderLine(lineId, productId, quantity, unitPrice);
        this.lines.add(line);
        this.totalPrice = recalculateTotal();

        // ── VERSION ──
        incrementVersion();

        // ── EVENT ──
        addEvent(new LineAddedEvent(
            getId(), lineId, productId, quantity,
            unitPrice.amountInCents(), Instant.now()));
    }

    /**
     * Siparisi onayla (odeme yapildi) — DRAFT → CONFIRMED
     */
    public void confirm() {
        // ── GUARD: gecis kurali ──
        if (this.status != OrderStatus.DRAFT)
            throw new IllegalStateException(
                "Sadece DRAFT siparis onaylanabilir. Mevcut durum: " + status);

        // ── GUARD: is kurali ──
        if (this.lines.isEmpty())
            throw new IllegalStateException(
                "Bos siparis onaylanamaz — en az 1 urun ekleyin");

        // ── MUTATE ──
        this.status = OrderStatus.CONFIRMED;
        this.confirmedAt = Instant.now();

        // ── VERSION ──
        incrementVersion();

        // ── EVENT ──
        addEvent(new OrderConfirmedEvent(
            getId(), totalPrice.amountInCents(), Instant.now()));
    }

    /**
     * Bir urunu gonder — CONFIRMED durumunda, ilgili line ADDED olmali
     * Tum line'lar SHIPPED olunca siparis otomatik FULFILLED olur
     */
    public void shipLine(UUID lineId) {
        // ── GUARD: gecis kurali ──
        if (this.status != OrderStatus.CONFIRMED)
            throw new IllegalStateException(
                "Sadece CONFIRMED siparisten urun gonderilebilir");

        // ── GUARD: line var mi? ──
        var line = findLineOrThrow(lineId);

        // ── MUTATE (icindeki entity'yi root UZERINDEN degistir) ──
        line.markShipped();

        // Tum line'lar gonderildiyse otomatik gecis
        if (allLinesShipped()) {
            this.status = OrderStatus.FULFILLED;
        }

        // ── VERSION ──
        incrementVersion();
    }

    /**
     * Siparisi iptal et
     * DRAFT → CANCELLED: kosulsuz
     * CONFIRMED → CANCELLED: iade gerekli + zaman kisitlamasi olabilir
     * FULFILLED/CANCELLED → CANCELLED: YASAK
     */
    public void cancel(String reason) {
        // ── GUARD: yasak gecisler ──
        if (this.status == OrderStatus.CANCELLED)
            throw new IllegalStateException("Siparis zaten iptal edilmis");
        if (this.status == OrderStatus.FULFILLED)
            throw new IllegalStateException(
                "Teslim edilmis siparis iptal edilemez — iade sureci baslatin");

        // ── GUARD: is kurali (CONFIRMED ise iade gerekecek) ──
        boolean refundRequired = (this.status == OrderStatus.CONFIRMED);

        // ── MUTATE ──
        this.status = OrderStatus.CANCELLED;
        this.cancelledAt = Instant.now();

        // ── VERSION ──
        incrementVersion();

        // ── EVENT ──
        addEvent(new OrderCancelledEvent(
            getId(), reason, refundRequired, Instant.now()));
    }

    // ══════════════════════════════════════════
    // QUERY METODLARI — durumu DEGISTIRMEZ
    // Sadece okuma, guard yok, event yok
    // ══════════════════════════════════════════

    public boolean isDraft()     { return status == OrderStatus.DRAFT; }
    public boolean isConfirmed() { return status == OrderStatus.CONFIRMED; }
    public boolean isFulfilled() { return status == OrderStatus.FULFILLED; }
    public boolean isCancelled() { return status == OrderStatus.CANCELLED; }
    public int getLineCount()    { return lines.size(); }

    // ── GETTER'LAR ──
    // Koleksiyonlar UNMODIFIABLE doner — disaridan ekleme/cikarma yapilamaz
    public UUID getCustomerId()              { return customerId; }
    public OrderStatus getStatus()           { return status; }
    public List<OrderLine> getLines()        { return Collections.unmodifiableList(lines); }
    public Money getTotalPrice()             { return totalPrice; }
    public Optional<Instant> getConfirmedAt(){ return Optional.ofNullable(confirmedAt); }
    public Optional<Instant> getCancelledAt(){ return Optional.ofNullable(cancelledAt); }
    public Instant getCreatedAt()            { return createdAt; }

    // ══════════════════════════════════════════
    // PRIVATE YARDIMCI METODLAR
    // ══════════════════════════════════════════

    private Money recalculateTotal() {
        return lines.stream()
            .map(OrderLine::getLineTotal)
            .reduce(Money.zero("TRY"), Money::add);
    }

    private OrderLine findLineOrThrow(UUID lineId) {
        return lines.stream()
            .filter(l -> l.getId().equals(lineId))
            .findFirst()
            .orElseThrow(() -> new IllegalArgumentException(
                "Line bulunamadi: " + lineId));
    }

    private boolean allLinesShipped() {
        return lines.stream()
            .allMatch(l -> l.getStatus() == OrderLine.LineStatus.SHIPPED);
    }

    // ══════════════════════════════════════════
    // PERSISTENCE — DB'ye kaydetme icin
    // Entity → DB satiri donusumu
    // ══════════════════════════════════════════

    public OrderSnapshot toPersistence() {
        return new OrderSnapshot(
            getId(),
            customerId,
            status,
            totalPrice.amountInCents(),
            totalPrice.currency(),
            getVersion(),
            createdAt,
            confirmedAt,
            cancelledAt,
            lines.stream().map(l -> new OrderLineSnapshot(
                l.getId(), l.getProductId(), l.getQuantity(),
                l.getUnitPrice().amountInCents(), l.getStatus()
            )).toList()
        );
    }

    // DB transfer nesneleri
    public record OrderSnapshot(
        UUID id, UUID customerId, OrderStatus status,
        int totalPriceInCents, String currency, int version,
        Instant createdAt, Instant confirmedAt, Instant cancelledAt,
        List<OrderLineSnapshot> lines
    ) {}

    public record OrderLineSnapshot(
        UUID id, String productId, int quantity,
        int unitPriceInCents, OrderLine.LineStatus status
    ) {}
}


// ══════════════════════════════════════════════════════════════
// 7. KULLANIM ORNEGI — Application Service
//    Aggregate Root'u nasil kullanirsin:
//    Yukle → Command cagir → Kaydet → Event'leri yayinla
// ══════════════════════════════════════════════════════════════

/*
public class OrderService {

    private final OrderRepository repository;
    private final EventPublisher eventPublisher;

    // Yeni siparis olustur
    public UUID createOrder(UUID customerId) {
        // 1. DOGUM
        var order = Order.create(customerId);

        // 2. KAYDET
        repository.save(order);

        // 3. EVENT'LERI YAYINLA
        order.pullEvents().forEach(eventPublisher::publish);

        return order.getId();
    }

    // Siparise urun ekle
    public void addLine(UUID orderId, String productId, int qty, int priceInCents) {
        // 4. CANLANDIR (DB'den yukle)
        var order = repository.findById(orderId)
            .orElseThrow(() -> new NotFoundException("Order", orderId));

        // 5. COMMAND CAGIR (guard + mutate + version + event)
        order.addLine(productId, qty, Money.fromCents(priceInCents, "TRY"));

        // 6. KAYDET (optimistic concurrency: WHERE version = ?)
        repository.save(order);

        // 7. EVENT'LERI YAYINLA
        order.pullEvents().forEach(eventPublisher::publish);
    }

    // Siparisi onayla
    public void confirmOrder(UUID orderId) {
        var order = repository.findById(orderId)
            .orElseThrow(() -> new NotFoundException("Order", orderId));

        order.confirm();

        repository.save(order);
        order.pullEvents().forEach(eventPublisher::publish);
    }

    // Urun gonder
    public void shipLine(UUID orderId, UUID lineId) {
        var order = repository.findById(orderId)
            .orElseThrow(() -> new NotFoundException("Order", orderId));

        order.shipLine(lineId);

        repository.save(order);
        order.pullEvents().forEach(eventPublisher::publish);
    }

    // Siparis iptal
    public void cancelOrder(UUID orderId, String reason) {
        var order = repository.findById(orderId)
            .orElseThrow(() -> new NotFoundException("Order", orderId));

        order.cancel(reason);

        repository.save(order);
        order.pullEvents().forEach(eventPublisher::publish);
    }
}
*/
