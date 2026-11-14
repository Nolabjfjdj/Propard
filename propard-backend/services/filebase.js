const {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand
} = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

const clients = new Map();
const MAX_STORAGE_CONFIGS = 100;

function validateStorageId(storageId) {
  if (!Number.isSafeInteger(storageId) || storageId < 1 || storageId > MAX_STORAGE_CONFIGS) {
    throw new Error('Identifiant de stockage Filebase invalide.');
  }

  return storageId;
}

function getFilebaseConfig(storageId = 1) {
  const id = validateStorageId(storageId);
  const suffix = id === 1 ? '' : String(id);
  const accessKeyId = process.env[`FILEBASE_KEY${suffix}`];
  const secretAccessKey = process.env[`FILEBASE_SECRET${suffix}`];
  const bucket = process.env[`FILEBASE_BUCKET${suffix}`];
  const endpoint = process.env.FILEBASE_ENDPOINT || 'https://s3.filebase.io';
  const region = process.env.FILEBASE_REGION || 'auto';

  if (!accessKeyId || !secretAccessKey || !bucket) {
    throw new Error(`Configuration Filebase ${id} incomplète.`);
  }

  let parsedEndpoint;
  try {
    parsedEndpoint = new URL(endpoint);
  } catch {
    throw new Error('Endpoint Filebase invalide.');
  }

  if (
    parsedEndpoint.protocol !== 'https:' ||
    parsedEndpoint.hostname !== 's3.filebase.io' ||
    parsedEndpoint.pathname !== '/' ||
    parsedEndpoint.search ||
    parsedEndpoint.hash ||
    parsedEndpoint.username ||
    parsedEndpoint.password
  ) {
    throw new Error('Endpoint Filebase non autorisé.');
  }

  if (!/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(bucket)) {
    throw new Error(`Nom de bucket Filebase ${id} invalide.`);
  }

  if (typeof region !== 'string' || !/^[a-z0-9-]{2,32}$/.test(region)) {
    throw new Error('Région Filebase invalide.');
  }

  return { id, accessKeyId, secretAccessKey, bucket, endpoint, region };
}

function getFilebaseClient(storageId = 1) {
  const config = getFilebaseConfig(storageId);
  const fingerprint = [
    config.accessKeyId,
    config.secretAccessKey,
    config.endpoint,
    config.region
  ].join('\u0000');

  let client = clients.get(fingerprint);

  if (!client) {
    client = new S3Client({
      endpoint: config.endpoint,
      region: config.region,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey
      },
      maxAttempts: 2
    });

    clients.set(fingerprint, client);
  }

  return { client, bucket: config.bucket, storageId: config.id };
}

function getConfiguredFilebaseStorageIds() {
  const ids = [];

  for (let id = 1; id <= MAX_STORAGE_CONFIGS; id += 1) {
    const suffix = id === 1 ? '' : String(id);
    const accessKeyId = process.env[`FILEBASE_KEY${suffix}`];
    const secretAccessKey = process.env[`FILEBASE_SECRET${suffix}`];
    const bucket = process.env[`FILEBASE_BUCKET${suffix}`];
    const hasAnyValue = Boolean(accessKeyId || secretAccessKey || bucket);

    if (!hasAnyValue) continue;

    if (!accessKeyId || !secretAccessKey || !bucket) {
      throw new Error(`Configuration Filebase ${id} incomplète.`);
    }

    getFilebaseConfig(id);
    ids.push(id);
  }

  return ids;
}

function validateObjectKey(objectKey) {
  if (
    typeof objectKey !== 'string' ||
    !objectKey ||
    objectKey.length > 1024 ||
    objectKey.startsWith('/') ||
    objectKey.includes('\\') ||
    /[\u0000-\u001f\u007f]/.test(objectKey) ||
    objectKey.split('/').some(part => part === '.' || part === '..')
  ) {
    throw new Error('Clé de stockage invalide.');
  }

  return objectKey;
}

async function createPresignedUploadUrl(objectKey, expiresIn = 300, storageId = 1) {
  const key = validateObjectKey(objectKey);
  if (!Number.isInteger(expiresIn) || expiresIn < 60 || expiresIn > 600) {
    throw new Error('Durée de signature invalide.');
  }

  const { client: s3, bucket } = getFilebaseClient(storageId);
  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    ContentType: 'application/octet-stream'
  });

  return getSignedUrl(s3, command, { expiresIn });
}

async function createPresignedDownloadUrl(objectKey, expiresIn = 300, storageId = 1) {
  const key = validateObjectKey(objectKey);
  if (!Number.isInteger(expiresIn) || expiresIn < 60 || expiresIn > 600) {
    throw new Error('Durée de signature invalide.');
  }

  const { client: s3, bucket } = getFilebaseClient(storageId);
  const command = new GetObjectCommand({
    Bucket: bucket,
    Key: key
  });

  return getSignedUrl(s3, command, { expiresIn });
}

async function headStoredObject(objectKey, storageId = 1) {
  const key = validateObjectKey(objectKey);
  const { client: s3, bucket } = getFilebaseClient(storageId);
  const result = await s3.send(new HeadObjectCommand({
    Bucket: bucket,
    Key: key
  }));

  return {
    size: Number.isSafeInteger(result.ContentLength) ? result.ContentLength : null,
    etag: result.ETag || null,
    lastModified: result.LastModified || null,
    contentType: result.ContentType || null
  };
}

async function deleteStoredObject(objectKey, storageId = 1) {
  const key = validateObjectKey(objectKey);
  const { client: s3, bucket } = getFilebaseClient(storageId);
  await s3.send(new DeleteObjectCommand({
    Bucket: bucket,
    Key: key
  }));
}

module.exports = {
  getConfiguredFilebaseStorageIds,
  createPresignedUploadUrl,
  createPresignedDownloadUrl,
  headStoredObject,
  deleteStoredObject
};
