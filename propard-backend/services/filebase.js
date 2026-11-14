const {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand
} = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

let client = null;
let clientFingerprint = null;

function getFilebaseConfig() {
  const accessKeyId = process.env.FILEBASE_KEY;
  const secretAccessKey = process.env.FILEBASE_SECRET;
  const bucket = process.env.FILEBASE_BUCKET;
  const endpoint = process.env.FILEBASE_ENDPOINT || 'https://s3.filebase.io';
  const region = process.env.FILEBASE_REGION || 'auto';

  if (!accessKeyId || !secretAccessKey || !bucket) {
    throw new Error('Configuration Filebase incomplète.');
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
    throw new Error('Nom de bucket Filebase invalide.');
  }

  if (typeof region !== 'string' || !/^[a-z0-9-]{2,32}$/.test(region)) {
    throw new Error('Région Filebase invalide.');
  }

  return { accessKeyId, secretAccessKey, bucket, endpoint, region };
}

function getFilebaseClient() {
  const config = getFilebaseConfig();
  const fingerprint = [
    config.accessKeyId,
    config.secretAccessKey,
    config.endpoint,
    config.region
  ].join('\u0000');

  if (!client || clientFingerprint !== fingerprint) {
    if (client) client.destroy();

    client = new S3Client({
      endpoint: config.endpoint,
      region: config.region,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey
      },
      maxAttempts: 2
    });

    clientFingerprint = fingerprint;
  }

  return { client, bucket: config.bucket };
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

async function createPresignedUploadUrl(objectKey, expiresIn = 300) {
  const key = validateObjectKey(objectKey);
  if (!Number.isInteger(expiresIn) || expiresIn < 60 || expiresIn > 600) {
    throw new Error('Durée de signature invalide.');
  }

  const { client: s3, bucket } = getFilebaseClient();
  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    ContentType: 'application/octet-stream'
  });

  return getSignedUrl(s3, command, { expiresIn });
}

async function createPresignedDownloadUrl(objectKey, expiresIn = 300) {
  const key = validateObjectKey(objectKey);
  if (!Number.isInteger(expiresIn) || expiresIn < 60 || expiresIn > 600) {
    throw new Error('Durée de signature invalide.');
  }

  const { client: s3, bucket } = getFilebaseClient();
  const command = new GetObjectCommand({
    Bucket: bucket,
    Key: key
  });

  return getSignedUrl(s3, command, { expiresIn });
}

async function headStoredObject(objectKey) {
  const key = validateObjectKey(objectKey);
  const { client: s3, bucket } = getFilebaseClient();
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

async function deleteStoredObject(objectKey) {
  const key = validateObjectKey(objectKey);
  const { client: s3, bucket } = getFilebaseClient();
  await s3.send(new DeleteObjectCommand({
    Bucket: bucket,
    Key: key
  }));
}

module.exports = {
  createPresignedUploadUrl,
  createPresignedDownloadUrl,
  headStoredObject,
  deleteStoredObject
};
