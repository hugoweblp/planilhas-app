const crypto = require('crypto');

const ALGO   = 'aes-256-gcm';
const PREFIX = 'aes256:';

function getKey() {
    const hex = process.env.ENCRYPTION_KEY || '';
    if (hex.length !== 64) throw new Error('ENCRYPTION_KEY deve ter exatamente 64 caracteres hex (32 bytes).');
    return Buffer.from(hex, 'hex');
}

/**
 * Criptografa um valor de texto (CPF, telefone) usando AES-256-GCM.
 * Retorna string no formato: "aes256:<base64(iv+authTag+ciphertext)>"
 */
function encrypt(plaintext) {
    if (plaintext == null || plaintext === '') return plaintext;
    const key = getKey();
    const iv  = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv(ALGO, key, iv);
    const encrypted = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
    const authTag   = cipher.getAuthTag();
    return PREFIX + Buffer.concat([iv, authTag, encrypted]).toString('base64');
}

/**
 * Descriptografa um valor criptografado por encrypt().
 * Se o valor não tiver o prefixo "aes256:" (dado legado em plaintext), retorna como está.
 */
function decrypt(ciphertext) {
    if (ciphertext == null || ciphertext === '') return ciphertext;
    if (!ciphertext.startsWith(PREFIX)) {
        console.warn('[Crypto] Dado legado sem criptografia detectado — execute a migração (migrarCpfParaCriptografado).');
        return ciphertext;
    }
    try {
        const key = getKey();
        const buf  = Buffer.from(ciphertext.slice(PREFIX.length), 'base64');
        const iv      = buf.subarray(0, 12);
        const authTag = buf.subarray(12, 28);
        const data    = buf.subarray(28);
        const decipher = crypto.createDecipheriv(ALGO, key, iv);
        decipher.setAuthTag(authTag);
        return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
    } catch (e) {
        console.error('[Crypto] Falha na decriptação — possível adulteração ou dado corrompido:', e.message);
        return null;
    }
}

module.exports = { encrypt, decrypt };
