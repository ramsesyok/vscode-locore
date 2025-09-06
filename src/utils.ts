import * as crypto from 'crypto';

/**
 * UUID を生成するユーティリティ。
 * - 可能なら Node.js の `crypto.randomUUID` を利用（Node 16+）。
 * - フォールバックは RFC4122 v4 風のIDを自前生成。
 */
export function generateUuid(): string {
    const anyCrypto: any = crypto as any;
    if (anyCrypto && typeof anyCrypto.randomUUID === 'function') {
        return anyCrypto.randomUUID();
    }
    const rnd = crypto.randomBytes(16);
    rnd[6] = (rnd[6] & 0x0f) | 0x40; // version 4
    rnd[8] = (rnd[8] & 0x3f) | 0x80; // variant
    const hex = rnd.toString('hex');
    return `${hex.substr(0, 8)}-${hex.substr(8, 4)}-${hex.substr(12, 4)}-${hex.substr(16, 4)}-${hex.substr(20)}`;
}

