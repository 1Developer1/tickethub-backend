# ADR-012: argon2id for Password Hashing

## Status: Accepted

## Context
Kullanici parolalarinin guvenli saklanmasi icin uygun hashing algoritmasi secilmelidir. Brute-force ve GPU tabanli saldirilara karsi dayaniklilik temel gereksinimdir.

## Decision
Parola hashing icin **argon2id** kullanilmaktadir:
- **Memory-hard**: Her hash islemi icin 64 MB bellek tuketir; GPU/ASIC ile paralel saldiri maliyetini ciddi olcude arttirir.
- **Hybrid variant**: argon2id, argon2i (side-channel resistant) ve argon2d (GPU-resistant) avantajlarini birlestirir.
- **OWASP 2024 onerisi**: Guncel guvenlik standartlarina uyumludur.
- Parametreler: `memoryCost: 65536 (64 MB)`, `timeCost: 3`, `parallelism: 1`.

## Consequences
- Her hash islemi ~64 MB bellek tuketir; yogun kayit/giris anlarinda memory spike olusabilir. Rate limiting ile kontrol altina alinmalidir.
- Node.js'de `argon2` paketi native C binding gerektirir; CI/CD ortaminda build-tools yuklu olmalidir.
- Hash suresi bcrypt'e gore daha uzundur (~300ms vs ~100ms); ancak guvenlik kazanimi bunu karsilar.

## Alternatives Considered
- **bcrypt**: CPU-hard, uzun suredir standart. Ancak yalnizca CPU yogun; GPU ile paralel saldiri maliyet-etkin hale gelebilir. Bellek tuketimi sabittir (~4 KB).
- **scrypt**: Memory-hard, ancak parametre ayarlamasi daha karmasiktir ve OWASP tarafindan birincil oneri degildir.
- **PBKDF2**: FIPS uyumlu, ancak GPU ile kolayca paralellestirilir; modern tehdit modeline karsi yetersizdir.
