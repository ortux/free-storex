"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const encryption_service_1 = require("../encryption/encryption.service");
describe('EncryptionService', () => {
    let service;
    beforeEach(() => {
        service = new encryption_service_1.EncryptionService();
    });
    describe('generateKey', () => {
        it('generates a 32-byte key', () => {
            const key = service.generateKey();
            expect(key.length).toBe(32);
        });
        it('generates unique keys each time', () => {
            const key1 = service.generateKey();
            const key2 = service.generateKey();
            expect(key1.equals(key2)).toBe(false);
        });
    });
    describe('encrypt / decrypt round-trip', () => {
        it('decrypts to original plaintext', () => {
            const key = service.generateKey();
            const plaintext = Buffer.from('Hello, world! This is a test file.');
            const encrypted = service.encrypt(plaintext, key);
            const decrypted = service.decrypt(encrypted, key);
            expect(decrypted.equals(plaintext)).toBe(true);
        });
        it('works with binary data (simulated image)', () => {
            const key = service.generateKey();
            const fakeImage = Buffer.alloc(1024, 0xff);
            const encrypted = service.encrypt(fakeImage, key);
            const decrypted = service.decrypt(encrypted, key);
            expect(decrypted.equals(fakeImage)).toBe(true);
        });
        it('produces different ciphertext for same plaintext (random nonce)', () => {
            const key = service.generateKey();
            const plaintext = Buffer.from('same plaintext');
            const enc1 = service.encrypt(plaintext, key);
            const enc2 = service.encrypt(plaintext, key);
            expect(enc1.equals(enc2)).toBe(false);
        });
    });
    describe('tamper detection', () => {
        it('throws when decrypting with wrong key', () => {
            const key1 = service.generateKey();
            const key2 = service.generateKey();
            const plaintext = Buffer.from('secret data');
            const encrypted = service.encrypt(plaintext, key1);
            expect(() => service.decrypt(encrypted, key2)).toThrow();
        });
        it('throws when ciphertext is modified', () => {
            const key = service.generateKey();
            const plaintext = Buffer.from('secret data');
            const encrypted = service.encrypt(plaintext, key);
            // Flip a byte in the ciphertext portion
            encrypted[encrypted.length - 1] ^= 0xff;
            expect(() => service.decrypt(encrypted, key)).toThrow();
        });
        it('throws when auth tag is modified', () => {
            const key = service.generateKey();
            const plaintext = Buffer.from('secret data');
            const encrypted = service.encrypt(plaintext, key);
            // Auth tag is at bytes 18-33 in the header
            encrypted[20] ^= 0xff;
            expect(() => service.decrypt(encrypted, key)).toThrow();
        });
        it('throws on invalid magic bytes', () => {
            const key = service.generateKey();
            const plaintext = Buffer.from('secret data');
            const encrypted = service.encrypt(plaintext, key);
            // Corrupt magic
            encrypted[0] = 0x00;
            expect(() => service.decrypt(encrypted, key)).toThrow(/magic/i);
        });
    });
    describe('chunk encryption', () => {
        it('round-trips chunks with authenticated file metadata', () => {
            const key = service.generateKey();
            const plaintext = Buffer.from('chunk payload');
            const encrypted = service.encryptChunk(plaintext, key, 'file-1:chunk_3:v1');
            expect(service.decryptChunk(encrypted, key, 'file-1:chunk_3:v1')).toEqual(plaintext);
        });
        it('rejects a chunk with substituted file metadata', () => {
            const key = service.generateKey();
            const encrypted = service.encryptChunk(Buffer.from('chunk payload'), key, 'file-1:chunk_3:v1');
            expect(() => service.decryptChunk(encrypted, key, 'file-1:chunk_4:v1')).toThrow();
        });
    });
    describe('key wrapping', () => {
        it('wraps and unwraps a file key correctly', () => {
            const masterKey = service.generateKey();
            const fileKey = service.generateKey();
            const wrapped = service.wrapKey(fileKey, masterKey);
            const unwrapped = service.unwrapKey(wrapped, masterKey);
            expect(unwrapped.equals(fileKey)).toBe(true);
        });
        it('throws when unwrapping with wrong master key', () => {
            const masterKey1 = service.generateKey();
            const masterKey2 = service.generateKey();
            const fileKey = service.generateKey();
            const wrapped = service.wrapKey(fileKey, masterKey1);
            expect(() => service.unwrapKey(wrapped, masterKey2)).toThrow();
        });
    });
    describe('checksum', () => {
        it('produces a hex string', () => {
            const data = Buffer.from('test data');
            const checksum = service.computeChecksum(data);
            expect(checksum).toMatch(/^[0-9a-f]{64}$/);
        });
        it('produces the same checksum for identical data', () => {
            const data = Buffer.from('test data');
            expect(service.computeChecksum(data)).toBe(service.computeChecksum(data));
        });
        it('produces different checksums for different data', () => {
            const a = service.computeChecksum(Buffer.from('data a'));
            const b = service.computeChecksum(Buffer.from('data b'));
            expect(a).not.toBe(b);
        });
    });
});
