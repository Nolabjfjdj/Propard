import api from './api';
import {
  FILE_CHUNK_SIZE,
  generateFileKey,
  encryptFileChunk,
  decryptFileChunk,
  wrapFileKeyForUser,
  unwrapFileKeyForUser,
  storeFileKeyLocally,
  encryptFileMetadata,
  decryptFileMetadata
} from './fileCrypto';
import {
  getStoredPrivateKeyJwk,
  publicKeyFromPrivateJwk
} from './crypto';

function parsePublicKey(value) {
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value);
    } catch {
      throw new Error('Clé publique E2EE illisible.');
    }
  }

  if (
    !value ||
    value.kty !== 'EC' ||
    value.crv !== 'P-256' ||
    typeof value.x !== 'string' ||
    typeof value.y !== 'string'
  ) {
    throw new Error('Clé publique E2EE indisponible.');
  }

  return value;
}

function getMemberId(member) {
  return (
    member?._id ||
    member?.userId?._id ||
    member?.userId
  )?.toString();
}

function getMemberPublicKey(member) {
  return parsePublicKey(
    member?.publicKey ||
    member?.userId?.publicKey
  );
}

function getFileCategory(file) {
  if (file.type?.startsWith('image/')) return 'image';
  if (file.type?.startsWith('video/')) return 'video';
  return 'document';
}

function authConfig(token) {
  return {
    headers: {
      Authorization: `Bearer ${token}`
    }
  };
}

export async function uploadConversationFile({
  file,
  scope,
  recipientId,
  recipientPublicKey,
  groupId,
  groupKeyVersion,
  groupMembers,
  userId,
  token,
  onProgress
}) {
  if (!(file instanceof File) || file.size < 1 || !token || !userId) {
    throw new Error('Fichier ou session invalide.');
  }

  const privateKeyJwk = await getStoredPrivateKeyJwk(userId);
  if (!privateKeyJwk) {
    throw new Error('Clé privée E2EE locale introuvable.');
  }

  const ownPublicKey = publicKeyFromPrivateJwk(privateKeyJwk);
  const fileKey = await generateFileKey();
  const keyVersion = scope === 'group' ? groupKeyVersion : 1;
  let keyPackages;

  if (scope === 'private') {
    if (!recipientId || !recipientPublicKey) {
      throw new Error('Clé publique du destinataire indisponible.');
    }

    keyPackages = [
      {
        userId: userId.toString(),
        encryptedKey: await wrapFileKeyForUser(
          fileKey,
          privateKeyJwk,
          ownPublicKey
        ),
        keyVersion
      },
      {
        userId: recipientId.toString(),
        encryptedKey: await wrapFileKeyForUser(
          fileKey,
          privateKeyJwk,
          parsePublicKey(recipientPublicKey)
        ),
        keyVersion
      }
    ];
  } else if (scope === 'group') {
    if (
      !groupId ||
      !Number.isSafeInteger(groupKeyVersion) ||
      !Array.isArray(groupMembers) ||
      groupMembers.length < 1 ||
      groupMembers.length > 50
    ) {
      throw new Error('Membres ou clé du groupe indisponibles.');
    }

    keyPackages = await Promise.all(
      groupMembers.map(async member => {
        const memberId = getMemberId(member);
        if (!memberId) throw new Error('Membre du groupe invalide.');

        const publicKey = memberId === userId.toString()
          ? ownPublicKey
          : getMemberPublicKey(member);

        return {
          userId: memberId,
          encryptedKey: await wrapFileKeyForUser(
            fileKey,
            privateKeyJwk,
            publicKey
          ),
          keyVersion
        };
      })
    );
  } else {
    throw new Error('Type de conversation invalide.');
  }

  const encryptedMetadata = await encryptFileMetadata(fileKey, {
    name: file.name,
    type: file.type || 'application/octet-stream',
    size: file.size,
    lastModified: file.lastModified
  });

  const chunkCount = Math.ceil(file.size / FILE_CHUNK_SIZE);
  const initPayload = {
    scope,
    category: getFileCategory(file),
    originalSize: file.size,
    chunkSize: FILE_CHUNK_SIZE,
    chunkCount,
    encryptedMetadata,
    keyPackages,
    ...(scope === 'private' ? { recipientId: recipientId.toString() } : {
      groupId: groupId.toString(),
      groupKeyVersion
    })
  };

  const created = await api.post(
    '/api/files/uploads',
    initPayload,
    authConfig(token)
  );

  const fileId = created.data?.fileId;
  if (!fileId) throw new Error('Le serveur n’a pas créé la session d’envoi.');

  try {
    await storeFileKeyLocally(fileId, fileKey);

    let nextIndex = 0;
    let completedBytes = 0;
    const worker = async () => {
      while (true) {
        const index = nextIndex;
        nextIndex += 1;
        if (index >= chunkCount) return;

        const start = index * FILE_CHUNK_SIZE;
        const end = Math.min(file.size, start + FILE_CHUNK_SIZE);
        const encrypted = await encryptFileChunk(
          fileKey,
          fileId,
          index,
          file.slice(start, end)
        );

        const signed = await api.post(
          `/api/files/uploads/${fileId}/chunks/${index}/url`,
          {
            iv: encrypted.iv,
            sha256: encrypted.sha256,
            encryptedSize: encrypted.encryptedSize
          },
          authConfig(token)
        );

        const response = await fetch(signed.data.uploadUrl, {
          method: 'PUT',
          headers: signed.data.headers,
          body: encrypted.data
        });

        if (!response.ok) {
          throw new Error(`Échec du transfert du morceau ${index + 1}.`);
        }

        completedBytes += end - start;
        onProgress?.(Math.min(99, Math.round(completedBytes / file.size * 100)));
      }
    };

    await Promise.all([
      worker(),
      worker()
    ]);

    await api.post(
      `/api/files/uploads/${fileId}/finalize`,
      {},
      authConfig(token)
    );

    onProgress?.(100);
    return fileId;
  } catch (error) {
    await api.delete(`/api/files/${fileId}`, authConfig(token)).catch(() => {});
    throw error;
  }
}

export async function downloadConversationFile(fileId, { userId, token }) {
  if (!fileId || !userId || !token) {
    throw new Error('Paramètres de téléchargement invalides.');
  }

  const response = await api.get(
    `/api/files/${fileId}`,
    authConfig(token)
  );
  const manifest = response.data;

  const privateKeyJwk = await getStoredPrivateKeyJwk(userId);
  if (!privateKeyJwk) {
    throw new Error('Clé privée E2EE locale introuvable.');
  }

  let senderPublicKey;

  if (manifest.senderId.toString() === userId.toString()) {
    senderPublicKey = publicKeyFromPrivateJwk(privateKeyJwk);
  } else {
    const senderResponse = await api.get(
      `/api/auth/user/${manifest.senderId}`,
      authConfig(token)
    );
    senderPublicKey = parsePublicKey(senderResponse.data?.publicKey);
  }

  const fileKey = await unwrapFileKeyForUser(
    manifest.keyPackage?.encryptedKey,
    privateKeyJwk,
    senderPublicKey
  );

  const metadata = await decryptFileMetadata(
    fileKey,
    manifest.encryptedMetadata
  );

  if (
    metadata.size !== manifest.originalSize ||
    !Array.isArray(manifest.chunks) ||
    manifest.chunks.length !== manifest.chunkCount
  ) {
    throw new Error('Manifeste de fichier incohérent.');
  }

  const plaintextChunks = new Array(manifest.chunkCount);
  let nextIndex = 0;

  const worker = async () => {
    while (true) {
      const position = nextIndex;
      nextIndex += 1;
      if (position >= manifest.chunks.length) return;

      const chunk = manifest.chunks[position];
      if (chunk.index !== position) {
        throw new Error('Ordre des morceaux invalide.');
      }

      const downloadResponse = await fetch(chunk.downloadUrl);
      if (!downloadResponse.ok) {
        throw new Error(`Impossible de télécharger le morceau ${position + 1}.`);
      }

      const encryptedBlob = await downloadResponse.blob();
      plaintextChunks[position] = await decryptFileChunk(
        fileKey,
        fileId,
        position,
        encryptedBlob,
        chunk.iv,
        chunk.sha256
      );
    }
  };

  await Promise.all([worker(), worker()]);

  const blob = new Blob(plaintextChunks, {
    type: metadata.type || 'application/octet-stream'
  });

  if (blob.size !== metadata.size) {
    throw new Error('La taille du fichier déchiffré est incorrecte.');
  }

  return {
    blob,
    name: metadata.name,
    type: metadata.type
  };
}
