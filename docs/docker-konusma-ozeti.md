# Docker Konusma Ozeti — 20-21 Nisan 2026

Bu dokuman, TicketHub projesi uzerinden Docker'in temelleri, ic isleyisi, container iletisimi, sanal makine farklari, Linux namespace ve layer'lar, kernel syscall'lari ve CI/CD'de karsilasilan pratik hatalar uzerine yapilan kapsamli konusmalarin detayli ozetidir.

---

## Bolum 1: Docker Projede Nerede Ve Nasil Ayarlanir?

### 1.1 4 Ana Konfigurasyon Dosyasi

Projedeki tum Docker ayarlari 4 dosyada toplanir:

```
tickethub/
├── Dockerfile              ← Uygulamanin container image'ini nasil build ederiz
├── docker-compose.yml      ← Birden fazla container'i birlikte nasil calistiririz
├── .dockerignore           ← Image'a DAHIL EDILMEYECEK dosyalar
└── .github/workflows/ci.yml ← CI sirasinda Docker'in nasil calistirilacagi
```

Her birinin gorevi ayridir:

| Dosya | Ne yapar | Kim kullanir |
|---|---|---|
| Dockerfile | Uygulamadan "image" (template) olusturur | `docker build` |
| docker-compose.yml | Birden fazla container icin tarif | `docker compose up` |
| .dockerignore | `node_modules`, `.git` gibi gereksiz dosyalari image'a kopyalamayi onler | `docker build` |
| CI workflow | Otomatik build ve push | GitHub Actions |

### 1.2 Projenin 4 Container'i

TicketHub 4 container kullanir:

| Container | Image | Port | Amaci |
|---|---|---|---|
| tickethub-app | (kendi Dockerfile'imiz) | 3000 | Backend API |
| tickethub-postgres | `postgres:16-alpine` | 5432 | Ana veritabani |
| tickethub-redis | `redis:7-alpine` | 6379 | Cache, lock, BullMQ queue |
| tickethub-mailhog | `mailhog/mailhog` | 1025 / 8025 | SMTP + web UI (sadece dev) |

Uygulama **Dockerfile** ile build edilir (bizim kodumuz), digerleri **Docker Hub**'dan hazir image'lardir.

---

## Bolum 2: Image, Container ve Compose Kavramlari

### 2.1 Docker Image

Image = **uygulamanin ve ortaminin dondurulmus kopyasi**. Read-only template. Degismez (immutable).

```
Image = tarif / sablon / class
      = uygulaman icin gereken her sey: kod, runtime, kutuphane
      = node:20-alpine, postgres:16-alpine gibi
```

Bir image'i bir kez build edersin, sonra ondan istedigin kadar container olusturursun.

### 2.2 Docker Container

Container = **calisan bir image instance'i**. Class'tan uretilen object gibi.

```
Container = image'in calisan hali
          = kendi process'i, kendi belligi, kendi ag adresi var
          = baslatabilir, durdurulabilir, silinir

Image : Container  =  Class : Object
       =  Tarif : Pisirilmis yemek
       =  Plan : Bina
```

Ayni image'den 10 container olusturabilirsin; hepsi birbirinden bagimsiz calisir:

```
docker run postgres:16   → container #1
docker run postgres:16   → container #2 (farkli instance)
docker run postgres:16   → container #3 (farkli instance)
```

### 2.3 docker-compose.yml

Compose = **birden fazla container'i tanimlayan YAML dosyasi** ve aralarindaki iliskileri.

```yaml
services:
  postgres:
    image: postgres:16-alpine
    ports: ["5432:5432"]

  redis:
    image: redis:7-alpine
    ports: ["6379:6379"]
```

Compose olmasaydi:
```
docker run -d --name postgres -p 5432:5432 postgres:16-alpine
docker run -d --name redis -p 6379:6379 redis:7-alpine
docker run -d --name mailhog -p 8025:8025 mailhog/mailhog
→ 3 uzun komut, ezberlemesi zor
```

Compose ile:
```
docker compose up -d
→ Tek komut, hepsi birlikte baslar
```

### 2.4 Akis

```
Dockerfile  →  (docker build)  →  Image  →  (docker run)  →  Container
```

---

## Bolum 3: Container'lar Birbirleriyle Nasil Haberlesir?

### 3.1 Temel Iletisim: TCP

Container'lar **TCP** kullanir — standart ag protokolu. Docker yeni bir protokol icat etmez; sadece **sanal ag** saglar.

```
Container A ──── TCP pipe ──── Container B

TCP   = telefon hatti (veri nasil iletilir)
HTTP, SMTP, PG protokolu = hat uzerinden konusulan dil (ingilizce, turkce)
```

TCP iletim katmanidir; HTTP/Redis/Postgres gibi protokoller onun uzerinde calisir.

### 3.2 Projemizdeki Iletisim Haritasi

```
App container (port 3000)
  │
  ├── TCP :5432 → postgres container        (PostgreSQL wire protocol)
  ├── TCP :6379 → redis container           (Redis RESP)
  └── TCP :1025 → mailhog container         (SMTP)
```

**Her baglanti TCP uzerinden.** Uygulama protokolu degisir, transport ayni kalir.

### 3.3 Docker Sanal Aglari

Ayni `docker-compose.yml` icindeki container'lar **otomatik ortak bir aga** dahil olur. Servis ADI ile birbirine ulasirlar (DNS cozumlemesi Docker tarafindan yapilir):

```yaml
services:
  app:
    environment:
      DB_HOST: postgres        # IP degil, servis adi
      REDIS_HOST: redis
```

```
Container icinde:
  fetch("http://postgres:5432")   ✓ calisir (Docker DNS)
  fetch("http://redis:6379")      ✓ calisir

Bilgisayarindan (container disi):
  fetch("http://localhost:5432")  ✓ calisir (port mapping varsa)
  fetch("http://postgres:5432")   ✗ CALISMAZ (DNS yok)
```

### 3.4 Port Mapping (host ↔ container)

Docker Compose'da `ports: "5432:5432"` soyle calisir:

```
Laptop (host)              Container
  localhost:5432   ←→      postgres:5432

Laptop'tan uygulamandan:
  postgresql://localhost:5432/mydb   ✓ calisir

Baska container'dan:
  postgresql://postgres:5432/mydb    ✓ calisir (servis adi)
  postgresql://localhost:5432/mydb   ✗ CALISMAZ
    (localhost = container'in kendisi)
```

### 3.5 Neden TCP, Nerede UDP?

```
TCP (backend %99):
  ✓ Guvenilir (paket kaybolmaz)
  ✓ Sirali (paketler sirasiyla gelir)
  ✓ Connection-based (el sikismali)
  Kullanim: web, API, DB, cache, queue

UDP (backend'de nadir):
  ✗ Kayip olabilir, sira garantisi yok
  ✓ Cok hizli
  Kullanim: DNS, video stream, oyun
```

Backend gelistirici olarak %99 TCP kullaniyorsun.

---

## Bolum 4: Docker Desktop'ta VM Ve Ag Nerede Calisir?

### 4.1 Docker Desktop'i Actiginda Ne Olur?

```
1. Docker Desktop uygulamasi baslar (Windows RAM'i direkt kullanir ~500MB)
2. Gizli bir Linux VM'i baslatir (WSL2 ya da HyperKit)
3. VM kendi RAM chunk'ini alir (varsayilan ~2GB, ayarlanabilir)
4. Container'lar VM'in icinde calisir
```

```
Fiziksel Bilgisayar (16 GB RAM)
┌────────────────────────────────────────────┐
│ Windows 11 (host OS)         ~6 GB         │
│  ├── Chrome, VS Code                       │
│  └── Docker Desktop app      ~500 MB       │
│         │                                  │
│         ▼ baslatir                         │
│  ┌─────────────────────────────┐           │
│  │ Linux VM (WSL2)    ~2-4 GB  │           │
│  │  └── Docker Engine          │           │
│  │        ├── postgres  200MB  │           │
│  │        ├── redis      50MB  │           │
│  │        └── mailhog    30MB  │           │
│  └─────────────────────────────┘           │
└────────────────────────────────────────────┘
```

VM'in dosyalari:
```
Windows: C:\Users\<you>\AppData\Local\Docker\wsl\*.vhdx
macOS:   ~/Library/Containers/com.docker.docker/Data/vms/
Linux:   VM yok — container'lar host kernel'i dogrudan kullanir
```

### 4.2 Container Iletisimi Bilgisayarin Icinde

Docker, her container'a **sanal IP** verir (ornek 172.18.0.2). Bu IP'ler sadece Docker'in sanal agi icinde gecerli:

```
Redis container                     PostgreSQL container
  172.18.0.3  ─────────────────→     172.18.0.2
     │                                   │
     │      Docker'in sanal agi          │
     │      (RAM'de yasiyor)             │
     └───────────────────────────────────┘

Paket bilgisayarin ag kartina dokunmuyor — hepsi bellekte.
```

Container'lar **bilgisayarindan disari cikmaz** (dis internete baglanmadiklari surece). Her sey laptop'inin icinde olur.

---

## Bolum 5: Kernel Ve Docker Icin Anlami

### 5.1 Kernel Nedir?

Kernel = **isletim sisteminin cekirdegi**. Donanim ile uygulamalar arasindaki tercuman.

Kernel ne yapar:
1. Donanimla konusur (CPU, RAM, disk, ag karti)
2. Process'leri yonetir (hangi program CPU alir)
3. RAM dagitir (kim ne kadar alir)
4. Dosya sistemini yonetir
5. Guvenligi saglar (kim ne yapabilir)

```
OS = Kernel + Tools + UI + Apps

Linux OS:
  ├── Linux kernel (cekirdek)
  ├── bash, ls, cd (komut satiri)
  ├── GNOME / KDE (UI)
  └── Firefox, VS Code (uygulamalar)

Windows OS:
  ├── Windows NT kernel
  ├── PowerShell, cmd
  ├── Explorer (UI)
  └── Edge, Notepad
```

Uc farkli OS → uc farkli kernel → **birbirleriyle uyumsuz**. Linux app'i Windows kernel'inde calistiramazsin.

### 5.2 Docker Neden Linux Kernel'ine Ihtiyac Duyar?

Container'lar Linux kernel'inin ozel ozelliklerini kullanir:

```
1. Namespaces
   → Container'in ne gorebilecegini sinirlar
   → "Container A, Container B'nin dosyalarini GOREMEZ"

2. Cgroups (Control Groups)
   → Process basina kaynak limiti
   → "Container A max 2 GB RAM kullanabilir"

3. OverlayFS
   → Katmanli dosya sistemi
   → Docker image'lari kucuk tutar (katmanlar paylasilir)

4. Capabilities
   → Ince taneli izinler
   → "Bu container sistem saatini degistirEMEZ"
```

Bu ozellikler **Windows ve macOS kernel'inde YOK**. O yuzden:

```
Linux sunucuda (production):
  Container → host Linux kernel → direkt calisir
  VM YOK.

Windows/Mac'de (development):
  Container → Linux VM → Docker → container calisir
  VM VAR (zorunlu).
```

### 5.3 Docker Nasil Yazilmis?

Docker'in **kendisi Go dilinde** yazilmis (%95 Go). Shell komutlari calistirmaz; dogrudan Linux kernel'in syscall'larini cagirir:

```
Yanlis varsayim:
  docker run "unshare" komutunu calistirir

Dogru:
  docker → Go kodu → syscall.Unshare(CLONE_NEWNS | CLONE_NEWNET | ...)
         → kernel dogrudan isler (10 ms yerine 0.1 ms)
```

Kernel syscall'lari = kernel'in program arayuzu. Shell komutlari bunlarin sadece kullanici dostu kabugu.

---

## Bolum 6: Docker vs Sanal Makine

### 6.1 Karsilastirma Tablosu

| | Sanal Makine | Container |
|---|---|---|
| Boyut | GB'lar | MB'lar |
| Baslangic suresi | 30-60 saniye | 1 saniyeden az |
| RAM overhead | VM basi 1-2 GB | ~50 MB |
| Kendi kernel'i | EVET | HAYIR (host paylasilir) |
| Icinde OS | Tam OS | Sadece kutuphane |
| Izolasyon | Yuksek | Orta |
| Kullanim | Farkli OS calistir | Uygulama calistir |

### 6.2 Gorsel Karsilastirma

```
Sanal Makine (agir):
┌──────────────────────────────────┐
│ Laptop                           │
│  ┌──────────────────────────┐   │
│  │ VM 1 (2 GB RAM)          │   │
│  │  ├── Tam Linux OS         │   │
│  │  ├── Kernel              │   │
│  │  ├── Sistem servisleri    │   │
│  │  └── Uygulama             │   │
│  └──────────────────────────┘   │
│  ┌──────────────────────────┐   │
│  │ VM 2 (2 GB RAM)          │   │
│  │  ├── Tam Linux OS         │   │
│  │  ├── Kernel              │   │
│  │  └── Uygulama             │   │
│  └──────────────────────────┘   │
└──────────────────────────────────┘
2 uygulama = 4 GB RAM
Baslangic = 30-60 sn/VM


Container (hafif):
┌──────────────────────────────────┐
│ Laptop                           │
│  ├── Linux Kernel (paylasilan)  │
│  │                              │
│  ├── Container 1 (50 MB)        │
│  │   └── Uygulama                │
│  │                              │
│  └── Container 2 (50 MB)        │
│      └── Uygulama                │
└──────────────────────────────────┘
2 uygulama = 100 MB RAM
Baslangic = 1 sn'den az
```

### 6.3 Ne Zaman Hangisi?

```
Container (cogu backend is):
  ✓ Web server, API, DB, microservice
  ✓ Hizli baslangic
  ✓ Cok sayida instance
  ✓ Ayni kernel'i kullanabilen uygulamalar
  ✓ Cloud, Kubernetes, CI/CD

Sanal Makine:
  ✓ Farkli OS calistirmak (Linux'ta Windows app)
  ✓ Eski, ozel kernel gerektiren app
  ✓ Guvenlik kritik ise (tam izolasyon)
  ✓ Masaustu sanallastirma (VMware, VirtualBox)
```

### 6.4 Analoji

```
Sanal Makine = ayri apartman binasi
  ├── Kendi temeli, tesisati, elektrigi var
  ├── Tamamen bagimsiz
  └── Insa maliyeti yuksek

Container = ayni binada daire
  ├── Ortak temeli, tesisati, elektrigi (kernel)
  ├── Kendi duvari, kilitli kapisi var (izolasyon)
  ├── Ucuz ve hizli
  └── Binayi degistiremezsin (kernel'i degistiremezsin)
```

---

## Bolum 7: Projedeki Dockerfile Detaylari

### 7.1 Multi-Stage Build Nedir?

TicketHub'in Dockerfile'i 2 asamali. Neden?

```
Stage 1 (build):    TypeScript compile + tum devDependencies (~1 GB)
Stage 2 (production): Sadece compiled JS + prod dependencies (~150 MB)

Yapmasaydik: Production image'da TypeScript, Vitest, Biome gibi
  gereksiz araclar olurdu. Hem boyut hem guvenlik acisindan kotu
  (daha az attack surface daha iyi).
```

### 7.2 Ornek Dockerfile Yapisi

```dockerfile
# ── Stage 1: Build ──
FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts      # tum deps (dev dahil)
COPY prisma ./prisma
RUN npx prisma generate           # Prisma client uret
COPY tsconfig.json ./
COPY src ./src
RUN npm run build                 # TS -> JS compile

# ── Stage 2: Production ──
FROM node:20-alpine AS production
WORKDIR /app
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 tickethub
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts   # sadece prod deps
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY prisma ./prisma
COPY --from=builder /app/dist ./dist
RUN chown -R tickethub:nodejs /app
USER tickethub                    # non-root (guvenlik)
ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "dist/main.js"]
```

### 7.3 `FROM ... AS builder` ve `COPY --from=builder`

```
Stage 1: "builder" adini aldik
Stage 2: COPY --from=builder /app/dist ./dist
         → Stage 1'deki /app/dist klasorunu al, Stage 2'ye kopyala

Sonuc image'da sadece Stage 2 kalir.
Stage 1'deki 1 GB node_modules atilir.
```

---

## Bolum 8: CI/CD'de Karsilasilan Pratik Docker Hatalari

### 8.1 Hata: Exit Code 243 (Permission Denied)

**Hata:**
```
RUN npm ci --omit=dev
ERROR: failed to build: ... exit code: 243
```

**Sebep:** Dockerfile'da `USER tickethub` satiri, `npm ci` satirindan ONCE geliyordu. Tickethub kullanicisi `/app` klasorune yazamadigi icin npm ci patliyordu.

```dockerfile
USER tickethub              # tickethub kullaniciya gec
COPY package.json ./        # root olusturdugu icin izinsiz
RUN npm ci --omit=dev       # ❌ permission denied (243)
```

**Cozum:** Once npm ci'i root ile calistir, sonra chown + USER degistir:

```dockerfile
# USER tickethub HENUZ YOK — root olarak caliş
COPY package.json ./
RUN npm ci --omit=dev       # ✓ sorun yok
# Simdi sahipligi degistir ve kullaniciya gec:
RUN chown -R tickethub:nodejs /app
USER tickethub              # guvenlik korundu
```

**Ders:** Non-root kullaniciya gecmek GEREKIR (guvenlik icin) ama gecis noktasi onemli. Once dosyalari hazirla, sonra gec.

### 8.2 Hata: Exit Code 127 (Command Not Found)

**Hata:**
```
RUN npm ci --omit=dev
ERROR: ... exit code: 127
```

**Sebep:** `package.json`'da su var:
```json
"scripts": {
  "prepare": "husky"
},
"devDependencies": {
  "husky": "^9.1.7"
}
```

`npm ci` her calistiginda **prepare** lifecycle script'i otomatik calisir. Fakat:
- `--omit=dev` ile devDependencies kurulmuyor
- Husky kurulu degil
- `prepare` script'i `husky` komutunu calistirmaya calisiyor
- **Komut bulunamadi → exit 127**

**Cozum:**
```dockerfile
RUN npm ci --omit=dev --ignore-scripts
```

`--ignore-scripts` ile lifecycle script'leri (pre-install, postinstall, prepare, vb.) atlanir. Husky container'da gerekmez — sadece lokal geliştirme icin git hook'lari kurar.

**Ders:** Dev'e ozel araclar container'da kurulmamali. `--ignore-scripts` flag'i hem hizli hem guvenli.

### 8.3 Hata: GitHub Pages `Not Found`

**Hata:**
```
Error: Get Pages site failed.
Resource not accessible by integration
```

**Sebep:** GitHub Pages ayari hic acilmamis. Workflow Pages API'sine yazmaya calisiyor ama token'in yetkisi yok.

**Cozum 1:** Settings → Pages → Source: **GitHub Actions** sec. Manuel bir defa acilir.

**Cozum 2 (denenen):** Workflow'a `enablement: true` ekle:
```yaml
- uses: actions/configure-pages@v5
  with:
    enablement: true
```
Ama `GITHUB_TOKEN`'in bu izni yok → yine fail.

**Ders:** Bazi GitHub ayarlari **manuel** acilmak zorunda. Workflow herseyi yapamaz.

### 8.4 Hata: Lint — `any` kullanimi, non-null assertion

**Hata:** Biome CI `noExplicitAny` ve `noNonNullAssertion` kurallarini error seviyesinde caliştirir.

**Cozum yaklaşimi:**

1. **docs/ klasorunu biome ignore listesine ekle** — katalog dosyalari lint edilmesin:
```json
"files": {
  "ignore": ["node_modules", "dist", "docs/**"]
}
```

2. **Non-null assertion yerine type guard kullan**:
```typescript
// ❌ Non-null assertion (risky)
const userId = request.user!.sub;

// ✓ Type guard helper (safe)
const userId = requireUser(request).sub;

export function requireUser(request: FastifyRequest): JwtPayload {
  if (!request.user) throw new UnauthorizedError('Auth required');
  return request.user;
}
```

3. **`process.env` yerine type-safe config**:
```typescript
// ❌ Hem null olabilir hem string check yok
const secret = process.env.JWT_SECRET!;

// ✓ Zod ile merkezi config (tip garantisi)
const secret = config.JWT_SECRET;
```

**Ders:** Lint kurallari sadece kod standardi degil, **runtime hatalarini derleme zamanina tasir.** Non-null assertion `!` derleyiciye "guven bana" der; type guard ise "kontrol et ve garantile".

### 8.5 Hata: Security Audit — Nodemailer CVE

**Hata:**
```
8 vulnerabilities (4 moderate, 3 high, 1 critical)
```

**Cozum:** Breaking change olsa bile paketleri guncelle:
```bash
npm install nodemailer@latest testcontainers@latest
npm audit
```

**Ders:** `npm audit` duzenli calistirilmali. CVE'ler yigilinca cozmek zorlasir. CI'da `npm audit --audit-level=high` adimi koymak = her PR'da otomatik kontrol.

---

## Bolum 9: Docker Komutlari Cheat Sheet

### 9.1 Temel Komutlar

```bash
# Image
docker build -t myapp .           # Dockerfile'dan image build et
docker images                     # Tum image'lari listele
docker rmi <image>                # Image sil

# Container
docker run -p 3000:3000 myapp     # Container calistir, port esle
docker ps                         # Calisan container'lari listele
docker ps -a                      # Durmus olanlar dahil hepsi
docker stop <id>                  # Container durdur
docker rm <id>                    # Container sil
docker logs <id>                  # Container log'lari
docker exec -it <id> sh           # Container icine gir (shell)

# Compose
docker compose up -d              # Arka planda baslat
docker compose down               # Durdur ve sil
docker compose ps                 # Calisan servisleri goster
docker compose logs -f            # Canli log izle
docker compose restart <service>  # Tek servisi yeniden baslat

# Network
docker network ls                 # Tum Docker aglarini listele
docker network inspect <name>     # Agdaki container'lari goster
```

### 9.2 Projemizdeki Yaygin Kullanim

```bash
# Tum servisleri baslat
docker compose up -d

# Sadece postgres'i yeniden baslat
docker compose restart postgres

# App container'a gir
docker exec -it tickethub-app sh

# Postgres loglarini izle
docker compose logs -f postgres

# Tum container'lari durdur
docker compose down

# Volume'lari da sil (dikkat, DB verisi de gider!)
docker compose down -v
```

---

## Bolum 10: CI/CD'de Docker'in Yeri

### 10.1 `.github/workflows/` Klasoru

GitHub CI/CD yapilandirmasi bu klasordeki YAML dosyalarinda yasar:

```
.github/
└── workflows/
    ├── ci.yml         # Her push'ta test, build, audit
    └── pages.yml      # Sadece docs/ degisince Pages deploy
```

Her YAML dosyasi = **bir workflow**. Workflow = **jobs**. Job = **steps**. Step = **komut veya action**.

### 10.2 Projemizdeki CI Jobs

```
ci.yml
  ├── lint-and-typecheck  (kod kalitesi)
  ├── unit-test           (55 test, coverage)
  ├── integration-test    (gercek DB + Redis)
  ├── build               (TS compile + Docker image)
  └── dependency-audit    (npm audit)
```

Jobs arasi **bagimlilik** var: integration-test, unit-test'e bagimli (once unit-test gecmeli). `needs:` anahtar kelimesi ile tanimlanir.

### 10.3 Runners (`runs-on`)

```yaml
runs-on: ubuntu-latest    # Linux (en yaygin, en ucuz)
runs-on: windows-latest   # Windows (2x daha pahali)
runs-on: macos-latest     # macOS (10x daha pahali, iOS build icin)
runs-on: self-hosted      # Kendi sunucun (ucretsiz ama bakim senin)
```

Backend projeleri icin **ubuntu-latest** yeterli. Docker, Node.js, PostgreSQL, Redis — hepsi Linux'ta native calisir.

### 10.4 Docker CI'da Nasil Kullanilir?

```yaml
integration-test:
  services:
    postgres:
      image: postgres:16-alpine    # GitHub otomatik kaldirir
      ports: [5432:5432]
    redis:
      image: redis:7-alpine
      ports: [6379:6379]
  steps:
    - uses: actions/checkout@v4
    - run: npm ci
    - run: npx vitest run --config vitest.integration.config.ts

build:
  steps:
    - uses: actions/checkout@v4
    - run: docker build -t tickethub:${{ github.sha }} .
```

`services:` = GitHub her job icin otomatik Docker container kaldirir. Sen baslatmaya ugraşmazsin.

---

## Bolum 11: Sorular ve Cevaplar

### 11.1 "Container'lar bilgisayarimin RAM'ini mi kullaniyor?"

Evet, ama dolayli:
1. Docker Desktop app → Windows RAM'ini direkt (~500 MB)
2. Linux VM → Windows'un VM icin ayirdigi RAM (~2-8 GB)
3. Container'lar → VM'in RAM'inden

Tum RAM sonunda fiziksel bilgisayarindan geliyor. Docker sadece katmanlar ekliyor (Windows → VM → container).

### 11.2 "Container'lar bilgisayarimdan disari cikiyor mu?"

Hayir. Tum iletisim Docker'in sanal agi icinde RAM'de olur. Dis internete cikmadiklari surece ag kartina bile dokunmaz.

### 11.3 "Docker Linux kernel kullaniyor dedin, peki Windows'da nasil calisiyor?"

Docker Desktop Windows'da **gizli bir Linux VM** baslatir (WSL2). Container'lar o VM'in icindeki Linux kernel'i kullanir. Bu bir "workaround" — Linux sunucuda VM yok, container'lar host kernel'i kullanir.

### 11.4 "Container VM'e benziyor, ayni sey mi?"

Hayir. VM = tam OS (kendi kernel'i). Container = izole process (host kernel'i paylaşir). Container 10-100x daha hafif ve hizli.

### 11.5 "Docker shell komutlari calistiriyor mu?"

Hayir. Docker Go dilinde yazilmis bir program. Linux kernel'in syscall'larini dogrudan cagirir (unshare, mount, setns vb.). Shell komutlari (`unshare`, `mount`) bu syscall'larin sadece kullanici dostu kabugu.

### 11.6 "Dockerfile'da neden iki kez `npm ci` var?"

Multi-stage build. Stage 1'de tum dependencies (devDeps dahil) kurulur — TypeScript compile icin. Stage 2'de sadece production dependencies kurulur — runtime icin. Stage 1'in 1 GB'lik node_modules'u son image'a girmez.

### 11.7 "Projemizin container'lari hangileri?"

4 tane:
1. **tickethub-app** — Node.js backend (Dockerfile'dan)
2. **tickethub-postgres** — ana veritabani
3. **tickethub-redis** — cache + queue + lock
4. **tickethub-mailhog** — dev icin sahte SMTP

App disinda hepsi Docker Hub'dan hazir image'lar.

---

## Bolum 12: Ozet Kurallari

1. **Image = template, Container = calisan instance.** Biri read-only, digeri mutable.
2. **docker-compose.yml = birden fazla container icin tarif.** Servis adiyla birbirine ulasirlar.
3. **TCP her seydir.** HTTP, Redis RESP, PG wire protokolu — hepsi TCP uzerinde.
4. **Docker Desktop Windows'da Linux VM kullanir.** Linux sunucuda VM yok.
5. **Kernel donanimla app arasinda tercuman.** Container'lar host kernel'i paylasir, VM'ler kendi kernel'ini tasir.
6. **Namespaces + cgroups + overlayfs = container'in temeli.** Linux kernel ozellikleri. Windows/macOS kernel'inde yok.
7. **Multi-stage build = kucuk image.** Build araclari production image'a girmemeli.
8. **Non-root kullanici zorunlu.** Ama user switch dogru sirada olmali (once dosya hazirla, sonra gec).
9. **`--ignore-scripts` container'da kullan.** Husky, prepare gibi dev script'leri gerekmez.
10. **npm audit CI'da calistir.** CVE'ler yigilmasin.
11. **`runs-on: ubuntu-latest` = %99 durum.** Windows/macOS runner'lari pahali ve gereksiz.
12. **Docker Pages bazen manuel acilir.** Automation herseyi yapamaz.

---

## Bolum 13: Docker'in Asil Amaci — Tutarlilik, Simulasyon Degil

### 13.1 Yaygin Yanlis Anlama

Yaygin yanilgi: *"Docker uygulamami farkli ortamlarda test etmek icin"*

**Dogru:** Docker tam tersini yapar — tum ortamlari **AYNI** yaparak test guvenilirligini saglar.

```
Docker OLMADAN:
  Developer A'nin laptop'i:  Node.js 18, Linux, postgres 14
  Developer B'nin laptop'i:  Node.js 20, macOS, postgres 16
  Test sunucusu:             Node.js 16, Ubuntu, postgres 13
  Production sunucu:         Node.js 18, Debian, postgres 15

  Sonuc: "Benim makinemde calisiyor!" hatasi.
         Production'da dev'de olmayan hatalar ciktar.

Docker ILE:
  Developer A:      Docker → Node 20, Alpine, postgres 16
  Developer B:      Docker → Node 20, Alpine, postgres 16
  Test sunucusu:    Docker → Node 20, Alpine, postgres 16
  Production:       Docker → Node 20, Alpine, postgres 16

  Sonuc: Her yerde AYNI ortam. Docker'da calistiysa
         production'da da calisir.
```

### 13.2 Environment Farkliliklari

"Farkli environment" = "Farkli deployment asamalari", farkli OS'ler degil:

```
Development (laptop):       kod yaz, mock data, hot reload
Staging (cloud):            QA test, gercek-benzeri veri
Production (cloud):         gercek kullanici, gercek veri

Ucu de AYNI Docker container'i calistirir.
Sadece environment variable'lar degisir:
  - DB baglantisi
  - API key'ler
  - Log seviyesi
  - Olcek (1 instance vs 100)
```

```
Ayni Docker image: tickethub:v1.5

  ┌──────────────────────────────────────────┐
  │ Laptop                                   │
  │ tickethub:v1.5 + dev DB + .env.dev       │
  └──────────────────────────────────────────┘
                │ git push
                ▼
  ┌──────────────────────────────────────────┐
  │ Staging (AWS)                            │
  │ tickethub:v1.5 + staging DB              │
  └──────────────────────────────────────────┘
                │ QA approved
                ▼
  ┌──────────────────────────────────────────┐
  │ Production (AWS)                         │
  │ tickethub:v1.5 + prod DB                 │
  └──────────────────────────────────────────┘

Ayni kod, ayni OS, ayni baglantilar.
Sadece konfigurasyon degisir.
```

### 13.3 Gercek Farkli OS Testi — Matrix Testing

Farkli OS'ler (Windows + Mac + Linux) test etmek istiyorsan Docker **yardim etmez** — gercek OS'ler gerekir:

```yaml
# .github/workflows/ci.yml
jobs:
  test:
    strategy:
      matrix:
        os: [ubuntu-latest, windows-latest, macos-latest]
        node: [18, 20, 22]
    runs-on: ${{ matrix.os }}
```

Bu 9 kez calistirir (3 OS × 3 Node). Docker burada yok — gercek runner'lar.

**Docker ≠ test tool. Docker = consistency tool.**

---

## Bolum 14: Docker'in Somut Yapabildikleri — 10 Madde

### 14.1 Tek Cumle Tanimi

*"Docker uygulamani + ihtiyac duyduklarini tek bir kutuya paketler, her yerde ayni sekilde calistirir."*

### 14.2 Somut Yetenekler

```
1. Tutarli paketleme
   → Dockerfile yaz, herkes ayni Node/dep/kodu alir.

2. Cakisma olmadan coklu uygulama
   → App A Node 16, App B Node 20. Ayni laptop'ta sorunsuz.

3. Hazir yazilimi kolayca calistirma
   → PostgreSQL kurmak 1 saat vs "docker run postgres:16" 10 saniye.

4. Uygulamayi bilgisayarlar arasi tasima
   → docker push/pull ile image paylasilir. Ayni davranis garanti.

5. Eski bagimliliklarla eski yazilim calistirma
   → Legacy app Node 10 istiyor? Container'da olsun, laptop'un Node 20.

6. Uygulamalari birbirinden izole etme
   → A cokerse B etkilenmez. A guvenlik bug'i B dosyalarini okuyamaz.

7. Olceklemek icin cok kopya calistirma
   → 1 kullanici = 1 container. 1000 kullanici = 100 container.

8. DB islemlerini guvenli test etme
   → Taze postgres container kaldir, test et, at. Prod DB'ye dokunma.

9. Yerelde gercek servislerle gelistirme
   → "docker compose up" → PostgreSQL + Redis + SMTP 30 saniyede.

10. Uygulamani baskalari ile kolayca paylasma
    → "docker run myapp" ile baskasi 30 saniyede calistirir.
```

### 14.3 Konteyner Analojisi

Docker = **yazilim icin tasima konteyneri**.

```
1956 oncesi: Her kargo gemisi farkli yuklenirdi — kutular, variller, cuvallar.
             Yavas, pahali, hataya acik.

1956 sonrasi: Her konteyner AYNI BOYUTTA. Her gemi, her kamyon, her vinç
              kaldirabilir. Dunya cap li akici kargo.

Docker ayni seyi yazilim icin yapar:
  Docker oncesi: Her uygulama farkli deploy edilirdi.
  Docker sonrasi: Her uygulama ayni sekilde deploy edilir (container olarak).
```

---

## Bolum 15: Docker Hangi Linux Ozelliklerini Kullanir?

### 15.1 Docker Linux Komutlari Kullanmaz, Linux SYSCALL'lari Kullanir

Yaygin yanilgi: *"Docker `unshare`, `mount`, `chroot` komutlarini calistiriyor."*

**Dogru:** Docker Go dilinde yazilmis bir program. Linux kernel'in **syscall**'larini dogrudan cagirir — shell komutlarini atlar (daha hizli ve guvenli).

```
Shell komutu (yavas, kirilgan):
  → yeni shell process'i baslat → arg parse → kernel'e git → text parse
  = ~10 ms

Direkt syscall (hizli, guvenilir):
  → Go kodu → kernel fonksiyonu → geri don
  = ~0.1 ms

100x daha hizli. Metin parse hatasi yok.
```

### 15.2 Docker'in Kullandigi Linux Kernel Ozellikleri

```
Kernel ozelligi        Docker ne icin kullanir
─────────────────────  ──────────────────────────────────
Namespaces             Container izolasyonu (process, ag, dosya)
Cgroups                Kaynak limitleri (CPU, RAM, disk)
OverlayFS              Katmanli dosya sistemi (kucuk image'lar)
Capabilities           Ince taneli izinler
Seccomp                Syscall filtreleme (guvenlik)
Network bridges        Container-to-container network
iptables               Port forwarding, firewall
chroot                 Dosya sistemi izolasyonu
```

**Her Docker ozelligi bir Linux kernel ozelligine haritalanir.** Docker izolasyonu icat etmedi — Linux'un zaten sahip oldugunu kullanildi.

### 15.3 Docker Feature → Linux Feature Haritasi

```
Docker ne yapar                           Linux ile nasil yapar
────────────────────────────────────────  ──────────────────────────
"Her container'in kendi process listesi"  PID namespace
"Container'da RAM max 2 GB"               Cgroups memory controller
"Container host dosyalarini goremesin"    Mount namespace + chroot
"Container'lar sanal ag uzerinden konus"  Network namespace + veth
"Port 3000 → container port 3000"         iptables NAT rules
"Image katmanlari (kucuk image)"          OverlayFS (union mount)
"Container kernel ayarini degistiremez"   Capabilities (CAP_SYS_ADMIN drop)
"Sadece guvenli syscall'lar"              Seccomp BPF filters
```

### 15.4 Linux Olmasaydi Docker Olur Muydu?

**Hayir, bugunki hali olmaz.** Docker'in temeli 2006-2013 arasi eklenen Linux kernel ozellikleri:

```
Kernel ozelligi       Yil      Docker kullanimi
──────────────────    ─────    ──────────────────────
Namespaces            2006     Izolasyon
Cgroups               2007     Kaynak limitleri
User namespaces       2013     Rootless container
OverlayFS             2014     Image katmanlari
```

2013'ten once Linux'ta bu ozellikler vardı ama dagnik ve kullanmasi zordu. Docker (2013) bunlari **kolay** yaptı.

Namespace/cgroups olmasaydi: developer'lar hala VM (1-2 GB, yavas boot) kullanirdi. "Hafif container" devrimi Linux namespace'lerini gerektiriyordu.

---

## Bolum 16: Docker Layer'lari — Ne Ise Yararlar?

### 16.1 Layer Nedir?

Layer = **bir dosya degisiklikleri kumesi**. Dockerfile'daki her komut bir layer olusturur.

```dockerfile
FROM node:20-alpine          ← Layer 1: base image (Alpine + Node)
COPY package.json /app/      ← Layer 2: package.json eklendi
RUN npm install              ← Layer 3: node_modules/ eklendi
COPY src/ /app/              ← Layer 4: kaynak kod eklendi
CMD ["node", "/app/index.js"] ← Metadata (file layer degil)
```

Her layer **sadece onceki layer'dan farki** saklar:

```
Layer 1: /bin/*, /etc/*, /usr/bin/node  (150 MB)
Layer 2: /app/package.json              (2 KB)
Layer 3: /app/node_modules/*            (80 MB)
Layer 4: /app/src/*                     (500 KB)

Toplam image: 230 MB (230 × 4 degil)
```

### 16.2 Layer'larin 3 Faydasi

**1. Caching (hizli rebuild):**
```
Ilk build:
  Layer 1 → build (Node indirir)      [10 sn]
  Layer 2 → build (package.json)      [0.1 sn]
  Layer 3 → build (npm install)        [60 sn]
  Layer 4 → build (src/)               [0.5 sn]
  TOPLAM:                              70 sn

Sadece src/ degisince rebuild:
  Layer 1 → CACHED ✓                   [0 sn]
  Layer 2 → CACHED ✓                   [0 sn]
  Layer 3 → CACHED ✓                   [0 sn]
  Layer 4 → rebuild                    [0.5 sn]
  TOPLAM:                              0.5 sn
```

Bu yuzden `COPY package.json` `COPY src/`'den ONCE yazilir — dependencies degismezse yeniden install olmaz.

**2. Paylasim (kucuk indirme):**
```
3 app, hepsi node:20-alpine base kullanir:
  Docker base'i DISK'TE 1 KEZ saklar.
  Disk: 150 MB (base) + her app'in kendi katmani
  
Layer olmadan: her app icin base'i ayri kopyalar.
Disk 3x daha buyuk olurdu.
```

**3. Guvenlik Tarama:**
Her layer ayri ayri CVE taranabilir. Base'de bug varsa sadece base guncellenir.

### 16.3 Gorsel

```
┌────────────────────────────┐
│ Layer 4: /app/src/         │  ← Sik degisir
├────────────────────────────┤
│ Layer 3: /app/node_modules │  ← Bazen degisir
├────────────────────────────┤
│ Layer 2: /app/package.json │  ← Nadiren degisir
├────────────────────────────┤
│ Layer 1: Alpine + Node     │  ← Neredeyse hic degismez
└────────────────────────────┘
        Container gorunumu:
        tek bir birlesmis dosya sistemi
```

---

## Bolum 17: Linux Namespace — Container'in Temeli

### 17.1 Namespace Nedir?

Namespace = **process'e sistem kaynaklarinin kendi gorunumunu** veren Linux kernel ozelligi.

Process'in taktigi **gozluk** gibi dusun — ne gordugunu degistirir.

```
Namespace OLMADAN:
  Tum process'ler goruniur (ps her seyi listeler)
  Tek ag interface listesi
  Tek hostname
  Tek /tmp klasoru

Namespace ILE:
  Process A kendi listesini gorur
  Kendi ag interface'ini gorur
  Kendi hostname'ini gorur
  Kendi /tmp'sini gorur
  "Ben tek basimayim!" hisseder
```

### 17.2 7 Namespace Tipi

```
PID namespace:    Kendi process listesi (kendi PID 1)
NET namespace:    Kendi ag interface, IP, port
MNT namespace:    Kendi mount noktalari, FS gorunumu
UTS namespace:    Kendi hostname
IPC namespace:    Kendi inter-process iletisim kanallari
USER namespace:   Kendi user ID'leri (icerde root, disarda normal)
TIME namespace:   Kendi saati (nadiren)
CGROUP namespace: Kendi kaynak limit gorunumu
```

Docker **her container icin hepsini** kullanir.

### 17.3 Somut Ornek

```bash
# Laptop'ta tum process'ler:
$ ps aux
USER  PID  COMMAND
root  1    /sbin/init
chrome 2345 /usr/bin/chrome
...
(binlerce process goruniur)

# Container icinde (yeni PID namespace):
$ docker run -it alpine sh
# ps aux
USER  PID  COMMAND
root  1    sh              ← shell container'da PID 1!
root  7    ps aux
(sadece bu 2 process)
```

Ayni process'ler host'ta da var. Container **goremiyor**.

Ayni sey network icin:
```bash
# Laptop:
$ ip addr
eth0: 192.168.1.10

# Container icinde:
# ip addr
eth0: 172.18.0.2    ← sadece container'in kendi interface'i
```

---

## Bolum 18: Docker Komutlari = Linux Dosya Sistemi Islemleri

### 18.1 Her Docker Komutu Linux'ta Ne Yapar?

Docker komutlari `/var/lib/docker/` altindaki dosyalari okur/yazar ve kernel syscall'larini cagirir:

```
Komut                     Linux'ta ne olur
───────────────────────   ─────────────────────────────────────
docker pull nginx         /var/lib/docker/overlay2/<hash>/diff/ indirir

docker run nginx          /var/lib/docker/overlay2/<container-hash>/ olusturur
                          Namespace'ler olusturur (kernel RAM'de)
                          Yeni process baslatir (process table'a eklenir)

docker build -t myapp .   Birden fazla layer olusturur:
                          /var/lib/docker/overlay2/<layer1>/
                          /var/lib/docker/overlay2/<layer2>/...
                          Manifest kaydeder

docker stop <id>          Process'e SIGTERM gonderir
                          Cgroup kalir (tekrar baslayabilir)

docker rm <id>            Siler:
                          /var/lib/docker/containers/<id>/
                          /var/lib/docker/overlay2/<container-hash>/

docker volume create      /var/lib/docker/volumes/<name>/_data/ olusturur

docker network create     ip link ile bridge ekler
                          iptables kurallari ekler

docker image prune        Kullanilmayan layer'lari siler
```

**Her Docker komutu = gercek dosya sistemi + kernel degisiklikleri.** Hicbir sey "sahte" degil.

### 18.2 Docker Klasor Yapisi

```
/var/lib/docker/
├── overlay2/              ← TUM dosyalar (kod, node_modules, OS libs)
│   ├── <image-hash-1>/
│   │   ├── diff/          ← gercek dosyalar
│   │   ├── lower          ← parent layer referansi
│   │   └── work/          ← overlay metadata
│   └── ...
│
├── containers/            ← container metadata + loglar
│   └── <container-id>/
│       ├── config.v2.json
│       ├── hostconfig.json
│       └── <id>-json.log  ← container loglari
│
├── image/                 ← image metadata
├── network/               ← network configs
└── volumes/               ← persistent data
    └── <volume>/_data/
```

**Container calistiginda** sadece bir Linux process'i:

```bash
docker inspect <container-id> | grep Pid
# PID 12345

ls /proc/12345/ns/
# Container'in namespace'leri:
ipc -> ipc:[4026532289]
mnt -> mnt:[4026532287]
net -> net:[4026532290]
pid -> pid:[4026532288]
uts -> uts:[4026532286]
```

---

## Bolum 19: Container Olustuguunda Ne Olur — 10 Adim

`docker run -d -p 3000:3000 --name myapp mynodeapp` yazinca olanlar:

```
ADIM 1: Docker CLI komutu alir
──────────────────────────────
  docker CLI parse eder, daemon'a (dockerd) gonderir
  /var/run/docker.sock uzerinden.

ADIM 2: Daemon image'i kontrol eder
──────────────────────────────────
  dockerd: "mynodeapp image'im var mi?"
  Yerde: /var/lib/docker/image/overlay2/imagedb/
  
  VARSA: kullan
  YOKSA: Docker Hub'dan pull et

ADIM 3: Dosya sistemi hazirla
─────────────────────────────
  dockerd container-ozel klasor olusturur:
    /var/lib/docker/overlay2/<container-id>/
    ├── lower/   (read-only image layers)
    ├── upper/   (container'a ozel writable layer)
    ├── work/    (overlay metadata)
    └── merged/  (birlesmis gorunum)
  
  Syscall: mount -t overlay overlay -o lowerdir=... upperdir=...
  Artik /merged tam bir file system gibi goruniur.

ADIM 4: Namespace'ler olustur
─────────────────────────────
  Syscall: clone(CLONE_NEWPID | CLONE_NEWNET | CLONE_NEWNS |
                 CLONE_NEWUTS | CLONE_NEWIPC | CLONE_NEWUSER, ...)
  
  Kernel yeni namespace'ler olusturur:
    /proc/<pid>/ns/pid  → yeni pid namespace
    /proc/<pid>/ns/net  → yeni net namespace
    ...

ADIM 5: Networking kur
─────────────────────
  Sanal ethernet cifti olustur:
    - veth123 host'ta, docker0 bridge'e bagli
    - veth456 container'in net namespace'ine tasinir
  
  Container IP: 172.18.0.2
  iptables kurali: host:3000 → 172.18.0.2:3000

ADIM 6: Cgroup'lar kur
──────────────────────
  /sys/fs/cgroup/docker/<container-id>/ olustur
  Limit yaz (varsa):
    memory.limit_in_bytes
    cpu.shares
  Process'i cgroup'a ekle:
    echo <pid> > cgroup.procs

ADIM 7: Guvenlik uygula
───────────────────────
  Tehlikeli capability'leri kaldir (modul yukleme, saati degistirme, ...)
  Seccomp filtresi uygula (tehlikeli syscall'lari engelle)

ADIM 8: Root degistir
────────────────────
  Syscall: pivot_root("/merged", "...")
  Container process'i /merged'i "/" olarak gorur
  Host dosya sistemi erisimi yok.

ADIM 9: Komutu calistir
──────────────────────
  Syscall: execve("/usr/local/bin/node", ["node", "/app/index.js"], env)
  Uygulama calismaya basladi!
  Icerden: PID 1, sadece kendini gorur
  Disardan: izole namespace'lerle normal Linux process

ADIM 10: Docker donus yap
─────────────────────────
  /var/lib/docker/containers/<id>/ klasorune yazar:
    config.v2.json
    <id>-json.log (log toplamaya baslar)
  
  -d flag oldugundan dockerd process'ten ayrilir
  CLI container ID'yi basar, prompt'a doner
```

### 19.1 Zaman Cizelgesi

```
T=0   ms   docker run yazildi
T=10  ms   CLI daemon'a istek gonderdi
T=20  ms   Image bulundu (/var/lib/docker/)
T=50  ms   OverlayFS mount edildi
T=80  ms   Namespace'ler olusturuldu
T=100 ms   Network baglandi
T=120 ms   Cgroups yazildi
T=150 ms   Guvenlik filtreleri
T=170 ms   pivot_root
T=200 ms   Uygulama (node index.js) baslatildi
T=250 ms   CLI container ID bastirdi

Toplam: 250 ms (ceyrek saniye)
```

**VM boot 30-60 saniye. Container 0.25 saniye.** 100-200x fark.

---

## Bolum 20: Docker vs Linux — Sayisal Karsilastirma

### 20.1 Ayni Isi Yapmanin Iki Yolu

"Izole Node.js sunucusu calistir" gorevi:

```
LINUX (pure, hicbir sey yok):
─────────────────────────────

# 1. Minimal Linux root indir
wget https://alpinelinux.org/.../rootfs.tar.gz
mkdir /mycontainer && tar -xzf rootfs.tar.gz -C /mycontainer

# 2. Node kur
chroot /mycontainer apk add nodejs

# 3. Kodu kopyala
cp -r /my-app/* /mycontainer/app/

# 4. Namespace'ler
unshare --pid --net --mount --uts --ipc --fork /bin/bash

# 5. Cgroups
mkdir /sys/fs/cgroup/memory/mycontainer
echo 500000000 > .../memory.limit_in_bytes
echo $$ > .../cgroup.procs

# 6. Network (veth pair, bridge, namespace)
ip link add veth0 type veth peer name veth1
ip netns add myns
ip link set veth1 netns myns
# ... iptables NAT kurallari ...

# 7. chroot
mount -t proc proc /mycontainer/proc
chroot /mycontainer

# 8. App calistir
node /app/index.js

# TOPLAM: 50+ satir, her satir hata potansiyeli
```

```
DOCKER ILE:
───────────

docker run -p 3000:3000 mynodeapp

# TOPLAM: 1 satir.
```

**Docker = Linux kernel ozelliklerini otomatize eden Go program.** Kernel gercek isi yapar, Docker kullanilabilir hale getirir.

### 20.2 Bu Dokumanda Ogrenilen 5 Ana Fikir

```
1. Docker tutarlilik aracidir (simulasyon degil).
   Tum environment'lari AYNI yapar, farkli ortamlari simule etmez.

2. Docker Go dilinde yazilmis, Linux kernel syscall'larini dogrudan cagirir.
   Shell komutlari calistirmaz — 100x daha hizli.

3. Namespace'ler izolasyonun temelidir.
   Her container kendi gozluguyle sistemi gorur.

4. Layer'lar cache + paylasim saglar.
   Dockerfile'da az degisen seyleri uste, cok degiseni alta koy.

5. Container = izole namespace + cgroups + chrooted filesystem'li process.
   VM degil. Host kernel'i paylasan bir Linux process'i.
```

---

*Bu dokuman, TicketHub projesi uzerinden yapilan kapsamli Docker, container iletisimi, sanal makine, kernel, Linux namespace'leri, layer'lar ve CI/CD pratik hatalari konusmalarinin ozetidir.*
*Olusturulma tarihi: 21 Nisan 2026*
