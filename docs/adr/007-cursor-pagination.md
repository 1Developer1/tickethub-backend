# ADR-007: Cursor-Based Pagination

## Status: Accepted

## Context
Etkinlik listesi, rezervasyon gecmisi gibi buyuk veri setlerinde sayfalama (pagination) zorunludur. Performans ve kullanici deneyimi acisindan en uygun sayfalama stratejisi belirlenmeliydi.

## Decision
Cursor-based (keyset) pagination kullanilmaktadir:
- **Sorgu yapisi**: `WHERE id > :lastId ORDER BY id LIMIT :size` — index uzerinden dogrudan atlar.
- **O(1) performans**: Sayfa numarasi buyudukce performans degismez.
- Cursor degeri opaque token olarak client'a dondurulur (base64-encoded composite key).

## Consequences
- Client belirli bir sayfa numarasina dogrudan atlayamaz ("sayfa 50'ye git" desteklenmez).
- Siralama kriteri degistiginde cursor yapisi da degismelidir.
- API response'unda `nextCursor` ve `hasMore` alanlari standart olarak dondurulur.

## Alternatives Considered
- **Offset-based pagination**: `LIMIT 20 OFFSET 999000` — veritabani 999.000 satiri okuyup atar; buyuk veri setlerinde ciddi performans sorunu olusturur. Ayrica veri eklenip silindikce sayfa iceriginde kayma (drift) yasanir.
- **Page-number based**: Offset'in kullanici dostu hali; ayni performans sorunlarini tasir.

> **Not**: Admin paneli gibi kucuk veri setlerinde offset kabul edilebilir; ancak public API'lerde cursor zorunludur.
