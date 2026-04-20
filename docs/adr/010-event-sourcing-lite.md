# ADR-010: Event Sourcing Lite (Only for Pricing)

## Status: Accepted

## Context
Fiyat degisikliklerinin gecmisi, indirim uygulamalari ve fiyat audit trail'i pricing modulunde kritik oneme sahiptir. Ancak event sourcing tum sisteme uygulandiginda operasyonel karmasiklik onemli olcude artar.

## Decision
Event sourcing yalnizca **pricing** modulunde ve hafif bir formda (lite) uygulanmaktadir:
- PostgreSQL'de append-only bir `pricing_events` tablosu kullanilir.
- Her fiyat degisikligi (olusturma, guncelleme, indirim, iptal) immutable bir event olarak kaydedilir.
- Guncel fiyat, event'lerin sirayla oynatilmasi (replay) ile elde edilir.
- Performans icin materialized view veya cache ile guncel durum tutulur.

## Consequences
- Pricing'de tam audit trail saglanir; herhangi bir andaki fiyat yeniden hesaplanabilir.
- Event replay mantigi test edilmeli ve versiyonlanmalidir.
- Diger moduller klasik CRUD yaklasimini kullanmaya devam eder; takim iki farkli pattern'i bilmelidir.

## Alternatives Considered
- **Tum sistemde event sourcing**: Event store, projection engine, eventual consistency yonetimi gerektirir. Operasyonel karmasiklik ve ogrenme egrisi bu proje olceginde karsilanamaz.
- **Sadece audit log tablosu**: Degisiklikleri kaydeder ancak state reconstruction imkani sunmaz.
- **Dedicated event store (EventStoreDB)**: Ek altyapi gerektirir; PostgreSQL append-only tablo bu asamada yeterlidir.
