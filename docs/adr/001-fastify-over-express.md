# ADR-001: Fastify Over Express

## Status: Accepted

## Context
Web framework secimi projenin performans tavani ve gelistirici deneyimini dogrudan etkiler. Node.js ekosisteminde Express fiili standart olsa da, modern alternatiflerin sunduklari avantajlar degerlendirilmistir.

## Decision
Fastify tercih edilmistir. Temel gerekceleri:
- **Performans**: Benchmark'larda Express'e gore ~2x throughput saglar.
- **Schema-based validation**: JSON Schema ile request/response dogrulamasi framework seviyesinde desteklenir; ayri validation katmanina gerek kalmaz.
- **Encapsulation**: Plugin sistemi sayesinde moduller birbirinden izole calisir.
- **TypeScript-first**: Tip destegi birinci sinif vatandastir, ek konfigurasyona gerek yoktur.

## Consequences
- Express middleware ekosisteminin buyuk bolumu dogrudan kullanilamaz; `@fastify/express` uyumluluk katmani veya Fastify-native alternatifler gerekir.
- Takim Express'e asina ise kisa sureli ogrenme egrisi olusur.
- Daha az Stack Overflow cevabi ve topluluk kaynaklari mevcuttur.

## Alternatives Considered
- **Express**: Daha buyuk ekosistem ve daha fazla middleware destegi. Ancak performans ve tip guvenligi gereksinimleri karsisinda yetersiz kalmistir.
- **Koa**: Minimalist yaklasim, ancak ekstra yapi gerektirir.
- **NestJS**: Fastify uzerinde kullanilabilir, fakat framework-level abstraction bu projede gereksiz gorulmustur.

> **Fastify ne zaman yanlis secim olur**: Express middleware'e bagli legacy projelerde migration maliyeti avantajlari asabilir.
