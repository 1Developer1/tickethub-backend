/**
 * Tickets Module — Unit Tests (QR HMAC)
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { generateQRPayload, verifyQRPayload, type QRPayloadData } from '../qr-generator.js';

// Test secret
beforeAll(() => {
  process.env.TICKET_HMAC_SECRET = 'test-hmac-secret-at-least-32-characters-long-x';
});

const testPayload: QRPayloadData = {
  ticketId: 'ticket-123',
  eventId: 'event-456',
  sectionName: 'VIP',
  row: 1,
  seat: 15,
};

describe('QR Code HMAC', () => {
  it('should generate and verify valid QR payload', () => {
    const qrPayload = generateQRPayload(testPayload);
    const result = verifyQRPayload(qrPayload);

    expect(result.valid).toBe(true);
    expect(result.data).toEqual(testPayload);
  });

  it('should reject tampered payload', () => {
    const qrPayload = generateQRPayload(testPayload);
    // Modify the payload part (before the dot)
    const parts = qrPayload.split('.');
    const tamperedPayload = `${parts[0]}X.${parts[1]}`;

    const result = verifyQRPayload(tamperedPayload);
    expect(result.valid).toBe(false);
  });

  it('should reject tampered signature', () => {
    const qrPayload = generateQRPayload(testPayload);
    const parts = qrPayload.split('.');
    const tamperedSignature = `${parts[0]}.${parts[1]}X`;

    const result = verifyQRPayload(tamperedSignature);
    expect(result.valid).toBe(false);
  });

  it('should reject invalid format (no dot)', () => {
    const result = verifyQRPayload('invalid-no-dot-separator');
    expect(result.valid).toBe(false);
  });

  it('should reject empty string', () => {
    const result = verifyQRPayload('');
    expect(result.valid).toBe(false);
  });

  it('should produce different payloads for different tickets', () => {
    const payload1 = generateQRPayload(testPayload);
    const payload2 = generateQRPayload({ ...testPayload, ticketId: 'ticket-999' });
    expect(payload1).not.toBe(payload2);
  });
});
