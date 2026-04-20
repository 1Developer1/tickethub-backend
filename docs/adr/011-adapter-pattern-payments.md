# ADR-011: Adapter Pattern for Payments Only

## Status: Accepted

## Context
Dis servis entegrasyonlarinda adapter pattern bagimlilik tersine cevirme (dependency inversion) saglar ve provider degisikligini kolaylastirir. Ancak her module adapter eklemek gereksiz soyutlama katmani olusturabilir.

## Decision
Adapter pattern yalnizca **payments** modulunde uygulanmaktadir:
- `PaymentPort` interface'i tanimlanir (odeme baslatma, durum sorgulama, iade).
- Her odeme saglayicisi icin concrete adapter yazilir (`StripeAdapter`, `IyzicoAdapter` vb.).
- Yeni provider eklemek icin yalnizca yeni bir adapter implement etmek yeterlidir; mevcut is mantigi degismez.

## Consequences
- Odeme saglayicisi degisikligi is mantigi katmanini etkilemez; sadece adapter degisir.
- Her adapter'in ayni interface'i dogru uyguladigini dogrulayan integration testleri yazilmalidir.
- Adapter icindeki provider-specific hata kodlari ortak hata modeline donusturulmelidir.

## Alternatives Considered
- **Tum modullerde adapter pattern**: Diger modullerde (events, venues, users) dis servis entegrasyonu bulunmaz. Bu modullere adapter eklemek gereksiz katman ve boilerplate kod olusturur.
- **Dogrudan SDK kullanimi (adapter'siz)**: Provider degisikliginde is mantigi katmaninda buyuk refactoring gerekir; vendor lock-in riski olusur.
- **Strategy pattern**: Benzer amaca hizmet eder; ancak adapter pattern port/adapter terminolojisi ile hexagonal architecture'a daha uyumludur.
