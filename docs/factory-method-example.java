/**
 * ══════════════════════════════════════════════════════════════
 * FACTORY METHOD ORNEGI — Java
 * ══════════════════════════════════════════════════════════════
 *
 * Senaryo: E-ticaret siparis sistemi
 * Ayni Order nesnesi 5 farkli yoldan olusturuluyor.
 * Her yolun kurallari farkli.
 *
 * Constructor public olsaydi:
 *   new Order(...) → hangi yoldan geldigini bilmez,
 *   hangi kurallari uygulayacagini bilemez,
 *   fromPersistence icin kural isletirse DB'den yukleme patlar,
 *   create icin kural isletmezse gecersiz siparis olusur.
 */

import java.time.Instant;
import java.util.*;

// ── Yardimci tipler ──

record Address(String street, String city, String postalCode, String country) {
    public Address {
        if (city == null || city.isBlank()) throw new IllegalArgumentException("Sehir bos olamaz");
    }
}

record OrderItem(String productId, String productName, int quantity, int priceInCents) {
    public OrderItem {
        if (quantity < 1) throw new IllegalArgumentException("Miktar en az 1");
        if (priceInCents < 0) throw new IllegalArgumentException("Fiyat negatif olamaz");
    }

    boolean isDiscontinued() { return false; /* gercekte DB'den kontrol edilir */ }
    int totalCents() { return quantity * priceInCents; }
}

enum OrderStatus { DRAFT, CONFIRMED, SHIPPED, FULFILLED, CANCELLED }
enum OrderSource { WEB, ADMIN, REORDER, TRENDYOL, HEPSIBURADA, AMAZON, SUBSCRIPTION }


// ══════════════════════════════════════════════════════════════
// ORDER AGGREGATE ROOT — 5 farkli olusturma yolu
// ══════════════════════════════════════════════════════════════

public class Order {

    private final UUID id;
    private UUID customerId;
    private List<OrderItem> items;
    private OrderStatus status;
    private OrderSource source;
    private int version;
    private Address shippingAddress;
    private String externalId;
    private UUID previousOrderId;
    private UUID createdBy;
    private String note;
    private Instant createdAt;
    private Instant confirmedAt;

    // ── PRIVATE CONSTRUCTOR — disaridan new Order() yapilamaz ──
    private Order(UUID id) {
        this.id = id;
        this.items = new ArrayList<>();
        this.version = 1;
        this.createdAt = Instant.now();
    }


    // ══════════════════════════════════════════
    // YOL 1: MUSTERI SIPARISI
    // Web sitesinden musteri siparis veriyor
    // En kati kurallar burada
    // ══════════════════════════════════════════
    public static Order createFromCart(UUID customerId, List<OrderItem> items, Address shippingAddress) {

        // Kural: sepet bos olamaz
        if (items == null || items.isEmpty())
            throw new IllegalArgumentException("Bos sepetle siparis verilemez");

        // Kural: max 50 urun
        if (items.size() > 50)
            throw new IllegalArgumentException("Tek sipariste max 50 urun");

        // Kural: adres zorunlu
        if (shippingAddress == null)
            throw new IllegalArgumentException("Kargo adresi zorunlu");

        // Kural: toplam 0 olamaz
        int total = items.stream().mapToInt(OrderItem::totalCents).sum();
        if (total <= 0)
            throw new IllegalArgumentException("Siparis tutari 0 olamaz");

        var order = new Order(UUID.randomUUID());
        order.customerId = customerId;
        order.items = new ArrayList<>(items);
        order.status = OrderStatus.DRAFT;        // musteri siparisi DRAFT baslar
        order.source = OrderSource.WEB;
        order.shippingAddress = shippingAddress;  // zorunlu
        return order;
    }


    // ══════════════════════════════════════════
    // YOL 2: ADMIN SIPARISI
    // Admin panelden manuel olusturma
    // Kuralsiz — admin her seyi yapabilir
    // ══════════════════════════════════════════
    public static Order createByAdmin(UUID customerId, UUID adminId, String note) {

        // Kural: admin ID zorunlu (kim olusturdugu kayit altinda olmali)
        if (adminId == null)
            throw new IllegalArgumentException("Admin ID zorunlu");

        var order = new Order(UUID.randomUUID());
        order.customerId = customerId;
        order.items = new ArrayList<>();         // bos olabilir — sonra eklenir
        order.status = OrderStatus.CONFIRMED;    // admin siparisi direkt CONFIRMED
        order.source = OrderSource.ADMIN;
        order.createdBy = adminId;
        order.note = note;
        order.shippingAddress = null;            // sonra eklenir — zorunlu degil
        order.confirmedAt = Instant.now();
        return order;

        // createFromCart'tan farklar:
        // - sepet bos olabilir (admin sonra ekler)
        // - adres zorunlu degil (sonra eklenir)
        // - status DRAFT degil CONFIRMED (admin onay beklemez)
        // - max 50 siniri yok (admin sinir tanimaz)
    }


    // ══════════════════════════════════════════
    // YOL 3: TEKRAR SIPARIS
    // Musteri "ayni siparisi tekrar ver" diyor
    // Onceki siparisten turetiliyor
    // ══════════════════════════════════════════
    public static Order reorder(Order previousOrder, Address newAddress) {

        // Kural: onceki siparis tamamlanmis olmali
        if (previousOrder.status != OrderStatus.CONFIRMED
            && previousOrder.status != OrderStatus.FULFILLED)
            throw new IllegalStateException(
                "Sadece tamamlanmis siparis tekrarlanabilir. Mevcut: " + previousOrder.status);

        // Kural: iptal edilmis urunler cikarilir
        var activeItems = previousOrder.items.stream()
            .filter(item -> !item.isDiscontinued())
            .toList();

        if (activeItems.isEmpty())
            throw new IllegalStateException("Onceki siparisteki tum urunler kaldirilmis");

        var order = new Order(UUID.randomUUID());
        order.customerId = previousOrder.customerId;
        order.items = new ArrayList<>(activeItems);       // filtrelenmis urunler
        order.status = OrderStatus.DRAFT;
        order.source = OrderSource.REORDER;
        order.previousOrderId = previousOrder.id;         // hangi siparisten turetildi
        order.shippingAddress = (newAddress != null)
            ? newAddress
            : previousOrder.shippingAddress;              // yeni adres yoksa eskisi
        return order;

        // createFromCart'tan farklar:
        // - items kullanicidan degil onceki siparisten geliyor
        // - discontinued urunler filtreleniyor
        // - previousOrderId kaydediliyor
        // - sepet bos kontrolu farkli (filtreleme sonrasi kontrol)
    }


    // ══════════════════════════════════════════
    // YOL 4: DIS PLATFORMDAN IMPORT
    // Trendyol, Hepsiburada, Amazon entegrasyonu
    // Odeme dis platformda yapilmis
    // ══════════════════════════════════════════
    public static Order fromExternalPlatform(
        String externalId,
        OrderSource platform,
        List<OrderItem> items,
        Address shippingAddress
    ) {
        // Kural: externalId zorunlu (duplicate import onleme)
        if (externalId == null || externalId.isBlank())
            throw new IllegalArgumentException("Dis sistem siparis ID zorunlu");

        // Kural: sadece bilinen platformlar
        var allowed = Set.of(OrderSource.TRENDYOL, OrderSource.HEPSIBURADA, OrderSource.AMAZON);
        if (!allowed.contains(platform))
            throw new IllegalArgumentException("Gecersiz platform: " + platform);

        // Kural: urunler bos olamaz (dis platform zaten urun gonderiyor)
        if (items == null || items.isEmpty())
            throw new IllegalArgumentException("Dis platform siparisinde urun olmali");

        var order = new Order(UUID.randomUUID());
        order.customerId = null;                 // dis platformda baska musteri sistemi
        order.items = new ArrayList<>(items);
        order.status = OrderStatus.CONFIRMED;    // odeme dis platformda yapilmis
        order.source = platform;
        order.externalId = externalId;
        order.shippingAddress = shippingAddress;
        order.confirmedAt = Instant.now();
        return order;

        // createFromCart'tan farklar:
        // - customerId null olabilir (dis platformun musterisi)
        // - status direkt CONFIRMED (odeme zaten alinmis)
        // - externalId var (duplicate onleme)
        // - max 50 siniri yok (platform kendi sinirini koyar)
    }


    // ══════════════════════════════════════════
    // YOL 5: DB'DEN DIRILTME
    // Mevcut siparisi yukle — HICBIR KURAL YOK
    // ══════════════════════════════════════════
    public static Order fromPersistence(
        UUID id, UUID customerId, List<OrderItem> items,
        OrderStatus status, OrderSource source, int version,
        Address shippingAddress, String externalId,
        UUID previousOrderId, UUID createdBy, String note,
        Instant createdAt, Instant confirmedAt
    ) {
        // KURAL YOK — DB'deki veri zaten gecerli
        //
        // status = CANCELLED olabilir — normal
        // items bos olabilir — admin siparisi boyle baslamis
        // shippingAddress null olabilir — henuz eklenmemis
        // expiresAt gecmiste olabilir — zaten suresi dolmus siparis
        // customerId null olabilir — dis platform siparisi

        var order = new Order(id);
        order.customerId = customerId;
        order.items = new ArrayList<>(items);
        order.status = status;
        order.source = source;
        order.version = version;
        order.shippingAddress = shippingAddress;
        order.externalId = externalId;
        order.previousOrderId = previousOrderId;
        order.createdBy = createdBy;
        order.note = note;
        order.createdAt = createdAt;
        order.confirmedAt = confirmedAt;
        return order;
    }


    // ══════════════════════════════════════════
    // KARSILASTIRMA: CONSTRUCTOR PUBLIC OLSAYDI
    // ══════════════════════════════════════════

    /*
    // ❌ Constructor public — hicbir kural zorlanamaz

    public Order(UUID id, UUID customerId, List<OrderItem> items, ...) {
        this.id = id;
        this.items = items;
        // ... dogrudan atama, kontrol yok
    }

    // Gelistirici A: musteri siparisi — sepet kontrolu YOK
    var order = new Order(uuid, customerId, List.of(), ...);
    // bos sepetle siparis olusturuldu!

    // Gelistirici B: admin siparisi — ama status DRAFT yazdi
    var order = new Order(uuid, customerId, items, OrderStatus.DRAFT, ...);
    // admin siparisi CONFIRMED baslamali — kural atlandi!

    // Gelistirici C: reorder — discontinued urunleri cikarMADI
    var order = new Order(uuid, customerId, eskiItems, ...);
    // kaldirilmis urunler dahil — kural atlandi!

    // Gelistirici D: import — externalId YAZMAYI unuttu
    var order = new Order(uuid, null, items, OrderStatus.CONFIRMED, ...);
    // externalId yok — duplicate import engellenemez!

    // Gelistirici E: DB'den yukleme
    // Eger constructor'a kural yazsak → DB'den yuklerken patlar
    // Kural yazmasak → yukaridaki 4 yol kontrolsuz kalir
    // IKILEMMA — factory ile cozulur
    */


    // ══════════════════════════════════════════
    // 5 YOLUN KURAL KARSILASTIRMASI
    // ══════════════════════════════════════════

    /*
    ┌──────────────────┬──────────┬──────────┬──────────┬──────────┬──────────┐
    │ Kural            │ Cart     │ Admin    │ Reorder  │ Import   │ DB       │
    ├──────────────────┼──────────┼──────────┼──────────┼──────────┼──────────┤
    │ Sepet bos?       │ YASAK    │ SERBEST  │ KONTROL  │ YASAK    │ -        │
    │ Max 50 urun?     │ EVET     │ HAYIR    │ HAYIR    │ HAYIR    │ -        │
    │ Adres zorunlu?   │ EVET     │ HAYIR    │ HAYIR    │ EVET     │ -        │
    │ Baslangic status │ DRAFT    │ CONFIRMED│ DRAFT    │ CONFIRMED│ HERHANGI │
    │ customerId       │ ZORUNLU  │ ZORUNLU  │ ONCEKI   │ NULL OK  │ HERHANGI │
    │ externalId       │ YOK      │ YOK      │ YOK      │ ZORUNLU  │ HERHANGI │
    │ previousOrderId  │ YOK      │ YOK      │ ZORUNLU  │ YOK      │ HERHANGI │
    │ Discontinued     │ -        │ -        │ CIKARILIR│ -        │ -        │
    │ Herhangi kontrol │ 4 kural  │ 1 kural  │ 3 kural  │ 3 kural  │ 0 kural  │
    └──────────────────┴──────────┴──────────┴──────────┴──────────┴──────────┘

    5 farkli yol, 5 farkli kural seti. Constructor bunlari ayirt edemez.
    */


    // ── Getter'lar ──
    public UUID getId() { return id; }
    public UUID getCustomerId() { return customerId; }
    public List<OrderItem> getItems() { return Collections.unmodifiableList(items); }
    public OrderStatus getStatus() { return status; }
    public OrderSource getSource() { return source; }
    public int getVersion() { return version; }
    public Address getShippingAddress() { return shippingAddress; }
    public String getExternalId() { return externalId; }
    public UUID getPreviousOrderId() { return previousOrderId; }
}
