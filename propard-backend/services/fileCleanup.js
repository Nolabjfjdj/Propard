const FileAttachment = require('../models/FileAttachment');
const { deleteStoredObject } = require('./filebase');

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

    let pending = false;

    for (const chunk of marked.chunks) {
      try {
        await deleteStoredObject(chunk.objectKey, chunk.storageId);
      } catch (error) {
        pending = true;
        console.error('Message attachment cleanup error:', error);
      }
    }

    await FileAttachment.updateOne(
      { _id: marked._id, status: 'deleted' },
      { $set: { cleanupPending: pending } }
    );

    if (pending) cleanupPending += 1;
  }

  return {
    deleted: files.length,
    cleanupPending
  };
}

module.exports = { deleteMessageAttachments };
