# ADR-004: Selective Domain Model Usage

## Status: Accepted

## Context
Domain-Driven Design (DDD) tum sistem genelinde uygulanabilir olsa da, her moduldeki is karmasikligi ayni seviyede degildir. Gereksiz soyutlama katmanlarindan kacinmak icin secici yaklasim degerlendirilmistir.

## Decision
Domain model yalnizca **booking** ve **pricing** modullerinde uygulanir:
- Bu moduller karmasik is kurallari icerir (koltuk rezervasyonu, fiyat hesaplama, indirim politikalari).
- Aggregate, Value Object ve Domain Event kavramlari sadece bu sinirli alanda kullanilir.

Basit CRUD operasyonlari iceren moduller (events, venues, users) ise dogrudan service-repository pattern ile calisir.

## Consequences
- Booking ve pricing'de is kurallarinin dogrulugu domain katmaninda garanti altina alinir.
- Events, venues ve users modullerinde daha az dosya ve daha hizli gelistirme sureci saglanir.
- Takim uyelerinin hangi modullerde DDD uygulandigini bilmesi gerekir; bu durum dokumantasyonla desteklenmelidir.

## Alternatives Considered
- **Tum modullerde DDD**: Her modul icin Aggregate Root, Repository interface vb. olusturulur. Basit CRUD modulleri icin gereksiz karmasiklik ve boilerplate kod uretir.
- **Hicbir modülde DDD yok**: Booking ve pricing'deki karmasik is kurallari service katmaninda spaghetti code'a donusur.

> **Anti-pattern**: Her module kopyala-yapistir seklinde DDD uygulamak; karmasiklik artisi faydasini asar.
