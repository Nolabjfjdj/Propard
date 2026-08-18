const CURVE = 'P-256';

export async function generateKeyPair() {
  const keyPair = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: CURVE },
    true,
    ['deriveKey']
  );
  const publicKeyJwk = await crypto.subtle.exportKey('jwk', keyPair.publicKey);
  const privateKeyJwk = await crypto.subtle.exportKey('jwk', keyPair.privateKey);
  return { publicKeyJwk, privateKeyJwk };
}

const privKeyStorageKey = (userId) => `propard_privkey_${userId}`;

export function storePrivateKey(userId, privateKeyJwk) {
  localStorage.setItem(privKeyStorageKey(userId), JSON.stringify(privateKeyJwk));
}

export function getStoredPrivateKeyJwk(userId) {
  if (!userId) return null;
  const raw = localStorage.getItem(privKeyStorageKey(userId));
  return raw ? JSON.parse(raw) : null;
}

export function hasStoredPrivateKey(userId) {
  return !!userId && !!localStorage.getItem(privKeyStorageKey(userId));
}

async function importPrivateKey(jwk) {
  return crypto.subtle.importKey(
    'jwk', jwk, { name: 'ECDH', namedCurve: CURVE }, true, ['deriveKey']
  );
}

async function importPublicKey(jwk) {
  return crypto.subtle.importKey(
    'jwk', jwk, { name: 'ECDH', namedCurve: CURVE }, true, []
  );
}

export async function deriveSharedKey(myPrivateKeyJwk, friendPublicKeyJwk) {
  const privateKey = await importPrivateKey(myPrivateKeyJwk);
  const publicKey = await importPublicKey(friendPublicKeyJwk);
  return crypto.subtle.deriveKey(
    { name: 'ECDH', public: publicKey },
    privateKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

function bufToBase64(buf) {
  return btoa(String.fromCharCode(...new Uint8Array(buf)));
}

function base64ToBuf(b64) {
  return Uint8Array.from(atob(b64), c => c.charCodeAt(0));
}

export async function encryptMessage(sharedKey, plaintext) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plaintext);
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv }, sharedKey, encoded
  );
  return JSON.stringify({
    v: 1,
    iv: bufToBase64(iv),
    ct: bufToBase64(ciphertext)
  });
}

export async function decryptMessage(sharedKey, payload) {
  try {
    const parsed = JSON.parse(payload);
    if (!parsed || parsed.v !== 1 || !parsed.iv || !parsed.ct) return null;
    const iv = base64ToBuf(parsed.iv);
    const ciphertext = base64ToBuf(parsed.ct);
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv }, sharedKey, ciphertext
    );
    return new TextDecoder().decode(decrypted);
  } catch {
    return null;
  }
}