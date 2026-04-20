/**
 * SeatHold Value Object — "Bu koltuğu bu kullanıcı için 10 dk tuttum"
 *
 * Immutable. Bir koltuk hold'u oluşturulduğunda özellikleri DEĞİŞMEZ.
 * Hold süresi doldu mu? → isExpired() ile kontrol et.
 * Hold'u serbest bırak? → Yeni bir state (RELEASED) ile yeni kayıt oluştur.
 */

export interface SeatHoldProps {
  seatHoldId: string;
  eventId: string;
  sectionName: string;
  row: number;
  seat: number;
  priceInCents: number;
  expiresAt: Date;
}

export class SeatHold {
  private constructor(private readonly props: Readonly<SeatHoldProps>) {}

  static create(props: SeatHoldProps): SeatHold {
    // Invariant: geçmiş tarihli expiry kabul etme
    if (props.expiresAt <= new Date()) {
      throw new Error('SeatHold expiresAt must be in the future');
    }
    return new SeatHold(props);
  }

  static fromPersistence(props: SeatHoldProps): SeatHold {
    // DB'den yüklerken expiry kontrolü yapma (zaten geçmiş olabilir)
    return new SeatHold(props);
  }

  get seatHoldId(): string { return this.props.seatHoldId; }
  get eventId(): string { return this.props.eventId; }
  get sectionName(): string { return this.props.sectionName; }
  get row(): number { return this.props.row; }
  get seat(): number { return this.props.seat; }
  get priceInCents(): number { return this.props.priceInCents; }
  get expiresAt(): Date { return this.props.expiresAt; }

  /** Koltuk tanımlayıcı string (lock key olarak da kullanılır) */
  get seatKey(): string {
    return `${this.props.sectionName}-${this.props.row}-${this.props.seat}`;
  }

  /** Hold süresi dolmuş mu? */
  isExpired(): boolean {
    return new Date() > this.props.expiresAt;
  }
}
