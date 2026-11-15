import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

export function sha256Hex(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

/** Token aleatório opaco (refresh, link mágico). Guardamos só o sha256 no banco. */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

const VERSION = 'v1';
const IV_BYTES = 12;
const TAG_BYTES = 16;

/**
 * Cifragem autenticada (AES-256-GCM) para segredos guardados no banco:
 * segredo TOTP agora, chaves do broker por subconta na Fase 1.
 * Formato: v1.<base64url(iv | tag | ciphertext)>.
 */
export class SecretBox {
  private readonly key: Buffer;

  constructor(base64Key: string) {
    this.key = Buffer.from(base64Key, 'base64');
    if (this.key.length !== 32) throw new Error('A chave de cifragem precisa ter 32 bytes');
  }

  encrypt(plaintext: string): string {
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const payload = Buffer.concat([iv, cipher.getAuthTag(), ciphertext]);
    return `${VERSION}.${payload.toString('base64url')}`;
  }

  decrypt(sealed: string): string {
    const [version, data] = sealed.split('.');
    if (version !== VERSION || !data) throw new Error('Formato de segredo cifrado desconhecido');
    const payload = Buffer.from(data, 'base64url');
    const iv = payload.subarray(0, IV_BYTES);
    const tag = payload.subarray(IV_BYTES, IV_BYTES + TAG_BYTES);
    const ciphertext = payload.subarray(IV_BYTES + TAG_BYTES);
    const decipher = createDecipheriv('aes-256-gcm', this.key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
  }
}
