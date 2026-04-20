# ADR-003: Feature-Based Folder Structure

## Status: Accepted

## Context
Kod organizasyonu icin iki temel yaklasim vardir: katman bazli (layer-based) ve ozellik bazli (feature-based). Gelistirici verimliligi ve modul bagimsizligi acisindan en uygun yapi belirlenmeliydi.

## Decision
Feature-based klasor yapisi kullanilmaktadir:
```
src/
  modules/
    booking/
      booking.controller.ts
      booking.service.ts
      booking.repository.ts
      booking.schema.ts
    events/
      events.controller.ts
      events.service.ts
      ...
```
- **Ilgili kod yan yana**: Bir ozellik uzerinde calisirken tum dosyalar ayni klasorde bulunur.
- **Tek klasor prensibi**: Bir ozellik icin tek dizine bakmak yeterlidir.
- **Modul bagimsizligi**: Her feature klasoru kendi controller, service ve repository katmanlarini icerir.

## Consequences
- Modüller arasi paylasilan kodun nerede yasayacagi net tanimlanmalidir (`shared/` veya `common/` dizini).
- Yeni geliştiriciler projeye daha hizli adapte olur; bir feature'in tum parcalari tek yerde gorulur.

## Alternatives Considered
- **Layer-based** (`controllers/`, `services/`, `repositories/`): Geleneksel yaklasim. Ancak bir ozellik icin 5 farkli klasor arasinda ziplama gerektirir. Feature buyudukce ilgili dosyalari bulmak zorlasir.
- **Hybrid**: Katman + feature karişimi. Tutarsizliga yol acabilir.
