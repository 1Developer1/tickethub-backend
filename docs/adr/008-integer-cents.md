# ADR-008: Integer Cents for Money Representation

## Status: Accepted

## Context
Para hesaplamalarinda yuvarlama hatalari finansal tutarsizliklara yol acar. Fiyat, odeme ve iade islemlerinde kullanilacak veri tipi dikkatle secilmelidir.

## Decision
Tum para degerleri **integer cents** olarak saklanir ve islenir:
- `15000` degeri `150.00 TL` anlamina gelir.
- Veritabaninda `INTEGER` tipi, uygulama katmaninda `number` (TypeScript) kullanilir.
- Gosterim katmaninda (API response, UI) `/100` ile formatlanir.

## Consequences
- Yuvarlama hatasi sifirdir; `0.1 + 0.2 === 0.3` problemi ortadan kalkar.
- Aritmetik islemler (toplama, cikarma) dogrudan integer ile yapilir; performans kaybi yoktur.
- Bolme islemlerinde (ornegin yuzdelik indirim) `Math.round()` ile bilinçli yuvarlama gerekir.
- Tum takim uyelerinin "deger her zaman cents cinsinden" kuralini bilmesi gerekir; aksi halde 100x hata riski olusur.

## Alternatives Considered
- **Floating point (`float`/`double`)**: `0.1 + 0.2 = 0.30000000000000004` — finansal islemlerde kabul edilemez.
- **Decimal tipi (PostgreSQL `NUMERIC`, JS `Decimal.js`)**: Tam hassasiyet saglar ancak integer'a gore yavasdir ve ek kutuphane gerektirir.
- **String-based money**: Serialize/deserialize maliyeti yuksektir.
