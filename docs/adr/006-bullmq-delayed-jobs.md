# ADR-006: BullMQ Delayed Jobs for Reservation Expiry

## Status: Accepted

## Context
Kullanici koltuk rezervasyonu yaptiktan sonra belirli bir sure icinde odeme yapmazsa rezervasyon otomatik iptal edilmelidir. Bu surec icin zamanlanmis is (scheduled job) mekanizmasi gereklidir.

## Decision
BullMQ delayed job mekanizmasi kullanilmaktadir:
- Rezervasyon olusturuldiginda, suresi kadar geciktirilmis bir job queue'ya eklenir.
- Sure doldigunda job calısır ve odenmemis rezervasyonu iptal eder.
- **O(1) karmasiklik**: Her job tam zamaninda tek bir rezervasyon icin calisir.

## Consequences
- Redis bagimliligi eklenir (BullMQ Redis uzerinde calisir; zaten distributed lock icin Redis mevcuttur).
- Job failure durumunda retry mekanizmasi konfigüre edilmelidir.
- Queue monitoring icin BullMQ Dashboard veya bull-board entegrasyonu gerekir.
- Redis restart durumunda persist edilmemis job'lar kaybolabilir; Redis persistence (AOF/RDB) aktif olmalidir.

## Alternatives Considered
- **Cron job**: Belirli araliklarla tum rezervasyonlari tarar. O(N) karmasiklik — her calistiginda binlerce kaydi kontrol eder. Suresi dolmus olanlar icin gecikme olusabilir (cron araliğina bagli).
- **setTimeout (in-process)**: Server restart'ta kaybolur, multi-instance'da calismaz.
- **PostgreSQL `pg_cron`**: Database seviyesinde cron; ancak yine tum kayitlari tarama yaklasimidir.
