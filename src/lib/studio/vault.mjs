import { randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';

function encryptionKey(secret) {
 if (!/^[a-f0-9]{64}$/i.test(secret || '')) throw new Error('The studio key vault is not configured.');
 return Buffer.from(secret, 'hex');
}
export function sealKey(value, workspace, secret = process.env.STUDIO_VAULT_KEY) {
 const iv = randomBytes(12);
 const cipher = createCipheriv('aes-256-gcm', encryptionKey(secret), iv);
 cipher.setAAD(Buffer.from(workspace));
 const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
 return ['v1', iv.toString('base64'), cipher.getAuthTag().toString('base64'), encrypted.toString('base64')].join('.');
}
export function openKey(value, workspace, secret = process.env.STUDIO_VAULT_KEY) {
 const [version, iv, tag, ciphertext, extra] = value.split('.');
 if (version !== 'v1' || !iv || !tag || !ciphertext || extra) throw new Error('Invalid vault entry.');
 const decipher = createDecipheriv('aes-256-gcm', encryptionKey(secret), Buffer.from(iv, 'base64'));
 decipher.setAAD(Buffer.from(workspace));
 decipher.setAuthTag(Buffer.from(tag, 'base64'));
 return Buffer.concat([decipher.update(Buffer.from(ciphertext, 'base64')), decipher.final()]).toString('utf8');
}
