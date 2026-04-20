/**
 * ══════════════════════════════════════════════════════════════
 * VALUE OBJECT KATALOGU — Sektorler Arasi En Yaygin Ornekler
 * ══════════════════════════════════════════════════════════════
 *
 * Her sektorde tekrar tekrar karsilasilan value object'ler.
 * Her birinde ayni sablon: private constructor, factory method,
 * self-validation, immutable, icsel islemler.
 *
 * SEKTORLER:
 * 1. Her Sektorde       — Money, Email, PhoneNumber, Address, DateRange, Percentage
 * 2. E-Ticaret          — Quantity, SKU, Weight, Dimensions
 * 3. Finans / Banka     — IBAN, CurrencyPair, InterestRate, AccountNumber
 * 4. Saglik             — BloodType, Dosage, TCKimlikNo
 * 5. Lojistik / Kargo   — TrackingNumber, GeoCoordinate, Distance
 * 6. Egitim             — Grade, StudentNumber, Semester
 * 7. Insan Kaynaklari   — Salary, WorkingHours, EmployeeId
 */

// ══════════════════════════════════════════════════════════════
// 1. HER SEKTORDE — bunlar her projede lazim
// ══════════════════════════════════════════════════════════════

/**
 * MONEY — Para
 * Nerede: HER YERDE. Fiyat, odeme, iade, maas, vergi, komisyon.
 * Neden VO: 0.1 + 0.2 = 0.30000000000000004 (float bug).
 * Kural: negatif olamaz, farkli birim toplanamaz, integer cent.
 */
export class Money {
  private constructor(
    private readonly _cents: number,
    private readonly _currency: string,
  ) {
    if (_cents < 0) throw new Error(`Negatif para: ${_cents}`);
    if (!Number.isInteger(_cents)) throw new Error(`Tam sayi olmali: ${_cents}`);
    if (!_currency || _currency.trim() === '') throw new Error('Para birimi bos');
  }

  static fromCents(cents: number, currency = 'TRY'): Money {
    return new Money(cents, currency);
  }

  static fromDecimal(amount: number, currency = 'TRY'): Money {
    return new Money(Math.round(amount * 100), currency);
  }

  static zero(currency = 'TRY'): Money {
    return new Money(0, currency);
  }

  get cents(): number {
    return this._cents;
  }
  get currency(): string {
    return this._currency;
  }

  add(other: Money): Money {
    this.assertSameCurrency(other);
    return new Money(this._cents + other._cents, this._currency);
  }

  subtract(other: Money): Money {
    this.assertSameCurrency(other);
    if (this._cents - other._cents < 0) throw new Error('Yetersiz bakiye');
    return new Money(this._cents - other._cents, this._currency);
  }

  multiply(factor: number): Money {
    return new Money(Math.round(this._cents * factor), this._currency);
  }

  isZero(): boolean {
    return this._cents === 0;
  }
  isGreaterThan(other: Money): boolean {
    this.assertSameCurrency(other);
    return this._cents > other._cents;
  }

  equals(other: Money): boolean {
    return this._cents === other._cents && this._currency === other._currency;
  }

  toDisplayString(): string {
    return `${(this._cents / 100).toFixed(2)} ${this._currency}`;
  }

  private assertSameCurrency(other: Money): void {
    if (this._currency !== other._currency)
      throw new Error(`Farkli birim: ${this._currency} vs ${other._currency}`);
  }
}

/**
 * EMAIL — E-posta Adresi
 * Nerede: User kaydi, bildirim, fatura, iletisim.
 * Neden VO: format kontrolu her yerde tekrar eder, kucuk/buyuk harf tutarsizligi.
 * Kural: format gecerli olmali, kucuk harfe donusturulmeli.
 */
export class Email {
  private static readonly PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  private constructor(private readonly _value: string) {
    if (!Email.PATTERN.test(_value)) throw new Error(`Gecersiz email: ${_value}`);
  }

  static create(email: string): Email {
    return new Email(email.trim().toLowerCase());
  }

  get value(): string {
    return this._value;
  }
  get domain(): string {
    return this._value.split('@')[1];
  }
  get localPart(): string {
    return this._value.split('@')[0];
  }

  equals(other: Email): boolean {
    return this._value === other._value;
  }

  toString(): string {
    return this._value;
  }
}

/**
 * PHONE NUMBER — Telefon Numarasi
 * Nerede: User kaydi, SMS dogrulama, kargo iletisim.
 * Neden VO: format tutarsizligi (0532..., +90532..., 532...).
 * Kural: E.164 formatina normalize, ulke kodu zorunlu.
 */
export class PhoneNumber {
  private constructor(
    private readonly _countryCode: string,
    private readonly _number: string,
  ) {
    if (!/^\+\d{1,3}$/.test(_countryCode)) throw new Error(`Gecersiz ulke kodu: ${_countryCode}`);
    if (!/^\d{7,15}$/.test(_number)) throw new Error(`Gecersiz numara: ${_number}`);
  }

  static create(countryCode: string, number: string): PhoneNumber {
    const cleaned = number.replace(/[\s\-()]/g, '');
    const code = countryCode.startsWith('+') ? countryCode : `+${countryCode}`;
    return new PhoneNumber(code, cleaned);
  }

  static fromE164(e164: string): PhoneNumber {
    // +905321234567 → countryCode: +90, number: 5321234567
    const match = e164.match(/^(\+\d{1,3})(\d{7,15})$/);
    if (!match) throw new Error(`Gecersiz E.164: ${e164}`);
    return new PhoneNumber(match[1], match[2]);
  }

  get countryCode(): string {
    return this._countryCode;
  }
  get number(): string {
    return this._number;
  }
  get e164(): string {
    return `${this._countryCode}${this._number}`;
  }
  get formatted(): string {
    return `${this._countryCode} ${this._number.replace(/(\d{3})(\d{3})(\d{4})/, '$1 $2 $3')}`;
  }

  equals(other: PhoneNumber): boolean {
    return this._countryCode === other._countryCode && this._number === other._number;
  }
}

/**
 * ADDRESS — Adres
 * Nerede: Kargo, fatura, kullanici profili, magaza konumu.
 * Neden VO: 5 alan birlikte anlamli (sokak tek basina adres degil).
 * Kural: sehir ve ulke zorunlu, posta kodu formati ulkeye gore degisir.
 */
export class Address {
  private constructor(
    private readonly _street: string,
    private readonly _city: string,
    private readonly _state: string,
    private readonly _postalCode: string,
    private readonly _country: string,
  ) {
    if (!_city.trim()) throw new Error('Sehir bos olamaz');
    if (!_country.trim()) throw new Error('Ulke bos olamaz');
  }

  static create(props: {
    street: string;
    city: string;
    state: string;
    postalCode: string;
    country: string;
  }): Address {
    return new Address(
      props.street.trim(),
      props.city.trim(),
      props.state.trim(),
      props.postalCode.trim(),
      props.country.trim().toUpperCase(),
    );
  }

  get street(): string {
    return this._street;
  }
  get city(): string {
    return this._city;
  }
  get state(): string {
    return this._state;
  }
  get postalCode(): string {
    return this._postalCode;
  }
  get country(): string {
    return this._country;
  }

  get oneLine(): string {
    return [this._street, this._city, this._state, this._postalCode, this._country]
      .filter(Boolean)
      .join(', ');
  }

  equals(other: Address): boolean {
    return (
      this._street === other._street &&
      this._city === other._city &&
      this._state === other._state &&
      this._postalCode === other._postalCode &&
      this._country === other._country
    );
  }
}

/**
 * DATE RANGE — Tarih Araligi
 * Nerede: Rezervasyon suresi, kampanya suresi, kiralama donemi, izin tarihleri.
 * Neden VO: baslangic < bitis kontrolu her yerde tekrar eder.
 * Kural: baslangic bitiisten once olmali, bitis gecmiste olabilir (gecmis kayitlar).
 */
export class DateRange {
  private constructor(
    private readonly _start: Date,
    private readonly _end: Date,
  ) {
    if (_start >= _end)
      throw new Error(
        `Baslangic bitiisten once olmali: ${_start.toISOString()} >= ${_end.toISOString()}`,
      );
  }

  static create(start: Date, end: Date): DateRange {
    return new DateRange(new Date(start), new Date(end));
  }

  get start(): Date {
    return new Date(this._start);
  }
  get end(): Date {
    return new Date(this._end);
  }

  get durationMs(): number {
    return this._end.getTime() - this._start.getTime();
  }
  get durationDays(): number {
    return this.durationMs / (1000 * 60 * 60 * 24);
  }
  get durationHours(): number {
    return this.durationMs / (1000 * 60 * 60);
  }

  contains(date: Date): boolean {
    return date >= this._start && date <= this._end;
  }

  overlaps(other: DateRange): boolean {
    return this._start < other._end && this._end > other._start;
  }

  isActive(): boolean {
    const now = new Date();
    return now >= this._start && now <= this._end;
  }

  equals(other: DateRange): boolean {
    return (
      this._start.getTime() === other._start.getTime() &&
      this._end.getTime() === other._end.getTime()
    );
  }
}

/**
 * PERCENTAGE — Yuzde
 * Nerede: Indirim, vergi (KDV %18), komisyon, faiz orani, doluluk orani.
 * Neden VO: %18 mi 0.18 mi 18 mi — temsil tutarsizligi.
 * Kural: 0-100 arasi (veya sinirsiz — faiz %150 olabilir), negatif olamaz.
 */
export class Percentage {
  private constructor(private readonly _value: number) {
    if (_value < 0) throw new Error(`Negatif yuzde: ${_value}`);
  }

  static fromPercent(value: number): Percentage {
    return new Percentage(value); // 18 = %18
  }

  static fromDecimal(value: number): Percentage {
    return new Percentage(value * 100); // 0.18 = %18
  }

  get value(): number {
    return this._value;
  }
  get decimal(): number {
    return this._value / 100;
  }

  applyTo(money: Money): Money {
    return money.multiply(this._value / 100);
  }

  add(other: Percentage): Percentage {
    return new Percentage(this._value + other._value);
  }

  equals(other: Percentage): boolean {
    return this._value === other._value;
  }

  toString(): string {
    return `%${this._value}`;
  }
}

// ══════════════════════════════════════════════════════════════
// 2. E-TICARET
// ══════════════════════════════════════════════════════════════

/**
 * QUANTITY — Miktar
 * Nerede: Sepet, siparis, stok, depo.
 * Neden VO: negatif miktar, 0 adet siparis, ondalik adet (3.5 adet telefon?).
 * Kural: pozitif tam sayi (gram/litre gibi birimler icin ondalik versiyonu ayri yazilir).
 */
export class Quantity {
  private constructor(private readonly _value: number) {
    if (_value < 1) throw new Error(`Miktar en az 1 olmali: ${_value}`);
    if (!Number.isInteger(_value)) throw new Error(`Tam sayi olmali: ${_value}`);
  }

  static of(value: number): Quantity {
    return new Quantity(value);
  }

  get value(): number {
    return this._value;
  }

  add(other: Quantity): Quantity {
    return new Quantity(this._value + other._value);
  }

  subtract(other: Quantity): Quantity {
    if (this._value - other._value < 1) throw new Error('Miktar 0 altina dusmez');
    return new Quantity(this._value - other._value);
  }

  equals(other: Quantity): boolean {
    return this._value === other._value;
  }
  toString(): string {
    return `${this._value} adet`;
  }
}

/**
 * SKU — Stok Birimi Kodu
 * Nerede: Urun katalogu, depo, siparis.
 * Neden VO: format tutarsizligi (bosluk, kucuk/buyuk harf).
 * Kural: alfanumerik, tire izinli, bosluk yok, buyuk harfe normalize.
 */
export class SKU {
  private static readonly PATTERN = /^[A-Z0-9\-]{3,50}$/;

  private constructor(private readonly _value: string) {
    if (!SKU.PATTERN.test(_value))
      throw new Error(`Gecersiz SKU: ${_value} (alfanumerik, 3-50 karakter)`);
  }

  static create(value: string): SKU {
    return new SKU(value.trim().toUpperCase().replace(/\s+/g, '-'));
  }

  get value(): string {
    return this._value;
  }
  equals(other: SKU): boolean {
    return this._value === other._value;
  }
  toString(): string {
    return this._value;
  }
}

/**
 * WEIGHT — Agirlik
 * Nerede: Kargo ucreti hesaplama, urun bilgisi, depo yonetimi.
 * Neden VO: birim karisikligi (kg mi, gram mi, pound mu).
 * Kural: negatif olamaz, birim donusumu icsel.
 */
export class Weight {
  private constructor(
    private readonly _grams: number, // her sey gram olarak saklanir
  ) {
    if (_grams < 0) throw new Error(`Negatif agirlik: ${_grams}`);
  }

  static fromGrams(g: number): Weight {
    return new Weight(g);
  }
  static fromKg(kg: number): Weight {
    return new Weight(kg * 1000);
  }
  static fromPounds(lb: number): Weight {
    return new Weight(Math.round(lb * 453.592));
  }

  get grams(): number {
    return this._grams;
  }
  get kg(): number {
    return this._grams / 1000;
  }
  get pounds(): number {
    return this._grams / 453.592;
  }

  add(other: Weight): Weight {
    return new Weight(this._grams + other._grams);
  }
  isHeavier(other: Weight): boolean {
    return this._grams > other._grams;
  }
  equals(other: Weight): boolean {
    return this._grams === other._grams;
  }
  toString(): string {
    return this._grams >= 1000 ? `${this.kg} kg` : `${this._grams} g`;
  }
}

/**
 * DIMENSIONS — Boyutlar (en x boy x yukseklik)
 * Nerede: Kargo hacim hesaplama, depo yerlesim, urun bilgisi.
 * Neden VO: 3 alan birlikte anlamli, hacim hesaplama icsel.
 */
export class Dimensions {
  private constructor(
    private readonly _widthCm: number,
    private readonly _heightCm: number,
    private readonly _depthCm: number,
  ) {
    if (_widthCm <= 0 || _heightCm <= 0 || _depthCm <= 0)
      throw new Error('Boyutlar pozitif olmali');
  }

  static create(widthCm: number, heightCm: number, depthCm: number): Dimensions {
    return new Dimensions(widthCm, heightCm, depthCm);
  }

  get widthCm(): number {
    return this._widthCm;
  }
  get heightCm(): number {
    return this._heightCm;
  }
  get depthCm(): number {
    return this._depthCm;
  }
  get volumeCm3(): number {
    return this._widthCm * this._heightCm * this._depthCm;
  }
  get volumeLiters(): number {
    return this.volumeCm3 / 1000;
  }

  fitsInside(container: Dimensions): boolean {
    // herhangi bir yonelimde sigiyorsa
    const dims = [this._widthCm, this._heightCm, this._depthCm].sort((a, b) => a - b);
    const cont = [container._widthCm, container._heightCm, container._depthCm].sort(
      (a, b) => a - b,
    );
    return dims[0] <= cont[0] && dims[1] <= cont[1] && dims[2] <= cont[2];
  }

  equals(other: Dimensions): boolean {
    return (
      this._widthCm === other._widthCm &&
      this._heightCm === other._heightCm &&
      this._depthCm === other._depthCm
    );
  }
}

// ══════════════════════════════════════════════════════════════
// 3. FINANS / BANKA
// ══════════════════════════════════════════════════════════════

/**
 * IBAN — Uluslararasi Banka Hesap Numarasi
 * Nerede: Havale, EFT, maas odemesi, fatura odemesi.
 * Neden VO: format kontrolu + check digit dogrulama.
 * Kural: ulke kodu (2 harf) + check digit (2 rakam) + banka kodu + hesap no, toplam 26 karakter (TR).
 */
export class IBAN {
  private constructor(private readonly _value: string) {
    if (!/^TR\d{24}$/.test(_value))
      throw new Error(`Gecersiz TR IBAN: ${_value} (TR + 24 rakam olmali)`);
    if (!IBAN.validateCheckDigit(_value)) throw new Error(`IBAN check digit hatali: ${_value}`);
  }

  static create(iban: string): IBAN {
    return new IBAN(iban.replace(/\s/g, '').toUpperCase());
  }

  private static validateCheckDigit(iban: string): boolean {
    // IBAN mod 97 kontrolu
    const rearranged = iban.slice(4) + iban.slice(0, 4);
    const numeric = rearranged.replace(/[A-Z]/g, (ch) => String(ch.charCodeAt(0) - 55));
    let remainder = '';
    for (const digit of numeric) {
      remainder = String(Number(remainder + digit) % 97);
    }
    return Number(remainder) === 1;
  }

  get value(): string {
    return this._value;
  }
  get bankCode(): string {
    return this._value.slice(4, 9);
  }
  get formatted(): string {
    return this._value.replace(/(.{4})/g, '$1 ').trim();
  }

  equals(other: IBAN): boolean {
    return this._value === other._value;
  }
  toString(): string {
    return this.formatted;
  }
}

/**
 * CURRENCY PAIR — Doviz Cifti
 * Nerede: Doviz kuru, forex, uluslararasi odeme.
 * Neden VO: "USDTRY" mi "TRY/USD" mi — temsil tutarsizligi.
 * Kural: iki farkli 3 harfli para birimi.
 */
export class CurrencyPair {
  private constructor(
    private readonly _base: string, // satin alinan
    private readonly _quote: string, // karsiliginda verilen
  ) {
    if (!/^[A-Z]{3}$/.test(_base)) throw new Error(`Gecersiz base: ${_base}`);
    if (!/^[A-Z]{3}$/.test(_quote)) throw new Error(`Gecersiz quote: ${_quote}`);
    if (_base === _quote) throw new Error('Base ve quote ayni olamaz');
  }

  static create(base: string, quote: string): CurrencyPair {
    return new CurrencyPair(base.toUpperCase(), quote.toUpperCase());
  }

  static fromString(pair: string): CurrencyPair {
    // "USD/TRY" veya "USDTRY"
    const clean = pair.replace('/', '');
    if (clean.length !== 6) throw new Error(`Gecersiz cift: ${pair}`);
    return new CurrencyPair(clean.slice(0, 3), clean.slice(3));
  }

  get base(): string {
    return this._base;
  }
  get quote(): string {
    return this._quote;
  }
  get symbol(): string {
    return `${this._base}/${this._quote}`;
  }

  invert(): CurrencyPair {
    return new CurrencyPair(this._quote, this._base);
  }
  equals(other: CurrencyPair): boolean {
    return this._base === other._base && this._quote === other._quote;
  }
  toString(): string {
    return this.symbol;
  }
}

/**
 * INTEREST RATE — Faiz Orani
 * Nerede: Kredi, mevduat, taksit, gecikme faizi.
 * Neden VO: yillik mi, aylik mi, gunluk mu — donusum icsel.
 * Kural: negatif olabilir (negatif faiz politikasi), ama genelde >= 0.
 */
export class InterestRate {
  private constructor(
    private readonly _annualRate: number, // yillik oran (0.18 = %18)
  ) {}

  static fromAnnual(rate: number): InterestRate {
    return new InterestRate(rate);
  }
  static fromMonthly(rate: number): InterestRate {
    return new InterestRate(rate * 12);
  }
  static fromAnnualPercent(percent: number): InterestRate {
    return new InterestRate(percent / 100);
  }

  get annual(): number {
    return this._annualRate;
  }
  get monthly(): number {
    return this._annualRate / 12;
  }
  get daily(): number {
    return this._annualRate / 365;
  }
  get annualPercent(): number {
    return this._annualRate * 100;
  }

  calculateInterest(principal: Money, days: number): Money {
    return principal.multiply(this.daily * days);
  }

  equals(other: InterestRate): boolean {
    return this._annualRate === other._annualRate;
  }
  toString(): string {
    return `%${this.annualPercent.toFixed(2)} yillik`;
  }
}

// ══════════════════════════════════════════════════════════════
// 4. SAGLIK
// ══════════════════════════════════════════════════════════════

/**
 * TC KIMLIK NO — Turkiye Cumhuriyeti Kimlik Numarasi
 * Nerede: Hasta kaydi, sigorta, resmi islem, vergi.
 * Neden VO: 11 haneli, algoritma ile dogrulanir, sifirla baslamaz.
 * Kural: uzunluk + format + algoritma kontrolu.
 */
export class TCKimlikNo {
  private constructor(private readonly _value: string) {
    if (!/^\d{11}$/.test(_value)) throw new Error('11 haneli olmali');
    if (_value[0] === '0') throw new Error('Sifirla baslamaz');
    if (!TCKimlikNo.validateAlgorithm(_value)) throw new Error('Algoritma hatali');
  }

  static create(value: string): TCKimlikNo {
    return new TCKimlikNo(value.trim());
  }

  private static validateAlgorithm(tc: string): boolean {
    const digits = tc.split('').map(Number);
    const oddSum = digits[0] + digits[2] + digits[4] + digits[6] + digits[8];
    const evenSum = digits[1] + digits[3] + digits[5] + digits[7];
    const check10 = (oddSum * 7 - evenSum) % 10;
    const check11 = digits.slice(0, 10).reduce((a, b) => a + b, 0) % 10;
    return digits[9] === check10 && digits[10] === check11;
  }

  get value(): string {
    return this._value;
  }
  get masked(): string {
    return `${this._value.slice(0, 3)}****${this._value.slice(7)}`;
  }

  equals(other: TCKimlikNo): boolean {
    return this._value === other._value;
  }
  toString(): string {
    return this.masked;
  } // gizlilik icin maskelenmis
}

/**
 * BLOOD TYPE — Kan Grubu
 * Nerede: Hasta kaydi, ameliyat oncesi, kan bankasi.
 * Neden VO: sinirli deger kumesi (8 gecerli deger), uyumluluk kontrolu icsel.
 * Kural: sadece gecerli kan gruplari kabul edilir.
 */
export class BloodType {
  private static readonly VALID = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'] as const;

  private constructor(private readonly _value: string) {}

  static create(value: string): BloodType {
    const upper = value.toUpperCase().replace(' ', '');
    if (!BloodType.VALID.includes(upper as any))
      throw new Error(`Gecersiz kan grubu: ${value}. Gecerli: ${BloodType.VALID.join(', ')}`);
    return new BloodType(upper);
  }

  get value(): string {
    return this._value;
  }

  canDonateTo(recipient: BloodType): boolean {
    // O- herkese verebilir, AB+ herkesten alabilir
    const rules: Record<string, string[]> = {
      'O-': ['O-', 'O+', 'A-', 'A+', 'B-', 'B+', 'AB-', 'AB+'],
      'O+': ['O+', 'A+', 'B+', 'AB+'],
      'A-': ['A-', 'A+', 'AB-', 'AB+'],
      'A+': ['A+', 'AB+'],
      'B-': ['B-', 'B+', 'AB-', 'AB+'],
      'B+': ['B+', 'AB+'],
      'AB-': ['AB-', 'AB+'],
      'AB+': ['AB+'],
    };
    return rules[this._value]?.includes(recipient._value) ?? false;
  }

  canReceiveFrom(donor: BloodType): boolean {
    return donor.canDonateTo(this);
  }

  equals(other: BloodType): boolean {
    return this._value === other._value;
  }
  toString(): string {
    return this._value;
  }
}

/**
 * DOSAGE — Ilac Dozu
 * Nerede: Recete, ilac yonetimi, hasta takip.
 * Neden VO: deger + birim birlikte anlamli (500 mg ≠ 500 ml), max doz kontrolu.
 */
export class Dosage {
  private static readonly VALID_UNITS = ['mg', 'g', 'ml', 'mcg', 'IU'] as const;

  private constructor(
    private readonly _amount: number,
    private readonly _unit: string,
  ) {
    if (_amount <= 0) throw new Error('Doz pozitif olmali');
    if (!Dosage.VALID_UNITS.includes(_unit as any))
      throw new Error(`Gecersiz birim: ${_unit}. Gecerli: ${Dosage.VALID_UNITS.join(', ')}`);
  }

  static create(amount: number, unit: string): Dosage {
    return new Dosage(amount, unit.toLowerCase());
  }

  get amount(): number {
    return this._amount;
  }
  get unit(): string {
    return this._unit;
  }

  multiplyDoses(times: number): Dosage {
    return new Dosage(this._amount * times, this._unit);
  }

  equals(other: Dosage): boolean {
    return this._amount === other._amount && this._unit === other._unit;
  }

  toString(): string {
    return `${this._amount} ${this._unit}`;
  }
}

// ══════════════════════════════════════════════════════════════
// 5. LOJISTIK / KARGO
// ══════════════════════════════════════════════════════════════

/**
 * TRACKING NUMBER — Kargo Takip Numarasi
 * Nerede: Kargo takip, siparis detay, musteri bildirimi.
 * Neden VO: tasiyiciya gore farkli format, format dogrulama.
 */
export class TrackingNumber {
  private constructor(
    private readonly _value: string,
    private readonly _carrier: string,
  ) {
    if (!_value.trim()) throw new Error('Takip numarasi bos olamaz');
    if (!_carrier.trim()) throw new Error('Tasiyici bos olamaz');
  }

  static create(value: string, carrier: string): TrackingNumber {
    return new TrackingNumber(value.trim().toUpperCase(), carrier.trim().toUpperCase());
  }

  get value(): string {
    return this._value;
  }
  get carrier(): string {
    return this._carrier;
  }
  get trackingUrl(): string {
    const urls: Record<string, string> = {
      YURTICI: `https://www.yurticikargo.com/tr/online-servisler/gonderi-sorgula?code=${this._value}`,
      ARAS: `https://www.araskargo.com.tr/taki.aspx?kargo_takip_no=${this._value}`,
      MNG: `https://www.mngkargo.com.tr/gonderi-takip/${this._value}`,
      UPS: `https://www.ups.com/track?tracknum=${this._value}`,
    };
    return urls[this._carrier] ?? '';
  }

  equals(other: TrackingNumber): boolean {
    return this._value === other._value && this._carrier === other._carrier;
  }
}

/**
 * GEO COORDINATE — Cografi Koordinat
 * Nerede: Harita, konum bazli arama, teslimat noktasi, magaza bulucu.
 * Neden VO: enlem -90..+90, boylam -180..+180, mesafe hesaplama icsel.
 */
export class GeoCoordinate {
  private constructor(
    private readonly _lat: number,
    private readonly _lng: number,
  ) {
    if (_lat < -90 || _lat > 90) throw new Error(`Enlem -90..+90 arasi olmali: ${_lat}`);
    if (_lng < -180 || _lng > 180) throw new Error(`Boylam -180..+180 arasi olmali: ${_lng}`);
  }

  static create(lat: number, lng: number): GeoCoordinate {
    return new GeoCoordinate(lat, lng);
  }

  get lat(): number {
    return this._lat;
  }
  get lng(): number {
    return this._lng;
  }

  distanceTo(other: GeoCoordinate): number {
    // Haversine formulu — iki nokta arasi km
    const R = 6371; // Dunya yaricapi km
    const dLat = this.toRad(other._lat - this._lat);
    const dLng = this.toRad(other._lng - this._lng);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(this.toRad(this._lat)) * Math.cos(this.toRad(other._lat)) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  isWithinKm(other: GeoCoordinate, km: number): boolean {
    return this.distanceTo(other) <= km;
  }

  private toRad(deg: number): number {
    return deg * (Math.PI / 180);
  }

  equals(other: GeoCoordinate): boolean {
    return this._lat === other._lat && this._lng === other._lng;
  }

  toString(): string {
    return `${this._lat}, ${this._lng}`;
  }
}

// ══════════════════════════════════════════════════════════════
// 6. EGITIM
// ══════════════════════════════════════════════════════════════

/**
 * GRADE — Not
 * Nerede: Ogrenci karnesi, sinav sonucu, ortalama hesaplama.
 * Neden VO: 0-100 arasi, harf karsiligi icsel, gecme/kalma kontrolu.
 */
export class Grade {
  private constructor(private readonly _value: number) {
    if (_value < 0 || _value > 100) throw new Error(`Not 0-100 arasi olmali: ${_value}`);
  }

  static create(value: number): Grade {
    return new Grade(Math.round(value * 100) / 100);
  }

  get value(): number {
    return this._value;
  }
  get letter(): string {
    if (this._value >= 90) return 'AA';
    if (this._value >= 85) return 'BA';
    if (this._value >= 80) return 'BB';
    if (this._value >= 75) return 'CB';
    if (this._value >= 70) return 'CC';
    if (this._value >= 65) return 'DC';
    if (this._value >= 60) return 'DD';
    if (this._value >= 50) return 'FD';
    return 'FF';
  }

  get gpa(): number {
    const map: Record<string, number> = {
      AA: 4.0,
      BA: 3.5,
      BB: 3.0,
      CB: 2.5,
      CC: 2.0,
      DC: 1.5,
      DD: 1.0,
      FD: 0.5,
      FF: 0.0,
    };
    return map[this.letter];
  }

  isPassing(): boolean {
    return this._value >= 60;
  }
  isHonors(): boolean {
    return this._value >= 85;
  }

  equals(other: Grade): boolean {
    return this._value === other._value;
  }
  toString(): string {
    return `${this._value} (${this.letter})`;
  }
}

// ══════════════════════════════════════════════════════════════
// 7. INSAN KAYNAKLARI
// ══════════════════════════════════════════════════════════════

/**
 * SALARY — Maas
 * Nerede: Bordro, butce planlama, is ilani, teklif mektubu.
 * Neden VO: brut/net ayrimi, yillik/aylik donusum, para birimi.
 * Kural: pozitif olmali, brut her zaman >= net.
 */
export class Salary {
  private constructor(
    private readonly _grossMonthly: Money,
    private readonly _type: 'GROSS' | 'NET',
  ) {}

  static gross(monthlyAmount: Money): Salary {
    return new Salary(monthlyAmount, 'GROSS');
  }

  static net(monthlyAmount: Money): Salary {
    return new Salary(monthlyAmount, 'NET');
  }

  get monthly(): Money {
    return this._grossMonthly;
  }
  get yearly(): Money {
    return this._grossMonthly.multiply(12);
  }
  get type(): string {
    return this._type;
  }

  isHigherThan(other: Salary): boolean {
    return this._grossMonthly.isGreaterThan(other._grossMonthly);
  }

  equals(other: Salary): boolean {
    return this._grossMonthly.equals(other._grossMonthly) && this._type === other._type;
  }

  toString(): string {
    return `${this._grossMonthly.toDisplayString()}/ay (${this._type})`;
  }
}

/**
 * WORKING HOURS — Calisma Saati
 * Nerede: Mesai takip, izin hesaplama, fazla mesai.
 * Neden VO: negatif olamaz, gunluk max sinir, fazla mesai hesaplama.
 */
export class WorkingHours {
  private constructor(private readonly _hours: number) {
    if (_hours < 0) throw new Error('Negatif saat olamaz');
    if (_hours > 24) throw new Error('Gunluk 24 saati asamaz');
  }

  static create(hours: number): WorkingHours {
    return new WorkingHours(hours);
  }

  static fromMinutes(minutes: number): WorkingHours {
    return new WorkingHours(minutes / 60);
  }

  get hours(): number {
    return this._hours;
  }
  get minutes(): number {
    return this._hours * 60;
  }

  isOvertime(standardHours = 8): boolean {
    return this._hours > standardHours;
  }

  overtimeHours(standardHours = 8): number {
    return Math.max(0, this._hours - standardHours);
  }

  add(other: WorkingHours): WorkingHours {
    const total = this._hours + other._hours;
    if (total > 24) throw new Error('Toplam 24 saati asamaz');
    return new WorkingHours(total);
  }

  equals(other: WorkingHours): boolean {
    return this._hours === other._hours;
  }
  toString(): string {
    return `${this._hours.toFixed(1)} saat`;
  }
}

// ══════════════════════════════════════════════════════════════
// KULLANIM ORNEKLERI
// ══════════════════════════════════════════════════════════════

/*
// E-Ticaret siparisi:
const price = Money.fromDecimal(149.99);
const qty = Quantity.of(3);
const total = price.multiply(qty.value);           // 44997 cent
const vat = Percentage.fromPercent(18);
const vatAmount = vat.applyTo(total);              // 8099 cent
const grandTotal = total.add(vatAmount);           // 53096 cent = 530.96 TRY

// Kargo hesaplama:
const weight = Weight.fromKg(2.5);
const dims = Dimensions.create(30, 20, 15);
const desi = dims.volumeCm3 / 3000;               // hacim agirligi
const chargeableWeight = Math.max(weight.kg, desi);

// Banka havalesi:
const iban = IBAN.create('TR33 0006 1005 1978 6457 8413 26');
const rate = InterestRate.fromAnnualPercent(42);
const monthlyInterest = rate.calculateInterest(Money.fromCents(100000), 30);

// Saglik:
const donor = BloodType.create('O-');
const patient = BloodType.create('AB+');
donor.canDonateTo(patient);  // true — O- herkese verebilir

const dose = Dosage.create(500, 'mg');
const dailyDose = dose.multiplyDoses(3);           // 1500 mg (gunde 3 kez)

// Lojistik:
const istanbul = GeoCoordinate.create(41.0082, 28.9784);
const ankara = GeoCoordinate.create(39.9334, 32.8597);
istanbul.distanceTo(ankara);  // ~351 km

// HR:
const salary = Salary.gross(Money.fromDecimal(45000));
salary.yearly;  // 540000 TRY
const hours = WorkingHours.create(10);
hours.isOvertime();      // true (> 8 saat)
hours.overtimeHours();   // 2 saat
*/
