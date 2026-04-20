/**
 * Health Check Integration Test
 *
 * Gerçek DB ve Redis bağlantılarıyla sağlık kontrolü endpoint'ini test eder.
 * Unit test'te mock kullanırız, burada gerçek servislerle çalışırız.
 */

import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildTestApp } from '../helpers.js';

describe('GET /health', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('should return 200 when all services are healthy', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/health',
    });

    expect(response.statusCode).toBe(200);

    const body = response.json();
    expect(body).toHaveProperty('status', 'healthy');
    expect(body.checks).toHaveProperty('database', 'ok');
    expect(body.checks).toHaveProperty('redis', 'ok');
  });

  it('should include uptime and timestamp', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/health',
    });

    const body = response.json();
    expect(body).toHaveProperty('uptime');
    expect(body).toHaveProperty('timestamp');
    expect(typeof body.uptime).toBe('number');
  });
});
