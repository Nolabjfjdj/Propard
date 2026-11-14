import {
  deriveSharedKey,
  encryptMessage,
  decryptMessage,
  storeSecureLocalValue,
  getSecureLocalValue
} from './crypto';

export const FILE_CHUNK_SIZE = 8 * 1024 * 1024;

const FILE_KEY_STORAGE_PREFIX = 'propard_filekey_';
const FILE_CRYPTO_VERSION = 1;

function bytesToBase64(value) {
  const bytes = value instanceof Uint8Array ? value : new Uint8Array(value);
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
}

function base64ToBytes(value, expectedLength = null) {
  if (
    typeof value !== 'string' ||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)
  ) {
    throw new Error('Donnée Base64 invalide.');
  }

  const binary = atob(value);
  const bytes = Uint8Array.from(binary, character => character.charCodeAt(0));

  if (
    bytesToBase64(bytes) !== value ||
    (expectedLength !== null && bytes.length !== expectedLength)
  ) {
    throw new Error('Taille de donnée cryptographique invalide.');
  }

  return bytes;
}

function validateFileContext(fileId, chunkIndex) {
  if (
    typeof fileId !== 'string' ||
    !/^[a-f0-9]{24}$/i.test(fileId) ||
    !Number.isSafeInteger(chunkIndex) ||
    chunkIndex < 0 ||
    chunkIndex >= 640
  ) {
    throw new Error('Identifiant ou index de morceau invalide.');
  }
}

function getChunkAdditionalData(fileId, chunkIndex) {
  return new TextEncoder().encode(
    `propard:file:v${FILE_CRYPTO_VERSION}:${fileId.toLowerCase()}:${chunkIndex}`
  );
}

async function sha256Hex(data) {
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest), byte =>
    byte.toString(16).padStart(2, '0')
  ).join('');
}

export async function generateFileKey() {
  return crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  );
}

export async function encryptFileChunk(fileKey, fileId, chunkIndex, plaintext) {
  validateFileContext(fileId, chunkIndex);

  if (
    !fileKey ||
    !(plaintext instanceof Blob) ||
    plaintext.size < 1 ||
    plaintext.size > FILE_CHUNK_SIZE
  ) {
    throw new Error('Morceau de fichier invalide.');
  }

  const iv = crypto.getRandomValues(new Uint8Array(12));
  const additionalData = getChunkAdditionalData(fileId, chunkIndex);
  const plaintextBytes = await plaintext.arrayBuffer();

  const encrypted = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv,
      additionalData,
      tagLength: 128
    },
    fileKey,
    plaintextBytes
  );

  const encryptedBytes = new Uint8Array(encrypted);

  return {
    data: new Blob([encryptedBytes], { type: 'application/octet-stream' }),
    iv: bytesToBase64(iv),
    encryptedSize: encryptedBytes.byteLength,
    sha256: await sha256Hex(encryptedBytes)
  };
}

export async function decryptFileChunk(fileKey, fileId, chunkIndex, encryptedData, ivBase64, expectedSha256) {
  validateFileContext(fileId, chunkIndex);

  if (
    !fileKey ||
    !(encryptedData instanceof Blob) ||
    encryptedData.size < 17 ||
    encryptedData.size > FILE_CHUNK_SIZE + 16 ||
    typeof expectedSha256 !== 'string' ||
    !/^[a-f0-9]{64}$/.test(expectedSha256)
  ) {
    throw new Error('Morceau chiffré invalide.');
  }

  const iv = base64ToBytes(ivBase64, 12);
  const encryptedBytes = await encryptedData.arrayBuffer();
  const actualSha256 = await sha256Hex(encryptedBytes);

  if (actualSha256 !== expectedSha256) {
    throw new Error('Vérification d’intégrité du fichier échouée.');
  }

  const plaintext = await crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv,
      additionalData: getChunkAdditionalData(fileId, chunkIndex),
      tagLength: 128
    },
    fileKey,
    encryptedBytes
  );

  return new Blob([plaintext]);
}

export async function exportFileKey(fileKey) {
  if (!fileKey) {
    throw new Error('Clé de fichier indisponible.');
  }

  const raw = await crypto.subtle.exportKey('raw', fileKey);
  return bytesToBase64(raw);
}

export async function importFileKey(encodedKey) {
  const raw = base64ToBytes(encodedKey, 32);

  return crypto.subtle.importKey(
    'raw',
    raw,
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  );
}

export async function wrapFileKeyForUser(fileKey, senderPrivateKeyJwk, recipientPublicKeyJwk) {
  if (!senderPrivateKeyJwk || !recipientPublicKeyJwk) {
    throw new Error('Clés E2EE du destinataire indisponibles.');
  }

  const sharedKey = await deriveSharedKey(
    senderPrivateKeyJwk,
    recipientPublicKeyJwk
  );

  return encryptMessage(sharedKey, await exportFileKey(fileKey));
}

export async function unwrapFileKeyForUser(encryptedPackage, recipientPrivateKeyJwk, senderPublicKeyJwk) {
  if (
    typeof encryptedPackage !== 'string' ||
    !recipientPrivateKeyJwk ||
    !senderPublicKeyJwk
  ) {
    throw new Error('Paquet de clé de fichier invalide.');
  }

  const sharedKey = await deriveSharedKey(
    recipientPrivateKeyJwk,
    senderPublicKeyJwk
  );

  const encodedKey = await decryptMessage(sharedKey, encryptedPackage);

  if (!encodedKey) {
    throw new Error('Impossible de déchiffrer la clé du fichier.');
  }

  return importFileKey(encodedKey);
}

export async function storeFileKeyLocally(fileId, fileKey) {
  validateFileContext(fileId, 0);
  await storeSecureLocalValue(
    `${FILE_KEY_STORAGE_PREFIX}${fileId}`,
    await exportFileKey(fileKey)
  );
}

export async function getStoredFileKey(fileId) {
  validateFileContext(fileId, 0);

  const encodedKey = await getSecureLocalValue(
    `${FILE_KEY_STORAGE_PREFIX}${fileId}`
  );

  return encodedKey ? importFileKey(encodedKey) : null;
}
