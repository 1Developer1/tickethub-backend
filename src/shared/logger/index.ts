/**
 * Logger Module — Pino ile Structured Logging
 *
 * NEDEN PINO?
 * - Fastify'ın native logger'ı (sıfır overhead)
 * - Winston'dan ~5x hızlı (JSON serialization optimizasyonu)
 * - Structured JSON output → production'da `jq` ile hassas filtreleme
 * - Child logger desteği → requestId her log'a otomatik eklenir
 *
 * NEDEN STRUCTURED (JSON) LOG?
 * Yapmasaydık: console.log("Payment failed for user 123") → grep ile arama zor
 * Yapınca: { level: "error", event: "payment.failed", userId: "123" }
 *   → jq '.level == "error" and .event == "payment.failed"' ile hassas filtreleme
 *   → Datadog/ELK gibi araçlar otomatik parse eder
 *
 * Development'ta: pino-pretty ile okunabilir renkli output
 * Production'da: Ham JSON → log aggregator'a gönder
 */

import pino from 'pino';

const isProduction = process.env.NODE_ENV === 'production';
const isTest = process.env.NODE_ENV === 'test';

export const logger = pino({
  level: isTest ? 'silent' : (process.env.LOG_LEVEL ?? 'info'),
  // Production'da JSON, development'ta okunabilir format
  ...(isProduction
    ? {}
    : {
        transport: {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'HH:MM:ss',
            ignore: 'pid,hostname',
          },
        },
      }),
  // Her log'a eklenen base field'lar
  base: {
    service: 'tickethub',
    ...(isProduction ? {} : { pid: process.pid }),
  },
  // Timestamp formatı
  timestamp: pino.stdTimeFunctions.isoTime,
  // Serializer'lar — hassas veriyi loglamaktan kaçın
  serializers: {
    req: (req) => ({
      method: req.method,
      url: req.url,
      // Headers'dan sadece gerekli olanları al — Authorization gibi hassas header'ları LOGLAMA
      headers: {
        'user-agent': req.headers?.['user-agent'],
        'x-request-id': req.headers?.['x-request-id'],
      },
    }),
    res: (res) => ({
      statusCode: res.statusCode,
    }),
  },
});

export type Logger = typeof logger;

/**
 * Child logger oluştur — modül veya request bazında context ekle.
 * Örnek: createChildLogger({ module: 'booking', requestId: 'abc-123' })
 * → Bu logger'dan yapılan her log'da module ve requestId otomatik eklenir.
 */
export function createChildLogger(bindings: Record<string, unknown>): pino.Logger {
  return logger.child(bindings);
}
