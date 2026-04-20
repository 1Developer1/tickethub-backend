# ADR-002: Modular Monolith Architecture

## Status: Accepted

## Context
Proje baslangicindan itibaren mikroservis mi yoksa monolit mi kullanilacagi belirlenmeliydi. Kucuk-orta olcekli takim yapisi ve operasyonel basitlik ihtiyaci degerlendirilmistir.

## Decision
Moduler monolith mimarisi benimsenmistir:
- **Tek deployment**: CI/CD pipeline'i basit kalir, tek artifact deploy edilir.
- **Modul sinirlari hazir**: Her modul net interface'ler uzerinden iletisim kurar; ileride mikroservise gecis kolaylasir.
- **Debug kolayligi**: Tek process icinde calistigi icin distributed tracing'e gerek kalmaz, stack trace'ler eksiksizdir.

## Consequences
- Moduller arasi sinirlar disiplinle korunmalidir; aksi halde "big ball of mud" riski olusur.
- Tek moduldeki hata tum sistemi etkileyebilir (process crash).
- Horizontal scaling tum monoliti kopyalar, granular scaling mumkun degildir.

## Alternatives Considered
- **Mikroservis**: Bagimsiz deployment ve scaling imkani sunar. Ancak network latency, distributed transaction yonetimi ve operational complexity (service mesh, container orchestration) bu asamada gereksiz yuk getirir.
- **Klasik monolith**: Modul sinirlari olmadan hizli baslanir, fakat zamanla bagimliliklarin ayrismasi zorlasir.

> **Ne zaman mikroservise gecilir**: Takim 50+ kisiye ulastiginda veya moduller bagimsiz scale gerektirdiginde migration planlanmalidir.
