import { deriveSharedKey, encryptMessage, decryptMessage, storeSecureLocalValue, getSecureLocalValue } from './crypto';

const groupKeyStorageKey = (groupId, version) => `propard_groupkey_${groupId}_v${version}`;

export async function generateGroupKey() {
  return crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  );
}

async function keyToBase64(key) {
  const raw = await crypto.subtle.exportKey('raw', key);
  return btoa(String.fromCharCode(...new Uint8Array(raw)));
}

async function base64ToKey(raw) {
  const bytes = Uint8Array.from(atob(raw), c => c.charCodeAt(0));
  return crypto.subtle.importKey(
    'raw',
    bytes,
    { name: 'AES-GCM' },
    true,
    ['encrypt', 'decrypt']
  );
}

export async function encryptGroupKeyForMember(groupKey, myPrivateKeyJwk, memberPublicKeyJwk) {
  const pairwiseKey = await deriveSharedKey(myPrivateKeyJwk, memberPublicKeyJwk);
  return encryptMessage(pairwiseKey, await keyToBase64(groupKey));
}

export async function decryptGroupKeyPackage(encryptedPackage, myPrivateKeyJwk, senderPublicKeyJwk) {
  const pairwiseKey = await deriveSharedKey(myPrivateKeyJwk, senderPublicKeyJwk);
  const raw = await decryptMessage(pairwiseKey, encryptedPackage);
  return raw ? base64ToKey(raw) : null;
}

export async function storeGroupKey(groupId, version, key) {
  const storageKey = groupKeyStorageKey(groupId, version);
  await storeSecureLocalValue(storageKey, await keyToBase64(key));
  localStorage.removeItem(storageKey);
}

export async function getStoredGroupKey(groupId, version) {
  const storageKey = groupKeyStorageKey(groupId, version);

  try {
    const raw = await getSecureLocalValue(storageKey);
    if (raw) return await base64ToKey(raw);
  } catch {
    // Si IndexedDB est temporairement indisponible, tenter l'ancien stockage.
  }

  const legacyRaw = localStorage.getItem(storageKey);
  if (!legacyRaw) return null;

  const key = await base64ToKey(legacyRaw);
  try {
    await storeSecureLocalValue(storageKey, legacyRaw);
    localStorage.removeItem(storageKey);
  } catch {
    // Garder l'ancien élément pour éviter de perdre l'accès à la clé si la migration échoue.
  }
  return key;
}
