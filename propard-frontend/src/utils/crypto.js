// Chiffrement de bout en bout des messages.
// - ECDH P-256 pour les clés de compte.
// - AES-256-GCM pour les messages.
// - Sauvegarde de la clé privée chiffrée par le mot de passe pour
//   permettre de retrouver la même identité E2EE sur un autre navigateur
//   ou appareil.
// Le serveur ne reçoit jamais le mot de passe ni la clé privée en clair.

const CURVE = 'P-256';
const BACKUP_VERSION = 1;
const BACKUP_ITERATIONS = 600000;

const privKeyStorageKey = userId =>
  `propard_privkey_${userId}`;

export async function generateKeyPair() {
  const keyPair = await crypto.subtle.generateKey(
    {
      name: 'ECDH',
      namedCurve: CURVE
    },
    true,
    ['deriveKey']
  );

  const publicKeyJwk =
    await crypto.subtle.exportKey(
      'jwk',
      keyPair.publicKey
    );

  const privateKeyJwk =
    await crypto.subtle.exportKey(
      'jwk',
      keyPair.privateKey
    );

  return {
    publicKeyJwk,
    privateKeyJwk
  };
}

export function storePrivateKey(
  userId,
  privateKeyJwk
) {
  localStorage.setItem(
    privKeyStorageKey(userId),
    JSON.stringify(privateKeyJwk)
  );
}

export function getStoredPrivateKeyJwk(
  userId
) {
  if (!userId) {
    return null;
  }

  try {
    const raw =
      localStorage.getItem(
        privKeyStorageKey(userId)
      );

    return raw
      ? JSON.parse(raw)
      : null;
  } catch {
    return null;
  }
}

export function hasStoredPrivateKey(
  userId
) {
  return !!getStoredPrivateKeyJwk(userId);
}

export function publicKeyFromPrivateJwk(
  privateKeyJwk
) {
  if (
    !privateKeyJwk ||
    privateKeyJwk.kty !== 'EC' ||
    privateKeyJwk.crv !== CURVE ||
    typeof privateKeyJwk.x !== 'string' ||
    typeof privateKeyJwk.y !== 'string'
  ) {
    throw new Error(
      'Clé privée E2EE invalide.'
    );
  }

  return {
    kty: privateKeyJwk.kty,
    crv: privateKeyJwk.crv,
    x: privateKeyJwk.x,
    y: privateKeyJwk.y,
    ext: true,
    key_ops: []
  };
}

export function publicKeysEqual(
  a,
  b
) {
  try {
    const left =
      typeof a === 'string'
        ? JSON.parse(a)
        : a;

    const right =
      typeof b === 'string'
        ? JSON.parse(b)
        : b;

    return (
      left?.kty === right?.kty &&
      left?.crv === right?.crv &&
      left?.x === right?.x &&
      left?.y === right?.y
    );
  } catch {
    return false;
  }
}

async function importPrivateKey(
  jwk
) {
  return crypto.subtle.importKey(
    'jwk',
    jwk,
    {
      name: 'ECDH',
      namedCurve: CURVE
    },
    true,
    ['deriveKey']
  );
}

async function importPublicKey(
  jwk
) {
  return crypto.subtle.importKey(
    'jwk',
    jwk,
    {
      name: 'ECDH',
      namedCurve: CURVE
    },
    true,
    []
  );
}

export async function deriveSharedKey(
  myPrivateKeyJwk,
  friendPublicKeyJwk
) {
  const privateKey =
    await importPrivateKey(
      myPrivateKeyJwk
    );

  const publicKey =
    await importPublicKey(
      friendPublicKeyJwk
    );

  return crypto.subtle.deriveKey(
    {
      name: 'ECDH',
      public: publicKey
    },
    privateKey,
    {
      name: 'AES-GCM',
      length: 256
    },
    false,
    ['encrypt', 'decrypt']
  );
}

function bytesToBase64(
  bytes
) {
  let binary = '';

  const chunkSize = 0x8000;

  for (
    let i = 0;
    i < bytes.length;
    i += chunkSize
  ) {
    binary += String.fromCharCode(
      ...bytes.subarray(
        i,
        Math.min(
          i + chunkSize,
          bytes.length
        )
      )
    );
  }

  return btoa(binary);
}

function base64ToBytes(
  value
) {
  const binary = atob(value);

  const bytes =
    new Uint8Array(
      binary.length
    );

  for (
    let i = 0;
    i < binary.length;
    i++
  ) {
    bytes[i] =
      binary.charCodeAt(i);
  }

  return bytes;
}

function textToBase64(
  text
) {
  return bytesToBase64(
    new TextEncoder().encode(text)
  );
}

function base64ToText(
  value
) {
  return new TextDecoder().decode(
    base64ToBytes(value)
  );
}

export async function encryptMessage(
  sharedKey,
  plaintext
) {
  if (!sharedKey) {
    throw new Error(
      'Clé de chiffrement indisponible.'
    );
  }

  const iv =
    crypto.getRandomValues(
      new Uint8Array(12)
    );

  const encoded =
    new TextEncoder().encode(
      plaintext
    );

  const ciphertext =
    await crypto.subtle.encrypt(
      {
        name: 'AES-GCM',
        iv
      },
      sharedKey,
      encoded
    );

  return JSON.stringify({
    v: 1,
    iv: bytesToBase64(iv),
    ct: bytesToBase64(
      new Uint8Array(ciphertext)
    )
  });
}

export async function decryptMessage(
  sharedKey,
  payload
) {
  try {
    if (!sharedKey) {
      return null;
    }

    const parsed =
      typeof payload === 'string'
        ? JSON.parse(payload)
        : payload;

    if (
      !parsed ||
      parsed.v !== 1 ||
      typeof parsed.iv !== 'string' ||
      typeof parsed.ct !== 'string'
    ) {
      return null;
    }

    const iv =
      base64ToBytes(parsed.iv);

    const ciphertext =
      base64ToBytes(parsed.ct);

    if (iv.length !== 12) {
      return null;
    }

    const decrypted =
      await crypto.subtle.decrypt(
        {
          name: 'AES-GCM',
          iv
        },
        sharedKey,
        ciphertext
      );

    return new TextDecoder().decode(
      decrypted
    );
  } catch {
    return null;
  }
}


/*
 * ============================================================
 * SAUVEGARDE E2EE DE LA CLÉ PRIVÉE
 * ============================================================
 *
 * La clé privée est chiffrée localement avec une clé dérivée du
 * mot de passe du compte via PBKDF2-HMAC-SHA-256.
 *
 * Le serveur peut donc stocker le paquet chiffré, mais il ne
 * possède pas le mot de passe et ne peut pas récupérer la clé
 * privée à partir du paquet seul.
 *
 * Cette sauvegarde permet à un nouvel appareil de retrouver la
 * même identité E2EE au lieu de générer une nouvelle clé et de
 * casser les conversations existantes.
 */

async function deriveBackupKey(
  password,
  salt,
  iterations
) {
  if (
    typeof password !== 'string' ||
    !password
  ) {
    throw new Error(
      'Mot de passe requis pour la sauvegarde E2EE.'
    );
  }

  const material =
    await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(password),
      {
        name: 'PBKDF2'
      },
      false,
      ['deriveKey']
    );

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations,
      hash: 'SHA-256'
    },
    material,
    {
      name: 'AES-GCM',
      length: 256
    },
    false,
    ['encrypt', 'decrypt']
  );
}

export async function createPrivateKeyBackup(
  privateKeyJwk,
  password
) {
  if (
    !privateKeyJwk ||
    typeof privateKeyJwk !== 'object'
  ) {
    throw new Error(
      'Clé privée E2EE absente.'
    );
  }

  const salt =
    crypto.getRandomValues(
      new Uint8Array(16)
    );

  const iv =
    crypto.getRandomValues(
      new Uint8Array(12)
    );

  const iterations =
    BACKUP_ITERATIONS;

  const backupKey =
    await deriveBackupKey(
      password,
      salt,
      iterations
    );

  const plaintext =
    new TextEncoder().encode(
      JSON.stringify(privateKeyJwk)
    );

  const ciphertext =
    await crypto.subtle.encrypt(
      {
        name: 'AES-GCM',
        iv
      },
      backupKey,
      plaintext
    );

  return {
    version:
      BACKUP_VERSION,
    iterations,
    salt:
      bytesToBase64(salt),
    iv:
      bytesToBase64(iv),
    ciphertext:
      bytesToBase64(
        new Uint8Array(ciphertext)
      )
  };
}

export async function decryptPrivateKeyBackup(
  backup,
  password
) {
  try {
    if (
      !backup ||
      backup.version !== BACKUP_VERSION ||
      typeof backup.iterations !== 'number' ||
      backup.iterations < 100000 ||
      backup.iterations > 2000000 ||
      typeof backup.salt !== 'string' ||
      typeof backup.iv !== 'string' ||
      typeof backup.ciphertext !== 'string'
    ) {
      return null;
    }

    const salt =
      base64ToBytes(
        backup.salt
      );

    const iv =
      base64ToBytes(
        backup.iv
      );

    const ciphertext =
      base64ToBytes(
        backup.ciphertext
      );

    if (
      salt.length !== 16 ||
      iv.length !== 12 ||
      ciphertext.length < 16
    ) {
      return null;
    }

    const backupKey =
      await deriveBackupKey(
        password,
        salt,
        backup.iterations
      );

    const plaintext =
      await crypto.subtle.decrypt(
        {
          name: 'AES-GCM',
          iv
        },
        backupKey,
        ciphertext
      );

    const privateKey =
      JSON.parse(
        new TextDecoder().decode(
          plaintext
        )
      );

    if (
      privateKey?.kty !== 'EC' ||
      privateKey?.crv !== CURVE ||
      typeof privateKey?.x !== 'string' ||
      typeof privateKey?.y !== 'string' ||
      typeof privateKey?.d !== 'string'
    ) {
      return null;
    }

    return privateKey;
  } catch {
    return null;
  }
}

export function getE2EEBackupVersion() {
  return BACKUP_VERSION;
}
