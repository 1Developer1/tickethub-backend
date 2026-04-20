# TicketHub Multi-Stage Production Build
#
# NEDEN MULTI-STAGE?
# Stage 1 (build): TypeScript compile + tüm devDependencies (~1GB)
# Stage 2 (production): Sadece compiled JS + production dependencies (~150MB)
# Yapmasaydık: Production image'da TypeScript, Vitest, Biome gibi gereksiz araçlar olurdu.
# Hem boyut (1GB vs 150MB) hem güvenlik (daha az attack surface) açısından kötü.

# ── Stage 1: Build ──
FROM node:20-alpine AS builder

WORKDIR /app

# Önce dependency dosyalarını kopyala (Docker cache layer — sadece package.json değişince rebuild)
COPY package.json package-lock.json ./
RUN npm ci

# Prisma schema'yı kopyala ve generate et (client oluştur)
COPY prisma ./prisma
RUN npx prisma generate

# Kaynak kodu kopyala ve compile et
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# ── Stage 2: Production ──
FROM node:20-alpine AS production

WORKDIR /app

# Güvenlik: non-root kullanıcı oluştur (henüz switch yapma)
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 tickethub

# Sadece production dependencies (root olarak kur, izin sorunu olmasın)
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Prisma client (builder'dan)
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY prisma ./prisma

# Compiled JavaScript (builder'dan)
COPY --from=builder /app/dist ./dist

# Sahipliği tickethub'a ver ve kullanıcıyı değiştir (güvenlik)
RUN chown -R tickethub:nodejs /app
USER tickethub

ENV NODE_ENV=production
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

CMD ["node", "dist/main.js"]
