# TicketHub Frontend

React + Vite + TypeScript frontend for the [TicketHub backend](../README.md). obilet.com-inspired design adapted for event ticketing (concerts, theater, sports, festivals).

```
React 19 · Vite 6 · TypeScript · Tailwind CSS
React Router 7 · TanStack Query 5 · Zustand · axios · Zod
```

## Features

- 🏠 **HomePage** — hero search, category tabs, featured events carousel
- 🔍 **Event browse** — filters (category, city, date), search, pagination-ready
- 🎫 **Event detail** — venue info, live pricing (30s refresh), interactive seat map
- 💺 **Seat selection** — dynamic grid from venue.seatLayout JSON, max 6 seats
- 🔐 **Auth** — JWT + refresh token rotation, persisted in localStorage
- ⏱ **Checkout** — 10-minute countdown timer (red when < 2min)
- 💳 **Payment** — mock card form with Zod validation
- 📱 **Tickets** — QR code display, PNG download
- 📐 **Responsive** — mobile-first, works at 375px

## Quick Start

Prerequisites: Node.js 20+, backend running on `http://localhost:3000`.

```bash
# From nodejsProje/frontend directory:
npm install
npm run dev
```

Open http://localhost:5173.

## Environment

`.env` (auto-loaded by Vite):

```
VITE_API_URL=http://localhost:3000/api/v1
```

Vite's dev server also proxies `/api/*` to `http://localhost:3000` so CORS is not an issue in development.

## Full Stack Setup

```bash
# Terminal 1 — Infrastructure
cd nodejsProje
docker compose up -d

# Terminal 2 — Backend
cd nodejsProje
npx prisma db push                                     # first time only
npx tsx prisma/seed.ts                                 # seed test data
node --env-file=.env --import=tsx src/main.ts          # runs on :3000

# Terminal 3 — Frontend
cd nodejsProje/frontend
npm run dev                                            # runs on :5173
```

## Demo Credentials

Seeded by `prisma/seed.ts`:

```
user@tickethub.com      / User123!@#       → USER role
organizer@tickethub.com / Organizer123!@#  → ORGANIZER role
admin@tickethub.com     / Admin123!@#      → ADMIN role
```

## Folder Structure

```
src/
├── main.tsx             — entry + QueryClient + RouterProvider + Toaster
├── App.tsx              — Outlet layout with Header/Footer
├── router.tsx           — all routes + ProtectedRoute wrapping
├── api/                 — axios wrappers per backend module
│   ├── client.ts        — axios instance, JWT interceptor, 401 refresh
│   ├── auth.ts
│   ├── events.ts
│   ├── venues.ts
│   ├── bookings.ts
│   ├── payments.ts
│   ├── pricing.ts
│   └── tickets.ts
├── types/               — TypeScript interfaces mirroring backend DTOs
├── stores/
│   └── authStore.ts     — Zustand + persist (localStorage)
├── hooks/
│   └── useCountdown.ts  — reusable mm:ss timer
├── lib/
│   ├── format.ts        — price/date/category formatters (tr locale)
│   └── cn.ts            — className merger
├── components/
│   ├── layout/          — Header, Footer, CategoryTabs
│   ├── ui/              — Button, Input, Card, Badge, Skeleton
│   ├── events/          — EventCard, EventFilters, SearchBar
│   ├── seat/            — SeatMap, SelectedSeatsBar
│   ├── checkout/        — CountdownTimer
│   └── ProtectedRoute.tsx
└── pages/
    ├── HomePage.tsx
    ├── EventsListPage.tsx
    ├── EventDetailPage.tsx
    ├── LoginPage.tsx
    ├── RegisterPage.tsx
    ├── CheckoutPage.tsx
    ├── PaymentPage.tsx
    ├── MyTicketsPage.tsx
    ├── TicketDetailPage.tsx
    ├── ProfilePage.tsx
    └── NotFoundPage.tsx
```

## Design System

**Colors** (see `tailwind.config.ts`):

| Token | Hex | Use |
|---|---|---|
| `primary` | `#e94560` | Main CTA, active states |
| `primary-dark` | `#c72a4a` | Hover states |
| `secondary` | `#1a1a2e` | Header, body text |
| `accent` | `#ffa94d` | Badges, secondary highlights |
| `surface` | `#f5f5f7` | Page backgrounds |

**Typography:** Inter (Google Fonts) for all text, Cascadia Code for monospace (countdown, IDs).

## Key Design Decisions

1. **`/api/v1` prefix in `VITE_API_URL`** — single source of truth; API modules don't repeat the prefix.
2. **Axios interceptor chain** — automatic JWT attach + 401 refresh with retry, only ONE refresh in flight at a time (`refreshPromise` guard).
3. **Zustand with persist** — simpler than Context, survives page refresh.
4. **TanStack Query everywhere** — caching, automatic refetch on mount, `refetchInterval` for pricing (30s) and reservation status (30s).
5. **Prices in cents** — backend sends integer cents (e.g. `15000`); frontend divides by 100 and formats with `Intl.NumberFormat('tr-TR', { currency: 'TRY' })`.
6. **Seat grid from JSON** — `venue.seatLayout` is arbitrary sections × rows × seats; `SeatMap` renders any shape dynamically.
7. **Max 6 seats** enforced on the frontend (disabled state) matching backend validation — fail fast, better UX.
8. **Countdown drives UX** — checkout and payment pages both show it; expiry redirects back to event detail.

## Scripts

```
npm run dev         — Vite dev server with hot reload
npm run build       — TypeScript check + production bundle
npm run preview     — preview production build locally
npm run typecheck   — tsc --noEmit
```

## Verification Checklist

End-to-end manual flow with backend running:

- [ ] Home page renders 3+ seeded events
- [ ] Filters on `/events` update URL params and results
- [ ] Event detail shows seat map grid
- [ ] Can select up to 6 seats; 7th is disabled
- [ ] "Devam Et" → hold API → redirect to `/checkout/:id`
- [ ] Countdown ticks down from 10:00
- [ ] "Ödemeye Geç" → `/payment/:id` with card form
- [ ] Submit → payment API → reservation confirm → `/tickets`
- [ ] Ticket detail shows QR code; PNG download works
- [ ] Logout clears store; protected routes redirect to login
- [ ] Mobile (375px): header shows hamburger; cards stack; seat map scrolls horizontally
- [ ] Network tab: JWT Bearer header on every authenticated request
- [ ] Expired access token → auto-refresh → retry original request

## Out of Scope

- Real Stripe integration (mock card form)
- Organizer/admin dashboards
- i18n (Turkish only)
- E2E tests (Playwright)
- PWA / offline support
