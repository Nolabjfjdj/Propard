// Chiffrement de bout en bout des messages.
// - ECDH (P-256) pour dériver une clé secrète partagée entre 2 comptes,
//   sans jamais transmettre cette clé au serveur.
// - AES-256-GCM pour chiffrer/déchiffrer chaque message individuellement.
// La clé privée d'un utilisateur ne quitte JAMAIS son navigateur : seule
// sa clé publique est envoyée au serveur (comme un annuaire).

const CURVE = 'P-256';

// Génère une nouvelle paire de clés ECDH pour un compte.
// extractable=true pour pouvoir sauvegarder la clé privée en local.
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

// Une clé privée JWK contient déjà x/y (les composantes publiques) en plus
// de d (la composante privée). On peut donc reconstruire la clé publique
// correspondante sans jamais régénérer une nouvelle paire — utile pour
// re-synchroniser le serveur si un envoi précédent avait échoué, sans
// invalider les messages déjà échangés avec cette clé.
export function publicKeyFromPrivateJwk(privateKeyJwk) {
  const { kty, crv, x, y } = privateKeyJwk;
  return { kty, crv, x, y, ext: true, key_ops: [] };
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

// Dérive la clé AES-GCM partagée entre "moi" et un ami à partir de :
// - ma clé privée (jamais transmise)
// - sa clé publique (récupérée via le serveur, comme un annuaire)
// Propriété ECDH : le résultat est identique côté ami en inversant les
// rôles, donc pas besoin de renégocier qui a envoyé quoi.
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

// Chiffre un texte en clair. Retourne une string JSON prête à stocker
// telle quelle dans le champ `content` existant (pas de migration de schéma).
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

// Déchiffre le contenu stocké. Retourne null si le payload n'est pas
// un message chiffré reconnu (ex: erreur, clé fausse, contenu corrompu).
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
