const FileAttachment = require('../models/FileAttachment');
const { deleteStoredObject } = require('./filebase');

async function cleanupFileObjects(file) {
  let pending = false;

  for (const chunk of file.chunks || []) {
    try {
      await deleteStoredObject(chunk.objectKey, chunk.storageId);
    } catch (error) {
      pending = true;
      console.error('File object cleanup error:', error);
    }
  }

  await FileAttachment.updateOne(
    { _id: file._id, status: 'deleted' },
    { $set: { cleanupPending: pending } }
  );

  return !pending;
}

async function deleteMessageAttachments(fileIds, senderId) {
  if (!Array.isArray(fileIds) || fileIds.length === 0 || !senderId) {
    return { deleted: 0, cleanupPending: 0 };
  }

  const uniqueIds = [...new Set(fileIds.map(id => id.toString()))];
  const files = await FileAttachment.find({
    _id: { $in: uniqueIds },
    sender: senderId,
    status: { $in: ['uploading', 'ready', 'failed'] }
  });

  let cleanupPending = 0;
  let deleted = 0;

  for (const file of files) {
    const marked = await FileAttachment.findOneAndUpdate(
      {
        _id: file._id,
        sender: senderId,
        status: { $in: ['uploading', 'ready', 'failed'] }
      },
      {
        $set: {
          status: 'deleted',
          deletedAt: new Date(),
          cleanupPending: true
        }
      },
      { new: true }
    );

    if (!marked) continue;

    deleted += 1;
    if (!(await cleanupFileObjects(marked))) cleanupPending += 1;
  }

  return { deleted, cleanupPending };
}

async function retryPendingFileCleanup(limit = 100) {
  const expiredUploads = await FileAttachment.find({
    status: 'uploading',
    uploadExpiresAt: { $lte: new Date() }
  }).limit(limit);

  for (const file of expiredUploads) {
    await FileAttachment.updateOne(
      { _id: file._id, status: 'uploading' },
      {
        $set: {
          status: 'deleted',
          deletedAt: new Date(),
          cleanupPending: true
        }
      }
    );
  }

  const pendingFiles = await FileAttachment.find({
    status: 'deleted',
    cleanupPending: true
  }).limit(limit);

  for (const file of pendingFiles) {
    await cleanupFileObjects(file);
  }

  return {
    expiredUploads: expiredUploads.length,
    retried: pendingFiles.length
  };
}

module.exports = {
  deleteMessageAttachments,
  retryPendingFileCleanup
};
