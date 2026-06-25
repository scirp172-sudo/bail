"use strict";
const { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } = require('crypto');
const curve = require('libsignal/src/curve.js');
const { KEY_BUNDLE_TYPE } = require('../Defaults/index.js');
const _reexport_whatsapp_rust_bridge = require('whatsapp-rust-bridge');
exports.md5 = _reexport_whatsapp_rust_bridge.md5;
exports.hkdf = _reexport_whatsapp_rust_bridge.hkdf;
// insure browser & node compatibility
const { subtle } = globalThis.crypto;
/** prefix version byte to the pub keys, required for some curve crypto functions */
const generateSignalPubKey = (pubKey) => pubKey.length === 33 ? pubKey : Buffer.concat([KEY_BUNDLE_TYPE, pubKey]);
exports.generateSignalPubKey = generateSignalPubKey;
const Curve = {
    generateKeyPair: () => {
        const { pubKey, privKey } = curve.generateKeyPair();
        return {
            private: Buffer.from(privKey),
            // remove version byte
            public: Buffer.from(pubKey.slice(1))
        };
    },
    sharedKey: (privateKey, publicKey) => {
        const shared = curve.calculateAgreement(generateSignalPubKey(publicKey), privateKey);
        return Buffer.from(shared);
    },
    sign: (privateKey, buf) => curve.calculateSignature(privateKey, buf),
    verify: (pubKey, message, signature) => {
        try {
            curve.verifySignature(generateSignalPubKey(pubKey), message, signature);
            return true;
        }
        catch (error) {
            return false;
        }
    }
};
exports.Curve = Curve;
const signedKeyPair = (identityKeyPair, keyId) => {
    const preKey = Curve.generateKeyPair();
    const pubKey = generateSignalPubKey(preKey.public);
    const signature = Curve.sign(identityKeyPair.private, pubKey);
    return { keyPair: preKey, signature, keyId };
};
exports.signedKeyPair = signedKeyPair;
const GCM_TAG_LENGTH = 128 >> 3;
/**
 * encrypt AES 256 GCM;
 * where the tag tag is suffixed to the ciphertext
 * */
function aesEncryptGCM(plaintext, key, iv, additionalData) {
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    cipher.setAAD(additionalData);
    return Buffer.concat([cipher.update(plaintext), cipher.final(), cipher.getAuthTag()]);
}
exports.aesEncryptGCM = aesEncryptGCM;
/**
 * decrypt AES 256 GCM;
 * where the auth tag is suffixed to the ciphertext
 * */
function aesDecryptGCM(ciphertext, key, iv, additionalData) {
    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    // decrypt additional adata
    const enc = ciphertext.slice(0, ciphertext.length - GCM_TAG_LENGTH);
    const tag = ciphertext.slice(ciphertext.length - GCM_TAG_LENGTH);
    // set additional data
    decipher.setAAD(additionalData);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(enc), decipher.final()]);
}
exports.aesDecryptGCM = aesDecryptGCM;
function aesEncryptCTR(plaintext, key, iv) {
    const cipher = createCipheriv('aes-256-ctr', key, iv);
    return Buffer.concat([cipher.update(plaintext), cipher.final()]);
}
exports.aesEncryptCTR = aesEncryptCTR;
function aesDecryptCTR(ciphertext, key, iv) {
    const decipher = createDecipheriv('aes-256-ctr', key, iv);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}
exports.aesDecryptCTR = aesDecryptCTR;
/** decrypt AES 256 CBC; where the IV is prefixed to the buffer */
function aesDecrypt(buffer, key) {
    return aesDecryptWithIV(buffer.subarray(16), key, buffer.subarray(0, 16));
}
exports.aesDecrypt = aesDecrypt;
/** decrypt AES 256 CBC */
function aesDecryptWithIV(buffer, key, IV) {
    const aes = createDecipheriv('aes-256-cbc', key, IV);
    return Buffer.concat([aes.update(buffer), aes.final()]);
}
exports.aesDecryptWithIV = aesDecryptWithIV;
// encrypt AES 256 CBC; where a random IV is prefixed to the buffer
function aesEncrypt(buffer, key) {
    const IV = randomBytes(16);
    const aes = createCipheriv('aes-256-cbc', key, IV);
    return Buffer.concat([IV, aes.update(buffer), aes.final()]); // prefix IV to the buffer
}
exports.aesEncrypt = aesEncrypt;
// encrypt AES 256 CBC with a given IV
function aesEncrypWithIV(buffer, key, IV) {
    const aes = createCipheriv('aes-256-cbc', key, IV);
    return Buffer.concat([aes.update(buffer), aes.final()]); // prefix IV to the buffer
}
exports.aesEncrypWithIV = aesEncrypWithIV;
// sign HMAC using SHA 256
function hmacSign(buffer, key, variant = 'sha256') {
    return createHmac(variant, key).update(buffer).digest();
}
exports.hmacSign = hmacSign;
function sha256(buffer) {
    return createHash('sha256').update(buffer).digest();
}
exports.sha256 = sha256;
async function derivePairingCodeKey(pairingCode, salt) {
    // Convert inputs to formats Web Crypto API can work with
    const encoder = new TextEncoder();
    const pairingCodeBuffer = encoder.encode(pairingCode);
    const saltBuffer = new Uint8Array(salt instanceof Uint8Array ? salt : new Uint8Array(salt));
    // Import the pairing code as key material
    const keyMaterial = await subtle.importKey('raw', pairingCodeBuffer, { name: 'PBKDF2' }, false, [
        'deriveBits'
    ]);
    // Derive bits using PBKDF2 with the same parameters
    // 2 << 16 = 131,072 iterations
    const derivedBits = await subtle.deriveBits({
        name: 'PBKDF2',
        salt: saltBuffer,
        iterations: 2 << 16,
        hash: 'SHA-256'
    }, keyMaterial, 32 * 8 // 32 bytes * 8 = 256 bits
    );
    return Buffer.from(derivedBits);
}
exports.derivePairingCodeKey = derivePairingCodeKey;