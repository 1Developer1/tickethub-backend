/**
 * QR Code Generator — HMAC Signed Tickets
 *
 * NEDEN HMAC SIGNATURE?
 * QR kod içeriği herkes tarafından okunabilir. Sahtecilik önlemi:
 * ticketId + eventId + seatInfo → HMAC-SHA256 ile imzala → QR koda yaz.
 * Giriş kapısında: QR oku → signature doğrula → sahte bilet GİREMEZ.
 *
 * NEDEN JWT DEĞİL?
 * QR kodların veri kapasitesi sınırlı (~2KB). JWT header + claims → çok uzun.
 * HMAC: payload.signature formatı → kısa, QR'a sığar.
 *
 * CONSTANT-TIME COMPARISON:
 * Normal string comparison: ilk farklı karakterde durur → timing saldırısı.
 * Saldırgan: her karakter için yanıt süresini ölçerek signature'ı tahmin edebilir.
 * crypto.timingSafeEqual: her zaman aynı sürede çalışır → timing saldırısı imkansız.
 */

import { createHmac, timingSafeEqual } from 'node:crypto';
import QRCode from 'qrcode';

const HMAC_ALGORITHM = 'sha256';

function getSecret(): string {
  const secret = process.env.TICKET_HMAC_SECRET;
  if (!secret) throw new Error('TICKET_HMAC_SECRET is not configured');
  return secret;
}

export interface QRPayloadData {
  ticketId: string;
  eventId: string;
  sectionName: string;
  row: number;
  seat: number;
}

/**
 * QR payload oluştur: data.signature formatında.
 * Bu string QR koda yazılır.
 */
export function generateQRPayload(data: QRPayloadData): string {
  const payload = JSON.stringify(data);
  const payloadBase64 = Buffer.from(payload).toString('base64url');

  const signature = createHmac(HMAC_ALGORITHM, getSecret())
    .update(payloadBase64)
    .digest('base64url');

  return `${payloadBase64}.${signature}`;
}

/**
 * QR payload doğrula: signature kontrol + data decode.
 * Sahte bilet tespiti.
 */
export function verifyQRPayload(qrPayload: string): { valid: boolean; data?: QRPayloadData } {
  const parts = qrPayload.split('.');
  if (parts.length !== 2) {
    return { valid: false };
  }

  const [payloadBase64, providedSignature] = parts;

  if (!payloadBase64 || !providedSignature) {
    return { valid: false };
  }

  // Signature hesapla
  const expectedSignature = createHmac(HMAC_ALGORITHM, getSecret())
    .update(payloadBase64)
    .digest('base64url');

  // Constant-time comparison (timing attack önlemi)
  const sigBuffer = Buffer.from(providedSignature);
  const expectedBuffer = Buffer.from(expectedSignature);

  if (sigBuffer.length !== expectedBuffer.length) {
    return { valid: false };
  }

  const isValid = timingSafeEqual(sigBuffer, expectedBuffer);
  if (!isValid) {
    return { valid: false };
  }

  // Payload decode
  try {
    const payload = Buffer.from(payloadBase64, 'base64url').toString('utf-8');
    const data = JSON.parse(payload) as QRPayloadData;
    return { valid: true, data };
  } catch {
    return { valid: false };
  }
}

/**
 * QR kod PNG resmi oluştur (Buffer).
 */
export async function generateQRImage(qrPayload: string): Promise<Buffer> {
  return QRCode.toBuffer(qrPayload, {
    errorCorrectionLevel: 'M', // Orta hata düzeltme
    type: 'png',
    width: 300,
    margin: 2,
  });
}
