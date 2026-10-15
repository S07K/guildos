import 'server-only';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { requiredEnv } from './env';

function key() {
  const value = requiredEnv('AI_SIGNIN_VAULT_KEY');
  if (!/^[a-f0-9]{64}$/i.test(value)) throw new Error('AI_SIGNIN_VAULT_KEY must be 32 bytes encoded as 64 hexadecimal characters.');
  return Buffer.from(value, 'hex');
}

export function seal(value: string, workspaceId: string, provider: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  cipher.setAAD(Buffer.from(`${workspaceId}:${provider}`));
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64'), cipher.getAuthTag().toString('base64'), encrypted.toString('base64')].join('.');
}

export function open(value: string, workspaceId: string, provider: string) {
  const [version, iv, tag, payload, ...extra] = value.split('.');
  if (version !== 'v1' || !iv || !tag || !payload || extra.length) throw new Error('Invalid encrypted provider connection.');
  const decipher = createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64'));
  decipher.setAAD(Buffer.from(`${workspaceId}:${provider}`));
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(payload, 'base64')), decipher.final()]).toString('utf8');
}
