import { deriveSharedKey, encryptMessage, decryptMessage } from './crypto';
const groupKeyStorageKey = (groupId, version) => `propard_groupkey_${groupId}_v${version}`;
export async function generateGroupKey() { return crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']); }
async function keyToBase64(key) { const raw = await crypto.subtle.exportKey('raw', key); return btoa(String.fromCharCode(...new Uint8Array(raw))); }
async function base64ToKey(raw) { const bytes = Uint8Array.from(atob(raw), c => c.charCodeAt(0)); return crypto.subtle.importKey('raw', bytes, { name: 'AES-GCM' }, true, ['encrypt', 'decrypt']); }
export async function encryptGroupKeyForMember(groupKey, myPrivateKeyJwk, memberPublicKeyJwk) { const pairwiseKey = await deriveSharedKey(myPrivateKeyJwk, memberPublicKeyJwk); return encryptMessage(pairwiseKey, await keyToBase64(groupKey)); }
export async function decryptGroupKeyPackage(encryptedPackage, myPrivateKeyJwk, senderPublicKeyJwk) { const pairwiseKey = await deriveSharedKey(myPrivateKeyJwk, senderPublicKeyJwk); const raw = await decryptMessage(pairwiseKey, encryptedPackage); return raw ? base64ToKey(raw) : null; }
export async function storeGroupKey(groupId, version, key) { localStorage.setItem(groupKeyStorageKey(groupId, version), await keyToBase64(key)); }
export async function getStoredGroupKey(groupId, version) { const raw = localStorage.getItem(groupKeyStorageKey(groupId, version)); return raw ? base64ToKey(raw) : null; }
