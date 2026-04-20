/**
 * Database Seed — Test/Development Data
 *
 * `npm run db:seed` ile çalıştırılır.
 * Idempotent: tekrar çalıştırılabilir (upsert kullanıyor).
 */

import { PrismaClient, UserRole, EventStatus, EventCategory } from '@prisma/client';
import { hash } from 'argon2';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  console.log('🌱 Seeding database...');

  // ── Users ──
  const adminPasswordHash = await hash('Admin123!@#', {
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 1,
  });

  const admin = await prisma.user.upsert({
    where: { email: 'admin@tickethub.com' },
    update: {},
    create: {
      email: 'admin@tickethub.com',
      passwordHash: adminPasswordHash,
      name: 'System Admin',
      role: UserRole.ADMIN,
    },
  });

  const organizerPasswordHash = await hash('Organizer123!@#', {
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 1,
  });

  const organizer = await prisma.user.upsert({
    where: { email: 'organizer@tickethub.com' },
    update: {},
    create: {
      email: 'organizer@tickethub.com',
      passwordHash: organizerPasswordHash,
      name: 'Demo Organizer',
      role: UserRole.ORGANIZER,
    },
  });

  const userPasswordHash = await hash('User123!@#', {
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 1,
  });

  const user = await prisma.user.upsert({
    where: { email: 'user@tickethub.com' },
    update: {},
    create: {
      email: 'user@tickethub.com',
      passwordHash: userPasswordHash,
      name: 'Demo User',
      role: UserRole.USER,
    },
  });

  // ── Venues ──
  const venue1 = await prisma.venue.upsert({
    where: { id: '00000000-0000-0000-0000-000000000001' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000001',
      name: 'Harbiye Açıkhava Tiyatrosu',
      address: 'Harbiye, Taşkışla Cd., Şişli',
      city: 'İstanbul',
      capacity: 4000,
      seatLayout: {
        VIP: { rows: 5, seatsPerRow: 20, basePriceInCents: 75000 },
        'Balkon A': { rows: 10, seatsPerRow: 30, basePriceInCents: 50000 },
        'Balkon B': { rows: 10, seatsPerRow: 30, basePriceInCents: 35000 },
        Koltuk: { rows: 20, seatsPerRow: 40, basePriceInCents: 20000 },
      },
    },
  });

  const venue2 = await prisma.venue.upsert({
    where: { id: '00000000-0000-0000-0000-000000000002' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000002',
      name: 'Volkswagen Arena',
      address: 'Huzur, Maslak Ayazağa Cd. No:4, Sarıyer',
      city: 'İstanbul',
      capacity: 6000,
      seatLayout: {
        'Gold VIP': { rows: 3, seatsPerRow: 15, basePriceInCents: 150000 },
        VIP: { rows: 5, seatsPerRow: 25, basePriceInCents: 100000 },
        'Tribün A': { rows: 15, seatsPerRow: 40, basePriceInCents: 60000 },
        'Tribün B': { rows: 15, seatsPerRow: 40, basePriceInCents: 40000 },
        'Ayakta': { rows: 1, seatsPerRow: 1000, basePriceInCents: 25000 },
      },
    },
  });

  // ── Events ──
  const now = new Date();
  const inTwoWeeks = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
  const inOneMonth = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  const inTwoMonths = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000);

  await prisma.event.upsert({
    where: { id: '00000000-0000-0000-0000-000000000010' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000010',
      venueId: venue1.id,
      organizerId: organizer.id,
      name: 'Tarkan - Harbiye Konseri 2026',
      description: "Tarkan'ın efsanevi Harbiye konseri. Yaz sezonunun en büyük etkinliği!",
      category: EventCategory.CONCERT,
      status: EventStatus.PUBLISHED,
      startsAt: inTwoWeeks,
      endsAt: new Date(inTwoWeeks.getTime() + 3 * 60 * 60 * 1000), // +3 saat
      salesStartAt: now,
      salesEndAt: new Date(inTwoWeeks.getTime() - 2 * 60 * 60 * 1000), // etkinlikten 2 saat önce
    },
  });

  await prisma.event.upsert({
    where: { id: '00000000-0000-0000-0000-000000000011' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000011',
      venueId: venue2.id,
      organizerId: organizer.id,
      name: 'Duman - Arena Konseri',
      description: 'Duman rock grubu arena konseri. Tüm albümlerden seçmeler!',
      category: EventCategory.CONCERT,
      status: EventStatus.PUBLISHED,
      startsAt: inOneMonth,
      endsAt: new Date(inOneMonth.getTime() + 3 * 60 * 60 * 1000),
      salesStartAt: now,
      salesEndAt: new Date(inOneMonth.getTime() - 2 * 60 * 60 * 1000),
    },
  });

  await prisma.event.upsert({
    where: { id: '00000000-0000-0000-0000-000000000012' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000012',
      venueId: venue1.id,
      organizerId: organizer.id,
      name: 'Hamlet - Shakespeare Festivali',
      description: 'William Shakespeare\'in ölümsüz eseri Hamlet, yıldız kadrosuyla sahnede.',
      category: EventCategory.THEATER,
      status: EventStatus.DRAFT,
      startsAt: inTwoMonths,
      endsAt: new Date(inTwoMonths.getTime() + 2.5 * 60 * 60 * 1000),
      salesStartAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000), // 1 hafta sonra
      salesEndAt: new Date(inTwoMonths.getTime() - 2 * 60 * 60 * 1000),
    },
  });

  console.log('✅ Seed complete!');
  console.log(`  Users: admin (${admin.id}), organizer (${organizer.id}), user (${user.id})`);
  console.log(`  Venues: ${venue1.name}, ${venue2.name}`);
  console.log('  Events: 3 events created');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
