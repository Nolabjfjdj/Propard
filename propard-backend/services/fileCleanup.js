const FileAttachment = require('../models/FileAttachment');
const Message = require('../models/Message');
const GroupMessage = require('../models/GroupMessage');
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

  if (pending) {
    await FileAttachment.updateOne(
      { _id: file._id, status: 'deleted' },
      { $set: { cleanupPending: true } }
    );
    return false;
  }

  await FileAttachment.deleteOne({
    _id: file._id,
    status: 'deleted'
  });

  return true;
}

async function hasFileReferences(fileId) {
  const [privateReferences, groupReferences] = await Promise.all([
    Message.countDocuments({
      attachments: fileId,
      deleted: { $ne: true }
    }),
    GroupMessage.countDocuments({
      attachments: fileId,
      deleted: { $ne: true }
    })
  ]);

  return privateReferences > 0 || groupReferences > 0;
}

async function deleteMessageAttachments(fileIds, senderId) {
  if (!Array.isArray(fileIds) || fileIds.length === 0 || !senderId) {
    return { deleted: 0, cleanupPending: 0, stillReferenced: 0 };
  }

  const uniqueIds = [...new Set(fileIds.map(id => id.toString()))];
  const files = await FileAttachment.find({
    _id: { $in: uniqueIds },
    sender: senderId,
    status: { $in: ['uploading', 'ready', 'failed'] }
  });

  let cleanupPending = 0;
  let deleted = 0;
  let stillReferenced = 0;

  for (const file of files) {
    if (await hasFileReferences(file._id)) {
      stillReferenced += 1;
      continue;
    }

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

    if (await cleanupFileObjects(marked)) {
      deleted += 1;
    } else {
      cleanupPending += 1;
    }
  }

  return { deleted, cleanupPending, stillReferenced };
}

async function deleteFilesMatching(filter) {
  const files = await FileAttachment.find({
    ...filter,
    status: { $in: ['uploading', 'ready', 'failed'] }
  });

  let deleted = 0;
  let cleanupPending = 0;

  for (const file of files) {
    const marked = await FileAttachment.findOneAndUpdate(
      {
        _id: file._id,
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

    if (await cleanupFileObjects(marked)) {
      deleted += 1;
    } else {
      cleanupPending += 1;
    }
  }

  return { deleted, cleanupPending };
}

async function deleteFilesForUser(userId) {
  if (!userId) return { deleted: 0, cleanupPending: 0 };

  return deleteFilesMatching({
    $or: [
      { sender: userId },
      { scope: 'private', recipient: userId }
    ]
  });
}

async function deleteFilesForGroup(groupId) {
  if (!groupId) return { deleted: 0, cleanupPending: 0 };

  return deleteFilesMatching({
    scope: 'group',
    group: groupId
  });
}

async function retryPendingFileCleanup(limit = 100) {
  const now = new Date();
  const staleAttachmentDate = new Date(now.getTime() - 60 * 60 * 1000);
  const retryCheckDate = new Date(now.getTime() - 15 * 60 * 1000);

  const orphanedReadyFiles = await FileAttachment.find({
    status: 'ready',
    attachedAt: null,
    createdAt: { $lte: staleAttachmentDate }
  }).limit(limit);

  for (const file of orphanedReadyFiles) {
    await FileAttachment.updateOne(
      { _id: file._id, status: 'ready', attachedAt: null },
      {
        $set: {
          status: 'deleted',
          deletedAt: now,
          cleanupPending: true
        }
      }
    );
  }

  const detachedReadyFiles = await FileAttachment.find({
    status: 'ready',
    attachedAt: { $lte: staleAttachmentDate },
    $or: [
      { cleanupCheckedAt: null },
      { cleanupCheckedAt: { $lte: retryCheckDate } }
    ]
  }).limit(limit);

  let detachedDeleted = 0;
  let detachedStillReferenced = 0;

  for (const file of detachedReadyFiles) {
    if (await hasFileReferences(file._id)) {
      await FileAttachment.updateOne(
        { _id: file._id, status: 'ready' },
        { $set: { cleanupCheckedAt: now } }
      );
      detachedStillReferenced += 1;
      continue;
    }

    const marked = await FileAttachment.findOneAndUpdate(
      { _id: file._id, status: 'ready' },
      {
        $set: {
          status: 'deleted',
          deletedAt: now,
          cleanupPending: true
        }
      },
      { new: true }
    );

    if (marked && await cleanupFileObjects(marked)) {
      detachedDeleted += 1;
    }
  }

  const expiredUploads = await FileAttachment.find({
    status: 'uploading',
    uploadExpiresAt: { $lte: now }
  }).limit(limit);

  for (const file of expiredUploads) {
    await FileAttachment.updateOne(
      { _id: file._id, status: 'uploading' },
      {
        $set: {
          status: 'deleted',
          deletedAt: now,
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
    orphanedReadyFiles: orphanedReadyFiles.length,
    detachedReadyFiles: detachedReadyFiles.length,
    detachedDeleted,
    detachedStillReferenced,
    expiredUploads: expiredUploads.length,
    retried: pendingFiles.length
  };
}

module.exports = {
  deleteMessageAttachments,
  deleteFilesForUser,
  deleteFilesForGroup,
  retryPendingFileCleanup
};
