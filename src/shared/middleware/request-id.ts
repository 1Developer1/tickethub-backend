/**
 * Request ID Middleware
 *
 * Her gelen isteğe benzersiz UUID ata. Bu ID:
 * - Tüm log'larda geçer (requestId field)
 * - Tüm modüllerde, tüm async job'larda takip edilir
 * - Response header'ında döner (X-Request-Id)
 *
 * NEDEN?
 * Kullanıcı "bilet alamadım" diye şikayet etti → destek ekibi request ID'yi ister
 * → tek ID ile tüm log'ları filtrele → sorunun tam olarak nerede olduğunu gör.
 * Yapmasaydık: "dün saat 15:00 civarında bir hata oldu" → binlerce log arasından bul.
 */

import type { FastifyInstance } from 'fastify';
import { v4 as uuidv4 } from 'uuid';

export async function requestIdPlugin(app: FastifyInstance): Promise<void> {
  // Her request'e request ID ekle
  app.addHook('onRequest', async (request, reply) => {
    // Client kendi request ID'sini gönderebilir (distributed tracing için)
    // Göndermezse biz üretiriz
    const requestId = (request.headers['x-request-id'] as string) || uuidv4();

    // Fastify'ın native request.id'sine ata
    request.id = requestId;

    // Response header'ına ekle (client'ın destek talebi için kullanması için)
    reply.header('X-Request-Id', requestId);
  });
}
