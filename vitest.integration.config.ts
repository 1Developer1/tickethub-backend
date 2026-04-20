import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/integration/**/*.test.ts'],
    // Integration test'ler Testcontainers ile çalışır — daha uzun timeout
    testTimeout: 120_000,
    hookTimeout: 60_000,
    // Sıralı çalıştır — DB paylaşılıyor
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
  },
});
