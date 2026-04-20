/**
 * Users Module — Authentication Service
 *
 * Bu modül ne yapıyor: Kullanıcı kaydı, giriş, JWT token yönetimi, profil.
 * Hangi pattern: Basit service (domain model yok — karmaşık iş kuralı yok).
 * Neden basit: Register = veri al + hash'le + kaydet. Login = doğrula + token üret.
 *   Karmaşık durum geçişleri, invariant kontrolleri yok.
 *
 * ÖNEMLİ KARARLAR:
 * - argon2id: bcrypt'ten daha güvenli (memory-hard, GPU saldırısına dayanıklı)
 * - JWT access token 15dk + refresh token 7 gün rotation
 * - Refresh token DB'de (Redis restart'a dayanıklı)
 */

import { createHash, randomBytes } from 'node:crypto';
import * as argon2 from 'argon2';
import jwt from 'jsonwebtoken';
import { config } from '../../config/index.js';
import { prisma } from '../../shared/database/prisma-client.js';
import {
  ConflictError,
  NotFoundError,
  UnauthorizedError,
} from '../../shared/errors/http-errors.js';
import { logger } from '../../shared/logger/index.js';
import type { AuthResponse, LoginInput, RegisterInput, UserResponse } from './users.schema.js';

/**
 * NEDEN ARGON2ID, BCRYPT DEĞİL?
 *
 * bcrypt: CPU-hard. GPU ile paralel saldırı mümkün (GPU binlerce core ile aynı anda dener).
 * argon2id: Memory-hard + CPU-hard. Her hash için 64MB RAM gerektirir.
 *   GPU'nun her core'u 64MB RAM kullanamaz → paralel saldırı pratikte imkansız.
 *
 * OWASP 2024 önerisi: argon2id, memoryCost=65536 (64MB), timeCost=3, parallelism=1.
 *
 * ❌ ANTI-PATTERN: bcrypt kullanmak
 * ```
 * import bcrypt from 'bcrypt';
 * const hash = await bcrypt.hash(password, 12);
 * // bcrypt çalışır ama GPU saldırısına karşı argon2id kadar dayanıklı değil.
 * // Yeni projede bcrypt kullanmak için bir neden yok.
 * ```
 */
const ARGON2_OPTIONS: argon2.Options = {
  type: argon2.argon2id, // argon2id = argon2i (side-channel resistant) + argon2d (GPU resistant)
  memoryCost: 65536, // 64MB — her hash için bu kadar RAM gerekir
  timeCost: 3, // 3 iterasyon
  parallelism: 1, // Tek thread (server CPU'su aşırı yüklenmesin)
};

function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function generateTokenPair(
  userId: string,
  role: string,
): {
  accessToken: string;
  refreshToken: string;
} {
  const accessSecret = config.JWT_ACCESS_SECRET;

  const accessToken = jwt.sign({ sub: userId, role }, accessSecret, {
    expiresIn: config.JWT_ACCESS_EXPIRES_IN as jwt.SignOptions['expiresIn'],
  });

  // Refresh token: opaque random string (JWT değil — DB'de hash'i saklanıyor)
  const refreshToken = randomBytes(48).toString('base64url');

  return { accessToken, refreshToken };
}

export const usersService = {
  /**
   * Yeni kullanıcı kaydı.
   * Email benzersiz olmalı → ConflictError.
   */
  async register(input: RegisterInput): Promise<AuthResponse> {
    // Email uniqueness kontrolü
    const existing = await prisma.user.findUnique({
      where: { email: input.email },
    });

    if (existing) {
      throw new ConflictError('A user with this email already exists');
    }

    // Password hash
    const passwordHash = await argon2.hash(input.password, ARGON2_OPTIONS);

    // Kullanıcı oluştur
    const user = await prisma.user.create({
      data: {
        email: input.email,
        passwordHash,
        name: input.name,
      },
    });

    // Token çifti üret
    const { accessToken, refreshToken } = generateTokenPair(user.id, user.role);

    // Refresh token'ı DB'ye kaydet (hash'lenmiş)
    await prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: hashRefreshToken(refreshToken),
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 gün
      },
    });

    logger.info({ userId: user.id, email: user.email }, 'User registered');

    return {
      accessToken,
      refreshToken,
      user: formatUser(user),
    };
  },

  /**
   * Kullanıcı girişi.
   * Email + password doğrula → token çifti üret.
   */
  async login(input: LoginInput): Promise<AuthResponse> {
    const user = await prisma.user.findUnique({
      where: { email: input.email, deletedAt: null },
    });

    if (!user) {
      // Güvenlik: "email bulunamadı" ve "yanlış şifre" ayrımı YAPMA
      // → saldırgan hangi email'lerin kayıtlı olduğunu anlayamaz (user enumeration attack)
      throw new UnauthorizedError('Invalid email or password');
    }

    const isPasswordValid = await argon2.verify(user.passwordHash, input.password);
    if (!isPasswordValid) {
      throw new UnauthorizedError('Invalid email or password');
    }

    const { accessToken, refreshToken } = generateTokenPair(user.id, user.role);

    await prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: hashRefreshToken(refreshToken),
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });

    logger.info({ userId: user.id }, 'User logged in');

    return {
      accessToken,
      refreshToken,
      user: formatUser(user),
    };
  },

  /**
   * Refresh token rotation.
   *
   * NEDEN ROTATION?
   * Refresh token çalındığında:
   * - Rotation OLMADAN: saldırgan sonsuza kadar yeni access token alabilir
   * - Rotation İLE: meşru kullanıcı refresh yaptığında eski token iptal olur
   *   → saldırganın token'ı geçersiz olur → saldırı tespit edilir
   *
   * Ayrıca: aynı refresh token İKİ KEZ kullanılırsa → token reuse detected
   * → o kullanıcının TÜM refresh token'ları iptal edilir (güvenlik önlemi)
   */
  async refresh(refreshToken: string): Promise<{ accessToken: string; refreshToken: string }> {
    const tokenHash = hashRefreshToken(refreshToken);

    const storedToken = await prisma.refreshToken.findFirst({
      where: { tokenHash },
      include: { user: true },
    });

    if (!storedToken) {
      throw new UnauthorizedError('Invalid refresh token');
    }

    // Token zaten kullanılmış (revoked) → TOKEN REUSE DETECTED
    if (storedToken.revokedAt) {
      // Güvenlik: bu kullanıcının TÜM refresh token'larını iptal et
      await prisma.refreshToken.updateMany({
        where: { userId: storedToken.userId },
        data: { revokedAt: new Date() },
      });

      logger.warn(
        { userId: storedToken.userId },
        'Refresh token reuse detected! All tokens revoked.',
      );

      throw new UnauthorizedError('Token reuse detected. Please login again.');
    }

    // Token süresi dolmuş
    if (storedToken.expiresAt < new Date()) {
      throw new UnauthorizedError('Refresh token has expired');
    }

    // Eski token'ı iptal et (rotation)
    await prisma.refreshToken.update({
      where: { id: storedToken.id },
      data: { revokedAt: new Date() },
    });

    // Yeni token çifti üret
    const tokens = generateTokenPair(storedToken.user.id, storedToken.user.role);

    // Yeni refresh token'ı kaydet
    await prisma.refreshToken.create({
      data: {
        userId: storedToken.user.id,
        tokenHash: hashRefreshToken(tokens.refreshToken),
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });

    return tokens;
  },

  /**
   * Logout — refresh token'ı iptal et.
   * Access token kısa ömürlü (15dk) → iptal etmeye gerek yok, süresi dolacak.
   */
  async logout(refreshToken: string): Promise<void> {
    const tokenHash = hashRefreshToken(refreshToken);

    await prisma.refreshToken.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  },

  /**
   * Kullanıcı profili getir.
   */
  async getProfile(userId: string): Promise<UserResponse> {
    const user = await prisma.user.findUnique({
      where: { id: userId, deletedAt: null },
    });

    if (!user) {
      throw new NotFoundError('User', userId);
    }

    return formatUser(user);
  },
};

function formatUser(user: {
  id: string;
  email: string;
  name: string;
  role: string;
  createdAt: Date;
}): UserResponse {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role as 'USER' | 'ORGANIZER' | 'ADMIN',
    createdAt: user.createdAt.toISOString(),
  };
}
