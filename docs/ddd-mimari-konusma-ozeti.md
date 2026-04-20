# DDD ve Mimari Konusma Ozeti — 10-12 Nisan 2026

Bu dokuman, TicketHub projesi uzerinden yapilan kapsamli DDD, mimari pattern, sistem arizalari, event bus ve yazilim tasarimi konusmalarinin detayli ozetidir.

---

## Bolum 1: Booking Modulunun Mimari Deseni

### 1.1 Katmanli Mimari (Layered Architecture)

Booking modulu **Katmanli Mimari** kullaniyor. Hexagonal (Ports & Adapters) degil. Dosya yapisi:

```
booking/
├── booking.routes.ts        ← Presentation (HTTP katmani)
├── booking.schema.ts        ← Input validation (Zod)
├── booking.service.ts       ← Application Service (orkestrasyon)
├── booking.repository.ts    ← Persistence (Prisma)
└── domain/
    ├── reservation.entity.ts      ← Domain Model (Aggregate Root)
    ├── money.value-object.ts      ← Value Object
    ├── seat-hold.value-object.ts  ← Value Object
    └── reservation.events.ts      ← Domain Events
```

Klasik 3-tier: presentation → application → persistence, arti bir `domain/` alt klasoru ile is kurallarini ayirmis.

### 1.2 Neden Hexagonal Degil?

Hexagonal olsaydi repository icin bir **interface (port)** olurdu ve service bu interface'e bagimli olurdu. Projede bu yok — `booking.service.ts` dogrudan `booking.repository.ts`'i import ediyor, arada soyutlama yok.

Ama **Payments modulu farkli** — orada Ports & Adapters var:

```
payments/
├── ports/payment-gateway.port.ts      ← Interface (Port)
├── adapters/stripe.adapter.ts         ← Gercek implementasyon
├── adapters/mock-payment.adapter.ts   ← Test implementasyonu
```

Payments'ta interface var cunku **gercek bir ihtiyac** vardi — Stripe ve Mock iki farkli implementasyon. Booking'de tek DB oldugu icin interface eklemek overengineering olur.

Genel proje: **Feature-Based Modular Monolith** — her modul kendi dosyalarina sahip, ama monolitik `controllers/services/repositories` klasor yapisi degil.

### 1.3 Dogrudan Import'un Olumsuzluklari

`bookingRepository`'nin interface olmadan dogrudan import edilmesi 5 olumsuzluk yaratir:

1. **Test zorlugu:** Mock'lamak icin `vi.mock()` gerekiyor — kirli ve kirilgan. Interface olsa constructor'dan fake verirsin.
2. **Vendor lock:** Repository icinde Prisma var. Drizzle'a gecmek istersen service dosyasini da degistirmen gerekir.
3. **Yanlis bagimlilik yonu:** Service somut sinifa bagimli (Dependency Inversion ihlali). Dogrusu: service interface'e bagimli olmali.
4. **Ikinci implementasyon imkansiz:** Cache'li repository, in-memory test repository yazamaz sin.
5. **Circular dependency riski:** Service → Repository dogrudan bagimlilik.

Ama durst olmak gerekirse bu projede buyuk sorun degil — tek DB var, tek implementasyon var, testler `vi.mock` ile calisiyor. Ihtiyac dogdugunda cikarilir.

---

## Bolum 2: DDD Yapi Taslari

### 2.1 Value Object

**Tanim:** Kimligi olmayan, degeri ile tanimlanan, degistirilemez nesne. 100 TL = 100 TL — iki farkli nesne ama esit.

**Metafor:** Olcum aleti. Cetvel, termometre, tarti. 30 cm'lik bir cetvel — kimligi yok (seri numarasiyla ayirt etmezsin), degismez (yarin 35 cm olmaz), uzerinde islem yapabilirsin (30 cm + 20 cm = yeni 50 cm cetvel, eski hala 30 cm).

**4 Temel Ozellik:**

| Ozellik | Aciklama | Ornekte |
|---------|----------|---------|
| Immutable | Olusturulduktan sonra degismez | `readonly _amountInCents` |
| Icerik esitligi | ID yok, tum alanlari ayni = esit | `equals()` miktar + birim kontrol eder |
| Self-validating | Constructor'da kurallar zorlanir | Negatif para olamaz, float olamaz |
| Icsel aritmetik | Islemler sinif icinde, kurallarla | `add()` farkli birimi reddeder |

**Yan Etki Nedir ve Neden Tehlikeli:**

Yan etki: bir nesneyi degistirdiginizde, o nesneye referans tutan baska kodun haberi olmadan etkilenmesi.

```typescript
// MUTABLE — 3 farkli yer habersizce degisir
const price = new Money(5000);
reservation.totalPrice = price;
receipt.amount = price;
invoice.subtotal = price;

price.amount += 900;  // birini degistirdin
// reservation = 5900, receipt = 5900, invoice = 5900 — HEPSI degisti!

// IMMUTABLE — eski deger korunur
const withVat = price.add(Money.fromCents(900));
// price hala 5000, reservation hala 5000, receipt hala 5000
// withVat = 5900 (yeni nesne)
```

**Icsel Aritmetik Neden Onemli:**

Disarida para islemini duz sayiyla yaparsan 3 farkli bug olusabilir:

```typescript
// Bug 1: Float hesaplama
const total = 19.99 * 3;  // 59.97000000000001

// Bug 2: Farkli para birimi toplama
const x = tryPrice + usdPrice;  // TRY + USD toplandi!

// Bug 3: Negatif sonuc
const r = 100 - 500;  // -400 cent — negatif para
```

Money sinifi icinde bunlarin hepsi engellenir: `add()` para birimi kontrol eder, `subtract()` negatifi reddeder, `multiply()` Math.round ile yuvarlar.

**Value Object Neden Immutable:**

Zorunluluk degil, tercih. Ama asil sebep teknik: Value Object cok yerde paylasilir (heap'de tek adres, birden fazla degisken ayni kutuyu gosterir). Mutable olsaydi birinin degisikligi herkesi etkilerdi. Entity icin sorun degil — cunku entity tek bir istekte kullanilir, paylasim yok.

```
Heap bellekte:

// MUTABLE — tek kutu, herkes gosteriyor
price ──────→ [5000, TRY]  ← uc degisken AYNI adresi gosteriyor
reservation ─→
receipt ─────→

// price.amount = 5900 → kutu degisti → herkesinki 5900

// IMMUTABLE — eski kutu kalir, yeni kutu olusur
price ──────→ [5000, TRY]  ← degismedi
reservation ─→
receipt ─────→
withVat ────→ [5900, TRY]  ← YENI kutu
```

**Immutability Nasil Garanti Edilir — `readonly`:**

Heap'deki kutuyu kimsenin degistirememesi icin alanlar `readonly` isaretlenir:

```typescript
private constructor(
  private readonly _amountInCents: number,   // readonly = yazilamaz
  private readonly _currency: string,        // readonly = yazilamaz
) { }

// Disaridan VEYA iceriden degistirmeye calismak:
this._amountInCents = 5900;  // ❌ DERLEME HATASI — readonly
```

C#'ta `record` kullanilir (otomatik immutable). Java'da `record` kullanilir (otomatik immutable). TypeScript'te `readonly` elle yazilir.

**Value Object ile Schema'nin Iliskisi:**

Schema (Zod) ve Value Object farkli katmanlarda farkli seyleri kontrol eder:

- **Schema:** "Disaridan gelen deger teknik olarak gecerli mi?" — HTTP body'den gelen `priceInCents` bir sayi mi, string mi?
- **Value Object:** "Bu deger is kurali olarak gecerli mi?" — sayi geldi ama negatif mi, ondalikli mi, para birimi bos mu?

Schema'dan gecen veri hala gecersiz olabilir — schema tipi kontrol eder, Value Object anlami kontrol eder. Ornegin schema `priceInCents: z.number()` ile sayiyi gecirdi ama deger -500 olabilir. Money.fromCents(-500) bunu yakalar.

**Value Object Kurallarini Nasil Belirleriz — 3 Soru:**

1. **"Bu deger tek basina gecerli mi?"** — Her "Hayir" cevabi constructor'da bir invariant olur.
   - Negatif olabilir mi? Hayir → kural. Ondalikli olabilir mi? Hayir → kural. Sifir olabilir mi? Evet → kural yok.

2. **"Bu deger uzerinde hangi islemler yapilir?"** — Her islemin kendi kurali var.
   - Toplama → farkli birim toplanamaz. Cikarma → negatif sonuc olamaz. Carpma → integer yuvarla.

3. **"Bu degerin esitligi neye gore?"** — Tum alanlarin esitligi.
   - 100 TRY === 100 TRY (miktar + birim ayni). 100 TRY !== 100 USD (birim farkli).

**Neden Ekstra Nesne Uretelim — Duz Sayi Yetmez mi?**

Tek basina calisirken fark etmez. 5+ kisilik projede hayat kurtarir. 50 dosyada 50 gelistirici para hesapliyor — biri float bug yaratir, biri negatif kontrolu unutur, biri farkli para birimini toplar. Money sinifi ile kural bir yerde yazilir, 50 yerde korunur. Ayrica tip guvenligi: `Money ≠ number` — userId'yi yanlislikla para miktari olarak gonderemezsin.

**Value Object Ne Icin Kullanilir:**

Ayni turden deger sistemde cok kez geciyorsa ve bu degerin kurallari varsa → Value Object yap. Projede yuzlerce yerde para degeri var (reservation.totalPrice, seatHold.price, payment.amount, refund.amount...). Hepsi ayni sey, hepsinin ayni kurallari var. Bir kez yaz, her yerde kullan.

### 2.2 Entity

**Tanim:** Kimligi olan nesne. Iki Reservation farkli ID'ye sahipse farklidir — tum alanlari ayni olsa bile. Value Object'te esitlik = icerik, Entity'de esitlik = ID.

**Entity Olmak Icin ID Zorunlu mu?** Evet, zorunlu. ID olmadan iki nesnenin ayni mi farkli mi oldugunu bilemezsin. Ama ID'nin illa UUID olmasi gerekmiyor — sayi (autoincrement), dogal anahtar (TC kimlik, ISBN), birlesik anahtar (eventId + section + row + seat) olabilir. Onemli olan benzersiz ve degismez olmasi.

**Bir Seyin Entity Olup Olmadigini Belirlemek Icin 3 Soru:**

1. **Kimligi var mi?** — Ayni ozelliklere sahip ikisini ayirt etmen gerekiyor mu? Iki "Ahmet Yilmaz" farkli kisiler mi?
2. **Zaman icinde degisiyor mu?** — Durumu, statusu degisir mi? Reservation: PENDING → CONFIRMED.
3. **Yasam dongusu var mi?** — Olusturulur, yasar, sonlanir mi?

Uce de evet → Entity. Herhangi birine hayir → muhtemelen Value Object.

**Entity Event Storming Post-it'lerine Karsilik Gelir mi?**

Hayir. Sari post-it Actor (musteri, organizator). Entity post-it'lere dogrudan eslenmez — Entity, mavi command'lari "kimin aldigi" sorusunun cevabidir. "Koltuk Sec" command'ini kim aliyor? → Reservation. O bir entity.

**Her Entity Icin Bir Aggregate Root Gerekli mi?**

Hayir. Bir entity 3 sekilde var olabilir:

1. **Kendi basina aggregate root** — en yaygin. Cogu entity ayni zamanda kendi kumesinin root'u. Projede User, Venue, Reservation hep boyle.
2. **Bir root'un icinde** — OrderLine gibi. Kendi ID'si var ama disariya acilmiyor, root uzerinden yonetiliyor. Sadece root ile tutarlilik bagimliligi varsa yapilir.
3. **Bagimsiz, root degil, baska root icinde de degil** — teoride mumkun ama pratikte anlamsiz. Kurallarini kim koruyacak?

Ic entity ne zaman yapilir: root olmadan bu entity'nin degismesi tutarsizliga yol acarsa. OrderLine tek basina SHIPPED olursa, Order'in toplam durumunu kim guncelleyecek? Order bilmeli — o yuzden OrderLine, Order'in icinde.

Bagimsiz root ne zaman yapilir: entity kendi basina yasamini surdurebiliyorsa, baska entity'nin durumuyla bagimliligi yoksa. User, Event, Venue hep bagimsiz — birinin durumu degisince digerinin tutarliligi bozulmuyor.

### 2.3 Aggregate Root (Kume Koku / Koruyucu Kapi)

**Tanim:** Birlikte degismesi gereken nesnelerin kumesini tek noktadan yoneten, disariya tek giris noktasi olan, her durum degisikliginde kurallarini kontrol eden, icindeki tum nesnelerin tutarliligini garanti eden entity.

**Metafor:** Islem makinesi. Fabrikadaki CNC tezgahi gibi:

1. **Makineyi ac** — DB'den yukle (`fromPersistence()`)
2. **Hammaddeyi tak** — komutu cagir (`confirmPayment(paymentId)`)
3. **Makine islemi yapar** — Guard (kural kontrol) → Mutate (durum degistir) → Version++ (sayac artir) → Event (rapor yaz)
4. **Urunu al, kapat** — DB'ye kaydet (`repository.save()`), bellek serbest

Makine surekli acik durmaz — is bitince kapanir, bellekten silinir. Sonraki istek geldiginde tekrar acilir. Her HTTP istegi = makineyi ac, islemi yap, kapat. Makine sifirdan kurulmaz — son durumundan acilir (version, status, confirmedAt hepsi DB'den gelir).

**Neden "Kume" Denir — Neyin Kumesi?**

Birlikte degismesi gereken nesnelerin kumesi:

```
Reservation (root)
├── SeatHold (koltuk 1)     ← reservation ile birlikte olusur
├── SeatHold (koltuk 2)     ← reservation ile birlikte olusur
└── Money totalPrice        ← seathold'lardan hesaplanir
```

Bir SeatHold eklenirse totalPrice degismeli. Reservation iptal edilirse tum SeatHold'lar serbest kalmali. Birini degistirip digerini degistirmezsen tutarsizlik olusur. Kume siniri: "birini degistirdigimde hangilerinin de ayni anda degismesi zorunlu?"

**Value Object ile Farki:**

| Ozellik | Value Object | Aggregate Root |
|---------|-------------|----------------|
| Ne korur | Deger (100 TL hep 100 TL) | Yasam dongusu (PENDING → CONFIRMED) |
| Metafor | Olcum aleti (cetvel) | Islem makinesi (CNC tezgah) |
| Mutable mi | Hayir (immutable) | Evet (mutable) |
| Kurallar ne zaman | Olusturma aninda (bir kez) | Her durum degisikliginde (tekrar tekrar) |
| Basarisizlikta | Nesne olusturulamaz | Islem reddedilir ama nesne yasiyordur |
| Karar testi | "Zaman icinde degisir mi?" → Hayir | "Zaman icinde degisir mi?" → Evet |

**Entity ile Farki:**

Her Aggregate Root bir Entity'dir, ama her Entity bir Aggregate Root degildir. Entity: ID'si var, durumu degisir. Aggregate Root: Entity + icinde baska nesneler var + tek giris noktasi. Tek entity'li basit durumlarda (projemiz gibi) ikisi ustuste biner.

Bir aggregate root birden fazla entity yonetebilir:

```
Order (Aggregate Root)
├── OrderLine (Entity — ID'si var, ADDED → SHIPPED → RETURNED)
├── OrderLine (Entity)
├── ShippingAddress (Value Object)
└── Money totalPrice (Value Object)
```

Disaridan `orderLine.ship()` cagirilamaz — `order.shipLine(lineId)` ile root uzerinden yapilir. Tek bir line gonderildiginde toplam siparis durumunu da guncellemek gerekir — bu karari OrderLine veremez, Root verir.

**"Tek Giris Noktasi" Ne Demek:**

Icindeki nesnelere disaridan dogrudan erisim yok demek. Command sayisi ile ilgisi yok. Apartman metaforu: tek ana kapi (root), birden fazla zil butonu (command'lar). Kac zil olursa olsun hepsi ayni kapidan gecer — kimse dairenin penceresinden giremez.

```typescript
// ❌ Disaridan iceri erisim (pencereden girmek)
reservation.seatHolds[0].status = 'RELEASED';

// ✅ Root uzerinden (ana kapidan girmek)
reservation.cancel();  // root icerde SeatHold'lari kendisi yonetir
```

**Root'un Iceri ve Disari Kapilari:**

Iceri acilan: `create()` (dogum), `fromPersistence()` (canlandirma), command metodlari (islem).
Disari acilan: `pullDomainEvents()` (event'ler), `toPersistence()` (DB kayit), getter'lar (okuma).

Iceri kapi sayisi = gercek dunyada yapilabilecek islem sayisi. Disari kapi sayisi = veriyi tuketecek taraf sayisi (DB, event bus, response).

**Root Siserse (15+ Command):**

5-7 command ideal. 10'u gecince bolmeyi dusun. 15 olursa kesinlikle bol. Her command icin sor: "Bu gercekten bu root'un durum gecisi mi yoksa ayri bir yasam dongusu mu?" Iade → RefundRequest (ayri root), Transfer → TransferRequest (ayri root), Insurance → InsurancePolicy (ayri root).

**Her Command Farkli Kurallar Kontrol Eder:**

```typescript
confirmPayment() → PENDING mi? + hold doldu mu?           (2 guard)
cancel()         → EXPIRED mi? + CANCELLED mi? + 48 saat? (3 guard)
expire()         → PENDING mi?                             (1 guard, throw degil return)
```

Sablon ayni (Guard → Mutate → Version → Event), guard icerigi farkli. expire()'da throw yerine return kullanilir cunku confirm + expire ayni anda calisabilir (BullMQ + HTTP) — confirm kazandiysa expire sessizce donmeli.

**Root'un 8 Ic Bolumu:**

1. Ozel alanlar (state — private)
2. Private constructor (disaridan new yapilamasin)
3. Factory metodlar (create + fromPersistence)
4. Command metodlar (Guard → Mutate → Version → Event)
5. Query metodlar (isPending, isExpired, hoursUntilEvent)
6. Getter'lar (ReadonlyArray doner)
7. Cikis metodlari (pullDomainEvents, toPersistence)
8. Private yardimcilar (recalculateTotal, findLineOrThrow)

Root'ta olmamasi gerekenler: DB erisimi, dis servis cagrisi, HTTP bilgisi, log.

**Icindeki Value Object ve Entity'ler Nerede Olusturuluyor:**

Ilk yaratilmada service parcalari olusturup root'a verir (`SeatHold.create()`, `Money.fromCents()` → `Reservation.create()` icine). DB'den canlandirmada repository DB satirlarini cevirip root'a verir (`SeatHold.fromPersistence()` → `Reservation.fromPersistence()` icine). Fark: create()'te kurallar kontrol edilir, fromPersistence()'ta edilmez.

### 2.4 Domain Event

**Tanim:** Gecmiste olan onemli bir sey. "ReservationConfirmed" — gecmis zaman, degistirilemez, sadece kaydedilir. Event Storming'deki turuncu post-it'e karsilik gelir.

Root event'leri kendi icinde biriktirir (`this._domainEvents.push(...)`) ama disariya gondermez — cunku root disariyi bilmez (event bus, BullMQ bilmez). Service event'leri root'tan cikarir (`pullDomainEvents()`) ve yayinlar (`asyncEventBus.emit()`). Root sadece "su oldu" der, "kime soylenecek" karari service'in isi.

### 2.5 Domain Service

**Tanim:** Birden fazla aggregate'e ait olan veya tek bir entity'ye sigdirilamayan is kurali. Stateless — yasam dongusu yok, cagir, hesapla, don, biter. Root'tan bile kisa omurlu.

**Application Service ile Farki:**

| | Application Service | Domain Service |
|---|---|---|
| Ne bilir | DB, Redis, kuyruk, dis servis | Sadece domain nesneleri |
| Ne yapar | Orkestrasyon: yukle → isle → kaydet | Kural isletir |
| Infra bilir mi | Evet | Hayir |

**Yasam Suresi:**

Root'tan bile kisa. Root en azindan DB'den yuklenip kaydedilirken bellekte bekler (~15ms). Domain Service hicbir sey beklemez — cagir, hesapla, don:

```
Root:            olustur → bekle → isle → bekle → kaydet → ol    (15ms)
Domain Service:  cagir → hesapla → don                            (0.01ms)
```

**Root'lar Onceden Calistirilmak Zorunda mi?**

Hayir. Domain Service root'lari yuklemez — cunku DB bilmez. Application service her seyi orkestre eder:

```typescript
// Application Service orkestrator — herkesi cagiran
async transferSeat(fromResId, toResId, seatId) {
  // 1. Iki root'u DB'den canlandir (APP SERVICE yapar)
  const fromRes = await repository.findById(fromResId);
  const toRes = await repository.findById(toResId);

  // 2. Domain Service'i cagir — sadece parametrelerle kural islet
  const canTransfer = transferPolicy.canTransfer(fromRes, toRes, seatId);
  //                  ↑ DB bilmez, root'lari yuklemez, sadece "olabilir mi?" cevaplar

  if (!canTransfer) throw new Error('Transfer kurallari uygun degil');

  // 3. Root'larin command'larini cagir (APP SERVICE yapar)
  fromRes.removeSeat(seatId);
  toRes.addSeat(seatId);

  // 4. Kaydet (APP SERVICE yapar)
  await repository.save(fromRes);
  await repository.save(toRes);
}
```

Domain Service bir **danismandir** — ofisi yok, masasi yok, state'i yok. Sorarsin, cevap verir, gider.

Projede gercek bir Domain Service yok ve bu sorun degil. Domain Service en nadir kullanilan DDD yapi tasidir. Ayni kural birden fazla yerde tekrarlaninca cikarilir — "belki lazim olur" diye degil.

---

## Bolum 3: Root'un Yasam Dongusu — Canlanma, Islem, Olum

### 3.1 Root Bellekte Nasil Yasar?

Her HTTP isteginde: DB'den yuklenip canlandirilir → islem yapar → DB'ye kaydedilir → bellekten silinir (GC temizler). Surekli yasamaz. Neden? Binlerce istegi ayni anda karsilamak gerekir, 10.000 nesneyi bellekte tutmak RAM sorunu ve tutarlilik sorunu yaratir.

### 3.2 Tam Akis: POST /bookings/:id/confirm

| Adim | Dosya | Katman | Ne Yapar | Sure |
|------|-------|--------|----------|------|
| 1 | booking.routes.ts:36 | Presentation | HTTP parse, Zod validation, service'e ilet | ~0.5ms |
| 2 | booking.service.ts:199 | Application | Orkestrasyon basla, userId kontrol | ~0.01ms |
| 3 | booking.repository.ts:93 | Persistence | DB'den SQL ile oku, satirlari SeatHold/Money nesnelerine cevir, Reservation.fromPersistence() ile root canlandir | ~8ms |
| 4 | reservation.entity.ts:153 | Domain | Guard (PENDING mi? Hold doldu mu?) → Mutate (status=CONFIRMED) → Version++ → Event biraktir | ~0.01ms |
| 5 | booking.service.ts:211 | Application | Kaydetmeyi tetikle | ~0.01ms |
| 6 | booking.repository.ts:66 | Persistence | DB'ye yaz: UPDATE ... WHERE id=:id AND version=1, 0 satir etkilendiyse ConflictError | ~6ms |
| 7 | booking.service.ts:216 | Application | pullDomainEvents() ile event'leri root'tan cek, asyncEventBus.emit() ile yayinla, root olur (GC temizler) | ~1ms |

**Toplam:** ~15ms. Zamanin %93'u (adim 3 + 6) DB'ye gidip gelme. Root'un kendi isi (adim 4) toplam surenin %0.07'si.

### 3.3 Kim Ne Yapar?

- **Route:** Kapici — istegi parse et, service'e ilet. Is kurali bilmez.
- **Service:** Orkestrator — "simdi yukle", "simdi kaydet" komutlarini verir. Siralamayi bilir, kurali bilmez.
- **Repository:** Cevirmen — DB satirlarini domain nesnelerine donusturur. Root burada canlanir (`fromPersistence()`). Root burada DB'ye yazilir (`toPersistence()`).
- **Entity (Root):** Is kurali motoru — guard kontrol, durum degistir, event biraktir. DB bilmez, HTTP bilmez.
- **Event Bus:** Duyurucu — root'tan cikan event'leri baska modullere iletir.

### 3.4 Root'un Bellekteki Boyutu

Bir Reservation nesnesi bellekte ~500 byte:

```
id: string          →  36 byte (UUID)
userId: string      →  36 byte
status: string      →  9 byte ("CONFIRMED")
version: number     →  8 byte
expiresAt: Date     →  8 byte
3x SeatHold         →  ~300 byte
1x Money            →  16 byte
domainEvents: []    →  64 byte (bos dizi)
─────────────────────────────
Toplam              →  ~500 byte
```

Ayni anda 10.000 istek gelse: 10.000 × 500 byte = 5 MB. Sunucunun 8 GB RAM'inde hicbir sey. Bellek sorunu degil.

### 3.5 Root'un Bellekteki Yasam Suresi — Zamanin %98'i Bekleme

Root canlandiginda DB'den veri cekilene kadar bellekte yer kapliyor — bu dogru. Ama miktari ve suresi cok kucuk. Asil yavaslik root'un bellekte yer kaplamasindan degil, DB'ye gidip gelme suresinden.

```
0ms        root olusturuldu (fromPersistence cagrildi)
0.1ms      nesne bellekte hazir (500 byte)
           ... DB sorgusunu bekliyor ...     ← zamanin %90'i
           ... ag gecikme ...
8ms        DB'den veri geldi
8.1ms      guard kontrol + mutate + version++ (nanosaniyeler)
           ... DB'ye yazmayi bekliyor ...    ← zamanin %90'i
           ... ag gecikme ...
15ms       DB'ye yazildi
15.01ms    nesne oldu (GC temizler)
```

Root'un kendi isi (canlanma, kural kontrol, durum degistirme) toplam 0.2ms. DB'ye gidip gelme toplam ~15ms. Root zamaninin **%98'ini bekleyerek** geciyor. Root hafif bir zarftir — icindeki is ucuz, zarfi postalama pahali.

### 3.6 Root'u Ozel Yapan Sey Sadece Durum Degistirmesi mi?

Hayir. Entity de durum degistirir (ID'si var, mutable). Root'u ozel yapan durum degistirmesi degil, **uc seyin birlikte olmasi:**

1. **Tek giris noktasi** — icindeki nesnelere disaridan sadece root uzerinden erisim
2. **Kume yonetimi** — icindeki nesnelerin tutarliligini koordine eder (SeatHold eklenince totalPrice degisir)
3. **Yasam dongusu** — DB'den yukle, islet, geri kaydet (islem makinesi)

Entity de durum degistirir ama root'un izni olmadan degistiremez. Root = makine, Entity = makinenin icindeki motor. Motor kendi basina donebilir ama makine acmadan donduremezsin.

### 3.7 Aggregate Root'un Kesin Tanimi

**"Birlikte degismesi gereken nesnelerin kumesini tek noktadan yoneten, disariya tek giris noktasi olan, her durum degisikliginde kurallarini kontrol eden, icindeki tum nesnelerin tutarliligini garanti eden entity."**

---

## Bolum 4: Durum Gecisleri ve Optimistic Concurrency

### 4.1 State Machine

Reservation'in durum gecis diyagrami:

```
PENDING ──confirmPayment()──→ CONFIRMED
PENDING ──expire()──────────→ EXPIRED
PENDING ──cancel()──────────→ CANCELLED
CONFIRMED ──cancel()────────→ CANCELLED (48+ saat kurali)

YASAK GECISLER:
EXPIRED → CONFIRMED ❌
CANCELLED → herhangi sey ❌
CONFIRMED → EXPIRED ❌
```

Her ok bir command metodu. Her metodun icindeki guard yasak gecisleri engeller.

### 4.2 3 Tur Kural

| Tur | Soru | Ornek |
|-----|------|-------|
| Gecis kurali | "Bu durumdayken su duruma gecebilir mi?" | EXPIRED → CONFIRMED yasak |
| Is kurali | "Gecise izin verilse bile ek kosullar saglanmali mi?" | CONFIRMED → CANCELLED izinli AMA 48+ saat |
| Zaman kurali | "Islem zamani uygun mu?" | PENDING → CONFIRMED izinli AMA hold suresi dolmamis |

### 4.3 Optimistic Concurrency (Version)

Iki HTTP istegi ayni anda ayni reservation'i degistirmeye calisirsa:

```sql
-- Istek A: confirm (version 1 → 2)
UPDATE SET status='CONFIRMED', version=2 WHERE id=:id AND version=1
-- 1 satir etkilendi → basarili

-- Istek B: cancel (version hala 1 bekliyor)
UPDATE SET status='CANCELLED', version=2 WHERE id=:id AND version=1
-- 0 satir etkilendi → baskasi araya girdi → ConflictError
```

Version olmadan ikisi de basarili olurdu → para alindi ama rezervasyon iptal.

---

## Bolum 4.5: Factory Method ve Diger Pattern'ler

### Factory Method Nedir?

**Tanim:** Ayni nesneyi farkli kurallara gore olusturmak gerektiginde, olusturma mantigini ayri metodlara ayirma teknigi.

Tek olusturma yolu varsa ve kurallar hep ayniysa factory'e gerek yok — constructor yeterli. Factory, ayni nesneyi farkli kurallarla olusturman gerektiginde ortaya cikar.

### Constructor Neden Private?

Nesnenin gecersiz sekilde olusturulmasini engellemek icin — ama asil sebep daha derin. Iki farkli olusturma yolunun farkli kurallari var:

- `create()`: Yeni nesne — tum kurallar kontrol edilir (expiresAt gecmiste olamaz, status PENDING olmali)
- `fromPersistence()`: DB'den yukleme — kural kontrol edilmez (status CONFIRMED olabilir, expiresAt gecmiste olabilir)

Constructor'a kural yazarsan `fromPersistence()` patlar — cunku DB'den gelen gecerli veriyi reddeder. Constructor'dan kural cikarirsan public yapmanin anlami kalmaz. Bu yuzden constructor bos ve private, kurallar factory'lerde.

Constructor public olsaydi ucuncu bir yol olurdu: `new Reservation({...})` — factory'lerin kurallarini atlayarak nesne olusturma. Private olunca derleyici bunu engeller. Insanlarin disiplinine degil derleyicinin zorlamasina guven.

### Constructor Icine Kural Yazsak fromPersistence Neden Patlar?

```typescript
public constructor(props) {
  if (props.expiresAt <= new Date()) throw new Error('Gecmis tarih');
  if (props.status !== 'PENDING') throw new Error('PENDING olmali');
}

// DB'den gelen veri:
{ status: 'CONFIRMED', expiresAt: '2026-04-08' }  // 3 gun once onaylanmis, suresi gecmis

fromPersistence(props) {
  return new Reservation(props);  // ❌ PATLADI!
  // Constructor: "PENDING olmali" → ama CONFIRMED
  // Constructor: "Gecmis tarih" → ama zaten gecmis olan kayit
}
```

Constructor yeni olusturma ile mevcut yuklemeyi ayirt edemiyor. Iki farkli duruma ayni kurali uyguluyor.

### 5 Farkli Olusturma Yolu (E-ticaret Siparis Ornegi)

Ayni `Order` nesnesi 5 farkli yoldan farkli kurallarla olusturuluyor:

| Factory | Sepet bos? | Adres? | Status | Ozel kural |
|---|---|---|---|---|
| `createFromCart()` | Yasak | Zorunlu | DRAFT | Max 50 urun, toplam > 0 |
| `createByAdmin()` | Serbest | Opsiyonel | CONFIRMED | Admin ID zorunlu, sinir yok |
| `reorder()` | Filtrelenir | Onceki veya yeni | DRAFT | Onceki siparis tamamlanmis olmali, discontinued cikarilir |
| `fromExternalPlatform()` | Yasak | Zorunlu | CONFIRMED | externalId zorunlu, customerId null olabilir |
| `fromPersistence()` | Herhangi | Herhangi | Herhangi | Kural yok |

5 farkli yol, 5 farkli kural seti. Constructor bunlari ayirt edemez. Detayli Java kodu: `docs/factory-method-example.java`

### DDD Icinde Kullanilan Diger Pattern'ler

| Pattern | Nerede | Projemizde |
|---|---|---|
| Factory Method | Entity/VO olusturma | `Reservation.create()`, `Money.fromCents()` |
| Singleton | Altyapi nesneleri | `prisma`, `syncEventBus`, `redisClient` |
| Builder | Cok parametreli entity olusturma | Yok — parametre az |
| Repository | DB erisimini soyutlama | `bookingRepository` |
| Strategy | Farkli algoritmalari degistirebilme | `PaymentGateway` port'u (Stripe/Mock) |
| Specification | Is kurallarini ayri sinifa cikarma | Yok — kurallar tek yerde |

### Specification Pattern

Bir is kuralini ayri bir nesne olarak tanimlamak. Ayni kural birden fazla yerde kullaniliyorsa cikarilir:

```typescript
// Kural BIR KEZ yazilir
class CancellationSpec {
  isSatisfiedBy(reservation): boolean {
    if (reservation.status === 'EXPIRED') return false;
    if (reservation.status === 'CANCELLED') return false;
    if (reservation.status === 'CONFIRMED' && reservation.hoursUntilEvent() < 48) return false;
    return true;
  }
}

// 3 yerde ayni nesne kullanilir:
// 1. Entity: if (!canCancel.isSatisfiedBy(this)) throw...
// 2. Admin panel: canShowCancelButton = canCancel.isSatisfiedBy(reservation)
// 3. Rapor: reservations.filter(r => canCancel.isSatisfiedBy(r))
```

Specification'lar `and()`, `or()`, `not()` ile birlestirilebilir: `new IsActive().and(new BelongsToUser(id)).and(new IsExpiringSoon().not())`. Kural 1-2 yerde → entity'de kalsin. 3+ yerde → Specification cikar. Projemizde gereksiz — kurallar hep tek yerde.

---

## Bolum 5: Katman Degisiklikleri ve Open/Closed

### 5.1 Degisiklik Turu → Hangi Katmanlar Degisir

| Degisiklik | Dokunan katmanlar | Dosya sayisi |
|-----------|-------------------|-------------|
| Yeni is kurali (48 saat → 72 saat) | Sadece domain | 1 |
| Mevcut komuta ek guard | Sadece domain | 1 |
| Response'a yeni alan | Sadece service | 1 |
| Validasyon degistirme (max 6 → 10) | Sadece schema (veya constants) | 1 |
| Yeni DB alani (changedAt) | Domain + repository + migration | 3 |
| Yeni command (changeSeat) | Domain + service + route + schema | 4 |

Is kurallarindaki degisikliklerin cogu sadece domain katmaninda kalir — katmanli mimarinin asil faydasi bu.

### 5.2 Open/Closed Prensibi

"Dosyayi acma" degil, "mevcut davranisi bozma" demek. `changeSeat()` ekliyorsun: reservation.entity.ts dosyasini acip yeni metod ekliyorsun. Mevcut confirmPayment(), cancel(), expire() metodlarina dokunmuyorsun. Dosya degisti ama mevcut davranis bozulmadi.

Yeni dosya gerektiren durum: davranisi disaridan degistirilebilir kilmak istediginde. Payments modulunde yeni odeme saglayici eklemek icin hicbir mevcut dosya degismez — yeni adapter dosyasi eklenir. Bu Open/Closed'in ders kitabindaki ornegi. Ama bu pattern sadece birden fazla implementasyon oldugunda anlamli.

Entity'ye metod eklemek = dosyayi degistirmek, ama mevcut davranisi bozmamak = yeterli.

---

## Bolum 6: Schema, Repository, Dependency Injection

### 6.1 Schema Neden Gerekli

Disaridan gelen veriyi sisteme girmeden once kontrol eder. Iki tur schema var:

| | Input Schema (Zod) | DB Schema (Prisma) |
|---|---|---|
| Ne kontrol eder | HTTP body gecerli mi — tip, format, uzunluk | Tablo yapisi, tipler, iliskiler |
| Nerede calisir | Route'ta, DB'den once | DB seviyesinde, migration'da |
| Olmasa ne olur | Gecersiz veri entity'ye ulasir | Tablo olusturulamaz |

Schema kapidaki guvenlik gorevlisi (kimlige bakar, silah taramasi yapar), entity icerideki mudur ("bu islem yapilabilir mi" kararini verir). Ikisi farkli seyleri farkli yerlerde kontrol eder.

### 6.2 toPersistence() ile Prisma Donusumu Nerede Olur

Repository'de. Entity `toPersistence()` ile kendini duz objeye cevirir (Money → number, Date → nullable). Repository bu duz objeyi `prisma.reservation.create()` veya `updateMany()`'ye verir. Prisma SQL'e cevirir. Ters yon de ayni yerde: DB'den okurken repository satirlari `fromPersistence()` ile domain nesnelerine cevirir.

### 6.3 Repository Interface Kullanildiginda

Service interface'i bilir, somut sinifi bilmez. Hangi DB kullanilacagi uygulamanin baslangic noktasinda (composition root / main.ts) belirlenir:

```typescript
const repository = new PrismaBookingRepository();    // BURADA karar verilir
const service = new BookingService(repository);       // service habersiz

// Yarin degistirmek icin:
const repository = new MongoBookingRepository();      // sadece bu satir degisir
const service = new BookingService(repository);       // service AYNI
```

Projede bu yapi yok — dogrudan import ile bagli. main.ts sadece uygulamayi baslatir ve kapatir, hicbir bagima isi yapmaz.

### 6.4 Dependency Injection Container

Nesnelerin birbirine baglanma isini merkezi bir yerden yoneten sistem. Sen "BookingService'e bir repository lazim" dersin, container "sana PrismaBookingRepository veriyorum" der. Buyuk projelerde 50+ servis bagimliligini otomatik cozer.

Projede yok — 8 modul icin dogrudan import yeterli. Java/C#'ta standart (Spring, .NET DI) cunku dil yapisi gerektiriyor. Node.js'te kucuk-orta projelerde genelde kullanilmaz.

---

## Bolum 7: Sistem Arizalari (Projemiz Uzerinden)

### 7.1 Cascading Failure (Domino Etkisi)

**Senaryo:** Stripe API normalde 200ms, simdi 30 saniye yanit veriyor.

**Ne olur:**
1. 20 kullanici odeme yapiyor → 20 istek Stripe'i bekliyor
2. Her biri bir DB connection tutuyor (baglanti serbest birakilmadi)
3. DB connection pool doldu (20/20 mesgul)
4. Koltuk secme istegi geliyor — Stripe ile ilgisi yok ama DB connection yok
5. Etkinlik listeleme, health check — hepsi durdu
6. Load balancer "sunucu oldu" diyor → trafik baska sunucuya → o da doluyor
7. TUM SISTEM DURDU — cunku Stripe yavasladi

**Tukenen kaynak:** Zaman (bellek degil!). 20 baglanti = ~1 MB bellek — sorun degil. Ama 30 saniye boyunca mesgul.

**Onlem:** Circuit breaker — 5 hata ustuste olunca Stripe'a istek gondermeyi keser, aninda hata doner.

### 7.2 Memory Yetersizligi (OOM)

**Senaryo:** Organizator "50.000 koltugum raporunu" istiyor. 20 organizator ayni anda.

**Ne olur:** 20 × 50.000 × ~500 byte = 500 MB. Node.js heap 1.5 GB. GC surekli calisiyor ama yer acilmiyor → "JavaScript heap out of memory" → process oldu.

**Onlem:** Pagination — 50.000'i tek seferde cekme, 50'ser cek.

### 7.3 Deadlock (Kilitlenme)

**Senaryo:** Kullanici A koltuk 15 + 16 istiyor, B koltuk 16 + 15 istiyor (ters sira).

**Ne olur:** A 16'yi bekliyor, B 15'i bekliyor → ikisi de sonsuza kadar bekler.

**Onlem:** Kilitleri her zaman ayni sirada al (`seats.sort()` sonra kilitle). TTL (30sn otomatik dusme).

### 7.4 Stale Read (Bayat Okuma)

**Senaryo:** Primary-replica DB, replica 2 saniye geride. Kullanici koltuk seciyor (primary'ye yazildi), sayfayi yeniliyor (replica'dan okunuyor).

**Ne olur:** 404 Not Found — "biletim kayboldu!"

**Onlem:** Yazma yapan kullanici kisa sure icerisinde primary'den okusun.

### 7.5 Connection Pool Nedir

DB'ye baglanmak pahali (~50ms). Her istekte yeni baglanti acip kapatmak yavas. Pool onceden acilmis baglantilari havuzda hazir tutar — istek gelince ver, bitince geri al. Oteldeki oda anahtarlari gibi: musteri gelince anahtar ver, cikinca geri al. 21. musteri gelince "bos oda yok, bekleyin."

**DB'ye Baglanmak = Diske Baglanmak Degil:**

DB'ye baglanmak baska bir **programa ag uzerinden** baglanmak. PostgreSQL ayri bir process, 5432 portunu dinliyor. Senin uygulamanin (Node.js) diske dokunmaz — PostgreSQL'e "su veriyi bul" der, PostgreSQL kendisi diskte arar, ag uzerinden geri gonderir.

Baglanti acma sureci:

```
1. Node.js → PostgreSQL'e SYN paketi gonder        (el uzat)
2. PostgreSQL → SYN-ACK gonder                      (el sikis kabul)
3. Node.js → ACK gonder                             (anlastik)
4. Node.js → kullanici adi + sifre gonder            (kimlik dogrulama)
5. PostgreSQL → "giris basarili"                     (kapi acildi)
6. PostgreSQL bu baglanti icin bir PROCESS ayirir    (~5-10 MB RAM)
```

Toplam ~50ms. Her istekte bunu yapmak pahali — bu yuzden pool kullanilir.

**Sinir 3 Yerden Gelir:**

1. **PostgreSQL max_connections** (varsayilan 100) — her baglanti icin bir process fork'lar, her process ~5-10 MB RAM
2. **OS file descriptor limiti** (`ulimit -n`, varsayilan 1024) — her TCP baglantisi bir file descriptor tuketir
3. **Uygulamanin pool siniri** (Prisma `connection_limit`, varsayilan 5-20) — sen koyarsinn, cunku PostgreSQL'e 100 baglantiyi sen kullanirsan baska servisler baglanamaaz

**Cascading'de Memory Neden Dolmaz:**

20 baglanti bellekte ~1 MB yer kaplar (her baglanti ~10-50 KB). Sunucunun 8 GB RAM'inde hicbir sey. Sorun bellek degil **zaman**: 20 baglanti 30'ar saniye Stripe'i bekliyorsa yeni isteklere verilecek bos baglanti yok. Metrikler (CPU, RAM, disk) normal gorunur ama sistem yanit vermiyor — en tehlikeli ariza turu bu.

| Ariza | Tukenen kaynak | Bellek dolar mi? |
|-------|---------------|-----------------|
| Cascading | Zaman | Hayir |
| OOM | Bellek | Evet |
| Deadlock | Zaman | Hayir |

---

## Bolum 8: Genel Backend Iskeleti

### 8.1 Her Sirkette Gorecegn Sablon

```
Disaridan bir sey gelir       → Route / Controller
Kim oldugu kontrol edilir      → Auth middleware (JWT)
Ne istedigi dogrulanir         → Schema validation (Zod)
Is kurallari isletilir         → Entity / Service / Domain
Bir yere kaydedilir            → Repository / ORM
Baskalarin haberi olur         → Event bus / Queue
Cevap doner                    → Response
```

Isimler degisir, yapi ayni. Fastify/Spring/Django/.NET/Go — hepsinde:

- Middleware zinciri (auth → rate limit → validation → handler)
- CRUD + is kurali (%80 endpoint)
- Kuyruk (email, rapor, resim isleme ayri worker'da)
- Config (.env veya vault)
- Health check (/health)
- Structured logging (JSON, request ID)
- Migration (DB sema degisiklikleri dosya olarak)

### 8.2 Uygulama Calisma Modelleri

| Model | Ornek | DB Erisimi | Bellekte Tutma |
|-------|-------|-----------|----------------|
| Istek-Yanit | HTTP API (projemiz, %90 web) | Her istekte | Hicbir sey |
| Surekli Baglanti | WebSocket, oyun, chat | Periyodik | Cok sey |
| Arka Plan | BullMQ worker, cron | Her mesajda | Hicbir sey |

Projemiz 1 ve 3'un karisimi: HTTP istekleri istek-yanit, BullMQ worker'lar arka plan.

### 8.3 Is Kurali Karmasiklik Seviyeleri

| Seviye | Icerik | Dokunan katman |
|--------|--------|---------------|
| 0-3 | Guard'lar, durum gecisleri | Sadece domain (1 dosya) |
| 4 | Baska modulden veri | + service (2 dosya) |
| 5 | Concurrency (lock, version) | + repository + infra (4 dosya) |
| 6 | Zamansal olaylar (delayed job) | + worker (5 dosya) |
| 7 | Yan etkiler (email, QR) | + baska moduller (7+ dosya) |
| 8 | Hata senaryolari (circuit breaker) | + koruma katmanlari (9+ dosya) |
| 9-10 | Multi-region, regulasyon | Mimari degisiklik |

Projemiz seviye 7-8 civarinda. Karmasiklik tek kuraldan degil, kurallarin birbirine bagimliliginden gelir. Kural: en icten basla, disariya dogru ilerle.

### 8.4 Banka Uygulamasi Ayni Pattern mi?

Evet. Ayni iskelet, ayni katmanlar, ayni akis. Fark yogunlukta:

| | Bizim proje | Banka |
|---|---|---|
| Guard sayisi | 4-5 | 20-30 |
| Event sayisi | 2-3 | 5-10 |
| Durum sayisi | 4 | 15+ |
| Regulasyon | KVKK | BDDK + MASAK + SPK + PCI-DSS + Basel III |

Bankada farkli olan: cift tarafli muhasebe (her islem debit + credit, toplam = 0), saga pattern (her adim icin geri alma adimi), audit trail (hicbir sey silinmez, append-only log), MASAK buyuk islem bildirimi.

Ama hepsi ayni 4 adim: Guard → Mutate → Version → Event.

### 8.5 Sablon Ayni, Degisen Ne?

Tum projeler ayni iskelet:

```
Route → Schema → Service → Repository → Entity (Guard → Mutate → Version → Event) → Repository → Event Bus → Response
```

Degisen seyler sadece icindeki detaylar:

| Sabit kalan (iskelet) | Degisen (icerik) |
|---|---|
| private constructor | Hangi alanlar var |
| create() factory | Hangi alanlar zorunlu |
| fromPersistence() factory | Hangi tablolardan yukleniyor |
| Guard → Mutate → Version → Event | Hangi kurallar, hangi durumlar, hangi event'ler |
| toPersistence() | Hangi alanlari DB'ye yaziyor |
| pullDomainEvents() | Hangi event tipleri var |
| Command metodlari | Kac tane, isimleri, kurallari |
| Getter'lar | Hangi alanlari disariya aciyor |

Bilet satiste 4 guard, bankada 30 guard. Bilet satiste 4 durum, bankada 15 durum. Bilet satiste 2 event, bankada 10 event. Ama iskeleti ayni — bir kez ogrendin mi yeni sirkette sadece isimleri ogrenirsin.

---

## Bolum 9: Domain Icinden Dis Servis Cagrilir mi?

Hayir. Domain icinde dis servis cagirmak kurali bozar — domain hicbir seyi bilmemeli.

```typescript
// ❌ YANLIS — domain icinde dis bagimliilik
transfer(from, to, amount) {
  amount = exchangeService.convert(amount, to.currency);  // domain disariyi biliyor!
}

// ✅ DOGRU — service donusumu yapar, domain sadece degeri alir
async transfer(fromId, toId, amount) {
  let finalAmount = amount;
  if (amount.currency !== to.currency) {
    finalAmount = await exchangeService.convert(amount, to.currency);  // service yapar
  }
  from.debit(amount);           // domain sadece degeri alir
  to.credit(finalAmount);       // nereden geldigini bilmez
}
```

Domain'in icinden hicbir import disari cikmaz — ne baska modul, ne DB, ne HTTP.

---

---

## Bolum 10: Event Bus — Nedir, Nasil Calisir, Neden Var?

### 10.1 EventBus Nedir?

EventBus bir framework degil. Bizim yazdigimiz basit bir class. Icinde tek bir veri yapisi var: **sozluk (dictionary/map)**.

```
handlers = {
  "reservation.confirmed": [ fonksiyon1, fonksiyon2 ],
  "reservation.expired":   [ fonksiyon3 ]
}
```

Tum isi 2 metod yapiyor:
- **on()** → sozluge fonksiyon ekle ("Bu event olursa beni cagir")
- **emit()** → sozlukteki fonksiyonlari bul ve cagir ("Bu event oldu")

### 10.2 EventBus Ne Ise Yariyor?

Tek bir isi var: **moduller birbirini tanimasin.**

EventBus olmasaydi:
```typescript
// booking.service.ts — 3 modulu TANIYOR
await notificationService.sendEmail(userId, "Onaylandi");
await ticketService.generateQR(reservationId);
await pricingService.recalculate(eventId);
```

EventBus ile:
```typescript
// booking.service.ts — kimseyi TANIMIYOR, sadece bagiriyor
await eventBus.emit("reservation.confirmed", { reservationId, userId });
```

Yeni modul eklersen? Kendi dosyanda `on()` yaz. Booking'e dokunma.

### 10.3 Fonksiyon Referansi Ne Demek?

Fonksiyon referansi = fonksiyonun kendisi degil, fonksiyonun ADRESI. Telefon rehberindeki numara gibi — insani tutmuyorsun, numarasini tutuyorsun.

```
on("reservation.confirmed", emailGonder)

EventBus emailGonder'in KODUNU tutmuyor.
Sadece "bellekte surada oturuyor" bilgisini tutuyor.
Bir KISA YOL (shortcut).
```

**Redis ile ilgisi yok.** SyncEventBus bellekte calisir, Redis'e dokunmaz bile.

### 10.4 Fonksiyonlar Ne Zaman Calisiyor?

Iki asamali:

**Asama 1 — Depolama (uygulama baslarken, BIR KEZ):**
```
pricing    → on("reservation.created", fiyatHesapla)     → sozluge ekle
notif.     → on("reservation.created", emailGonder)      → sozluge ekle
seats      → on("reservation.created", koltuklariIsaretle) → sozluge ekle

Hicbir fonksiyon calismadi. Sadece "ben buradayim" dediler.
```

**Asama 2 — Calistirma (istek gelince, HER SEFERINDE):**
```
Kullanici POST /reservations gonderdi
  → booking.service → emit("reservation.created", { ... })
    → sozluge bak → 3 fonksiyon var → ucunu de CALISTIR
```

on() kaydeder, emit() calistirir. Arada ne kadar zaman gecerse gecsin.

---

## Bolum 11: SyncEventBus vs AsyncEventBus

### 11.1 SyncEventBus — Dogrudan Fonksiyon Cagirma

```
emit("reservation.created", { id: "123" })
  → sozlukteki fonksiyonlari BUL → CAGIR → bitti

Hepsi AYNI ANDA, AYNI YERDE, AYNI PROCESS'te.
Fonksiyon referansi tutar, emit() dogrudan calistirir.
```

**Gercek anlamda asenkron iletisim degil.** Sadece kod seviyesinde ayrisma sagliyor. Dolaylı fonksiyon cagirma.

### 11.2 AsyncEventBus — Redis Uzerinden Gercek Asenkron

```
emit("reservation.confirmed", { id: "123" })
  → Redis'e VERI yaz → emit() BITTI, dondu
  → Fonksiyon CAGRILMADI. Hicbir handler calismadi.

... tamamen bagimsiz, baska yerde, baska zamanda ...

Worker (Redis'i dinliyor):
  → "Yeni job var!" → aldi → kendi fonksiyonunu calistirdi
```

**Fark:**
| | SyncEventBus | AsyncEventBus |
|---|---|---|
| Ne tutuyor? | Fonksiyon referansi | Hicbir sey (Redis'e veri yazar) |
| emit() ne yapiyor? | Fonksiyonu cagiriyor | Redis'e veri yaziyor |
| Kim calistiriyor? | emit() kendisi | Worker (ayri yerde, ayri zamanda) |
| Gercek asenkron mu? | Hayir | Evet |

---

## Bolum 12: AsyncEventBus Tam Akisi — Booking'den Notification'a

### 12.1 Uygulama Baslarken (BIR KEZ, hep ayakta)

```
asyncEventBus         → bellekte olusur, AYAKTA (olmez)
Redis baglantisi      → TCP kurulur, AYAKTA (olmez)
DB baglantisi         → TCP kurulur, AYAKTA (olmez)
HTTP sunucu           → port 3000 dinler, AYAKTA (olmez)
notification worker   → Redis'i dinler, AYAKTA (olmez)
SMTP transporter      → email gondermek icin hazir, AYAKTA (olmez)
```

### 12.2 Kullanici "Ode" Butonuna Basti

**Adim 1 — booking.service.ts satir 221:**
```typescript
await asyncEventBus.emit('notification.send', {
    type: 'BOOKING_CONFIRMED',
    recipientId: userId,
    recipientEmail: '',
    data: { reservationId, paymentId },
});
```

**Adim 2 — async-event-bus.ts satir 53-59:**
```typescript
const queue = getOrCreateQueue('notification.send');
await queue.add('notification.send', payload);
// Redis'e VERI yazdi. Fonksiyon cagirmadi. emit() BITTI.
```

**Adim 3 — Redis (ayri program, bellekte):**
```
Queue: "notification.send"
Job #1: { type: 'BOOKING_CONFIRMED', recipientId: 'user-456', ... }
Status: WAITING

★ Kullaniciya cevap dondu. "Odeme basarili!" gosterildi.
★ Booking service isini TAMAMLADI.
```

**Adim 4 — Worker UYANDI (notifications.worker.ts satir 100):**
Worker ZATEN ayaktaydi, Redis'i dinliyordu. Redis "yeni job var" dedi.

**Adim 5a — Email adresi DB'den cekilir (satir 107-117):**
```typescript
const user = await prisma.user.findUnique({ where: { id: recipientId } });
email = user.email;  // 'ahmet@gmail.com'
```

**Adim 5b — Template secilir (satir 120-126):**
```typescript
const templateFn = emailTemplates['BOOKING_CONFIRMED'];
const { subject, html } = templateFn(data);
// subject = "Your booking is confirmed! 🎫"
```

**Adim 5c — Email gonderilir (satir 129-134):**
```typescript
await transporter.sendMail({
    from: 'noreply@tickethub.com',
    to: 'ahmet@gmail.com',
    subject: 'Your booking is confirmed! 🎫',
    html: '<h1>Booking Confirmed</h1>...',
});
```

**Adim 5d — DB'ye "gonderildi" kaydi yazilir (satir 137-148):**
```typescript
await prisma.notification.create({
    data: { recipientId, channel: 'EMAIL', type: 'BOOKING_CONFIRMED', status: 'SENT' }
});
```

**Adim 6 — Job tamamlandi:**
Redis'te job durumu: WAITING → COMPLETED. Worker tekrar beklemeye dondu.

### 12.3 Neyin Ayakta Oldugu, Neyin Oldugu

| Nesne | Durum | Ne zaman? |
|---|---|---|
| Redis baglantisi | HEP AYAKTA | Uygulama boyunca |
| asyncEventBus | HEP AYAKTA | Uygulama boyunca |
| Worker | HEP AYAKTA | Uygulama boyunca |
| DB baglantisi | HEP AYAKTA | Uygulama boyunca |
| SMTP transporter | HEP AYAKTA | Uygulama boyunca |
| Reservation (Root) | DOGDU → OLDU | Istek geldi → cevap dondu |
| Job verisi | DOGDU → OLDU | Redis'e yazildi → islendi |

### 12.4 Projede Kim Dinliyor?

Su an **tek bir dinleyici** var:
```
notification.send → notification worker DINLIYOR ✓

reservation.confirmed → kimse DINLEMIYOR (worker henuz yazilmamis)
reservation.expired   → kimse DINLEMIYOR
reservation.cancelled → kimse DINLEMIYOR
```

Tamamlanmis halinde her event icin ayri worker olacak:
```
reservation.confirmed → ticket.worker (QR uret) + pricing.worker (fiyat guncelle)
reservation.expired   → seats.worker (koltuklari serbest birak)
reservation.cancelled → refund.worker (iade baslat)
notification.send     → notification.worker (email gonder) ✓
```

---

## Bolum 13: EventBus 3 Dilde Karsilastirma

### 13.1 Sozlugun Key ve Value Tipi

| | TypeScript | Java | C# |
|---|---|---|---|
| Key | `string` ("reservation.confirmed") | `Class<?>` (ReservationConfirmed.class) | `Type` (typeof(ReservationConfirmed)) |
| Value | `async (payload) => {}` | `Consumer<T>` | `Func<T, Task>` |
| Singleton | `export const = new()` | `private constructor + static INSTANCE` | `private constructor + static Instance` |
| Event tanimi | `interface EventMap` (tek yerde) | `record` (her event ayri dosya) | `record` (her event ayri dosya) |

### 13.2 Java'da emit() Satir Satir

```java
private final Map<Class<?>, List<Consumer<?>>> handlers = new HashMap<>();
// Key: herhangi bir class'in tipi (ornegin ReservationConfirmed.class)
// Value: fonksiyon listesi

public <T> void on(Class<T> eventType, Consumer<T> handler) {
    handlers.computeIfAbsent(eventType, k -> new CopyOnWriteArrayList<>())
            .add(handler);
    // "Bu key var mi? Yoksa yeni bos liste olustur. Listeye fonksiyonu ekle."
}

public <T> void emit(T event) {
    List<Consumer<?>> list = handlers.get(event.getClass());
    // event.getClass() → ReservationConfirmed.class
    // sozlukte bu key'in listesini bul
    if (list == null) return;

    for (Consumer<?> handler : list) {
        ((Consumer<T>) handler).accept(event);
        // accept() = fonksiyonu CAGIR
    }
}
```

**"Hangi event hangisi nerede belli oluyor?"** Sozluge biz onceden yazmiyoruz. `on()` cagirildikca calisma zamaninda dolduruluyor. Her modul kendi handler'ini kaydeder, birbirinden habersiz.

### 13.3 Tetiklenme Yollari

| Tetikleyen | Ornek | Kim calistiriyor |
|---|---|---|
| Kullanici (POST) | Odeme yap, rezervasyon yap | HTTP istegi |
| SyncEventBus | Stok kontrolu, koltuk kilitleme | emit() dogrudan fonksiyonu cagirir |
| AsyncEventBus | Email gonder, QR uret | Redis → Worker |
| Zamanlayici (delay) | 10 dk sonra expire | Redis delayed job → Worker |

**Buyuk adimlar** (odeme → kargo gibi) kullanici tetikler (POST).
**Yan isler** (email, QR, fiyat) event bus tetikler.

---

## Bolum 14: Java Generic — `<T>` Nedir, Neden Var, Nasil Kullanilir?

### 14.1 Generic Nedir?

Generic = "genel, turden bagimsiz." Bir class, metod veya interface'in tipini sonradan belirlemeye yarayan mekanizma.

```
Kutu<T>       → genel kutu, henuz tipi belli degil (sablon)
Kutu<String>  → artik genel degil, String'e ozgu (somut)
```

### 14.2 Neden Yapilmis?

Java 5 oncesinde (2004 oncesi) `List` her seyi kabul ediyordu ama cikarirken **cast** gerekiyordu. Cast yanlissa **calisma aninda** patliyordu:

```java
// ONCE (Java 5 oncesi) — tehlikeli
List list = new ArrayList();
list.add("hello");
list.add(123);                          // sorun yok, ikisini de kabul etti
String s = (String) list.get(1);        // 💥 PATLADI — 123 String degil
                                        // ClassCastException (calisma aninda)

// SONRA (Java 5) — guvenli
List<String> list = new ArrayList<>();
list.add("hello");
list.add(123);   // ❌ DERLEME HATASI — daha kodu calistirmadan yakaladi
```

**Ana motivasyon:** Cast hatalarini calisma aniNDAN derleme anina tasimak.

Python/JS etkisiyle degil, Java'nin kendi ic sorunu yuzunden geldi. Ilham kaynagi C++ Templates (1990) ve ML/Haskell gibi akademik diller.

### 14.3 Nasil Calisiyor?

`<T>` ile class tanimla, icindeki alanlara ve metodlara T yaz. Kullanirken tipi belirle, tum T'ler o tipe donusur:

```java
// TANIMLAMA — T henuz belli degil
class Kutu<T> {
    private T icerik;
    public void koy(T item) { this.icerik = item; }
    public T al() { return this.icerik; }
}

// KULLANIM — T = String oldu
Kutu<String> yaziKutusu = new Kutu<>();
// private String icerik;
// public void koy(String item)     → sadece String kabul eder
// public String al()               → String doner, cast gerekmez

// KULLANIM — T = Integer oldu
Kutu<Integer> sayiKutusu = new Kutu<>();
// private Integer icerik;
// public void koy(Integer item)    → sadece Integer kabul eder
// public Integer al()              → Integer doner
```

Nerede T yazdiysan, hepsi ayni anda degisir. Bul-degistir gibi.

### 14.4 Generic Olmasaydi?

Her tip icin ayri class yazmak gerekirdi:

```java
class StringKutu {
    private String icerik;
    void koy(String item) { ... }
    String al() { ... }
}

class IntegerKutu {
    private Integer icerik;
    void koy(Integer item) { ... }
    Integer al() { ... }
}

// 50 tip varsa 50 class yaz...
// Generic ile tek class yeterli: Kutu<T>
```

### 14.5 Sonradan Degistirilebilir mi?

Hayir. Bir kez tipi belirledin mi o nesne omru boyunca o tipte kalir:

```java
Kutu<String> k = new Kutu<>();
k = new Kutu<Integer>();   // ❌ DERLEME HATASI
```

Ama ayni sablondan farkli tipte **yeni nesneler** olusturabilirsin:

```java
Kutu<String>  yaziKutusu = new Kutu<>();    // bu String
Kutu<Integer> sayiKutusu = new Kutu<>();    // bu Integer
// Ikisi ayni Kutu<T> sablonundan geldi, ama birbirinden bagimsiz
```

### 14.6 Nerelerde Kullanilir?

3 yerde tanimlanir, baska yerde tanimlanamaz:

**1. Class:**
```java
class Kutu<T> {
    private T icerik;
}
Kutu<String> k = new Kutu<>();
```

**2. Metod (class'tan bagimsiz):**
```java
class Yardimci {
    public <T> void yazdir(T item) {
        System.out.println(item);
    }
}
y.yazdir("hello");   // T = String
y.yazdir(123);       // T = Integer
```

EventBus'taki emit() tam olarak bu:
```java
public <T> void emit(T event) { ... }
emit(new ReservationConfirmed(...))   // T = ReservationConfirmed
emit(new PaymentCompleted(...))       // T = PaymentCompleted
```

**3. Interface:**
```java
interface Repository<T> {
    T findById(String id);
    void save(T entity);
}

class OrderRepository implements Repository<Order> {
    Order findById(String id) { ... }   // T → Order
    void save(Order entity) { ... }     // T → Order
}
```

### 14.7 Generic Tanimlayip Kullanmazsak?

Anlamsiz. `<T>` demek "bu class'in icinde bir seyler T'ye gore degisecek" sozu vermek. Hicbir alan veya metod T kullanmiyorsa bos soz — derleyici de uyari verir.

---

## Bolum 15: AsyncEventBus — Soyutlama ve Gercek Bagimlilik

### 15.1 AsyncEventBus Redis'i Soyutluyor

AsyncEventBus buyuk bir sey degil. Redis'e veri yazmayi tek bir yerde toplayan yardimci class. Service'ler Redis'i dogrudan bilmesin diye:

```
SOYUTLAMA OLMADAN:
  booking.service.ts   → import Redis, Queue, connection, retry ayarlari
  payment.service.ts   → import Redis, Queue, connection, retry ayarlari
  pricing.service.ts   → import Redis, Queue, connection, retry ayarlari
  
  Redis → RabbitMQ'ya gecis: 3 dosyayi AC, hepsini DEGISTIR

SOYUTLAMA ILE:
  booking.service.ts   → import asyncEventBus
  payment.service.ts   → import asyncEventBus
  pricing.service.ts   → import asyncEventBus

  Redis → RabbitMQ'ya gecis: sadece asyncEventBus'un ICINI degistir
```

Soyutlama = **degisiklik maliyetini dusurmek**, cokmeyi engellemek degil.

### 15.2 Kod Seviyesi vs Calisma Zamani Bagimliligi

Service dosyasinda Redis kelimesi gecmiyor. Ama calisma zamaninda Redis'i kullaniyor:

```
KOD SEVIYESI (dosyada yazanlar):
  booking.service.ts → import asyncEventBus   ← Redis kelimesi YOK

CALISMA ZAMANI (bellekte olan):
  confirmReservation()
    → emit()
      → queue.add()
        → Redis TCP baglantisi

  Service farkinda olmadan Redis'i kullaniyor.
  Redis cokUnce de farkinda olmadan etkileniyor.
```

### 15.3 Redis Cokerse Ne Olur?

`await` ile cagirilan her sey ayni cagri zincirinde. En alttaki patlayinca hata sirayla yukari cikar:

```
Service → await emit() → await queue.add() → Redis'e TCP gonder → Redis YOK → HATA
                                                                        ↑
                                                                  HATA YUKARI CIKAR
                                                                        ↑
                                                                  queue.add() PATLADI
                                                                        ↑
                                                                  emit() PATLADI
                                                                        ↑
                                                             Service PATLADI
```

### 15.4 Gercek Bagimliliktan Kurtulma — try/catch

Hata yakalayarak "Redis cokse bile sen devam et" diyebilirsin:

```typescript
reservation.confirmPayment(paymentId);
await bookingRepository.save(reservation);        // ana is

try {
    await asyncEventBus.emit('notification.send', { ... });   // yan is
} catch (error) {
    logger.error(error, 'Event gonderilemedi');
    // Service PATLAMADI — email gitmedi ama rezervasyon tamam
}

return { status: 'CONFIRMED' };
```

```
Redis calisiyor:  rezervasyon ✅  email ✅
Redis cokmus:     rezervasyon ✅  email ❌ (ama service ayakta)
```

**DIKKAT:** Bunu her yerde yapamazsin:

```
Yan is basarisiz → devam et (try/catch UYGUN)
  Ornek: email, QR uretimi, fiyat guncelleme

Ana is basarisiz → DURMALI (try/catch YANLIS)
  Ornek: stok kontrolu, odeme alma, DB kayit
```

---

*Bu dokuman, TicketHub projesi uzerinden yapilan kapsamli DDD, mimari ve altyapi konusmalarinin ozetidir.*
*Son guncelleme: 12 Nisan 2026*
