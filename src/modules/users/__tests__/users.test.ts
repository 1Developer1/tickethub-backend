/**
 * Users Module — Unit & API Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import * as argon2 from 'argon2';
import { registerSchema, loginSchema } from '../users.schema.js';

// ── Schema Validation Tests ──
describe('Users Schema Validation', () => {
  describe('registerSchema', () => {
    it('should accept valid registration data', () => {
      const result = registerSchema.safeParse({
        email: 'Test@Example.COM',
        password: 'StrongPass1',
        name: 'John Doe',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        // Email should be lowercased and trimmed
        expect(result.data.email).toBe('test@example.com');
      }
    });

    it('should reject weak password (no uppercase)', () => {
      const result = registerSchema.safeParse({
        email: 'test@example.com',
        password: 'weakpass1',
        name: 'John',
      });

      expect(result.success).toBe(false);
    });

    it('should reject short password', () => {
      const result = registerSchema.safeParse({
        email: 'test@example.com',
        password: 'Ab1',
        name: 'John',
      });

      expect(result.success).toBe(false);
    });

    it('should reject invalid email', () => {
      const result = registerSchema.safeParse({
        email: 'not-an-email',
        password: 'StrongPass1',
        name: 'John',
      });

      expect(result.success).toBe(false);
    });

    it('should reject short name', () => {
      const result = registerSchema.safeParse({
        email: 'test@example.com',
        password: 'StrongPass1',
        name: 'J',
      });

      expect(result.success).toBe(false);
    });
  });

  describe('loginSchema', () => {
    it('should accept valid login data', () => {
      const result = loginSchema.safeParse({
        email: 'test@example.com',
        password: 'anypassword',
      });

      expect(result.success).toBe(true);
    });

    it('should reject missing password', () => {
      const result = loginSchema.safeParse({
        email: 'test@example.com',
        password: '',
      });

      expect(result.success).toBe(false);
    });
  });
});

// ── Password Hashing Tests ──
describe('Password Hashing (argon2id)', () => {
  it('should hash and verify password correctly', async () => {
    const password = 'MySecurePass123';
    const hash = await argon2.hash(password, {
      type: argon2.argon2id,
      memoryCost: 65536,
      timeCost: 3,
      parallelism: 1,
    });

    // Hash should be different from plaintext
    expect(hash).not.toBe(password);
    // Hash should start with argon2id identifier
    expect(hash).toMatch(/^\$argon2id\$/);
    // Verification should succeed
    expect(await argon2.verify(hash, password)).toBe(true);
    // Wrong password should fail
    expect(await argon2.verify(hash, 'WrongPassword')).toBe(false);
  });

  it('should produce different hashes for same password (salt)', async () => {
    const password = 'SamePassword123';
    const hash1 = await argon2.hash(password, { type: argon2.argon2id });
    const hash2 = await argon2.hash(password, { type: argon2.argon2id });

    // Same password, different hashes (random salt)
    expect(hash1).not.toBe(hash2);
    // Both should verify correctly
    expect(await argon2.verify(hash1, password)).toBe(true);
    expect(await argon2.verify(hash2, password)).toBe(true);
  });
});
