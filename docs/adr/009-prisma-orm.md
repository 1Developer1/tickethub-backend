# ADR-009: Prisma as ORM

## Status: Accepted

## Context
Veritabani erisim katmani icin type-safe, bakimi kolay ve migration destegi sunan bir ORM secilmeliydi. Node.js ekosistemindeki guncel secenekler degerlendirilmistir.

## Decision
Prisma ORM tercih edilmistir:
- **Type-safe client**: `prisma generate` ile schema'dan otomatik TypeScript tipleri uretilir; runtime hatasi riski azalir.
- **Migration sistemi**: `prisma migrate` ile schema degisiklikleri versiyonlanir ve tekrarlanabilir sekilde uygulanir.
- **Deklaratif schema**: `schema.prisma` dosyasi tek kaynak olarak modeli tanimlar.

## Consequences
- Karmasik SQL sorgulari (window function, CTE, recursive query) icin `$queryRaw` kullanmak gerekir; bu durumda type-safety kaybolur.
- Prisma Client her generate isleminde yeniden olusturulur; CI/CD pipeline'ina eklenmeli.
- Connection pooling icin PgBouncer ile uyumluluk konfigurasyonu gerekir.

## Alternatives Considered
- **TypeORM**: Decorator-based yaklasim ve runtime reflection kullanir. TypeScript desteği vardir ancak tip guvenceleri Prisma kadar guclu degildir. Migration sistemi daha az öngörülebilirdir.
- **Drizzle ORM**: SQL-first yaklasim; raw query performansi daha yuksektir ve bundle size daha kucuktur. Ancak ekosistemi henuz Prisma kadar olgun degildir.
- **Knex.js (query builder)**: Tam kontrol saglar fakat ORM seviyesinde soyutlama sunmaz.
