const mongoose = require('mongoose');

const shards = [];
const schemas = new Map();
let activeShard = 0;
let initialized = false;

function isFullError(error) {
  const code = Number(error?.code);
  const message = String(error?.message || '').toLowerCase();
  return code === 8000 || message.includes('space quota') || message.includes('quota') || message.includes('disk full') || (message.includes('storage') && message.includes('full'));
}

function getUris() {
  const uris = [];
  for (let i = 1; ; i++) {
    const key = i === 1 ? 'MONGO_URI' : `MONGO_URI_${i}`;
    if (!process.env[key]) break;
    uris.push(process.env[key]);
  }
  return uris;
}

function registerModel(name, schema) {
  schemas.set(name, schema);
  return facade(name);
}

function rawModel(index, name) {
  const shard = shards[index];
  if (!shard) return null;
  if (!shard.models.has(name)) {
    shard.models.set(name, shard.connection.model(name, schemas.get(name)));
  }
  return shard.models.get(name);
}

async function connectShards() {
  if (initialized) return;
  initialized = true;
  const uris = getUris();
  if (!uris.length) throw new Error('MONGO_URI est requis.');

  for (let i = 0; i < uris.length; i++) {
    const connection = mongoose.createConnection(uris[i], {
      bufferCommands: false,
      serverSelectionTimeoutMS: 10000
    });
    const shard = { index: i, connection, models: new Map(), ready: false, full: false };
    shards.push(shard);
    try {
      await connection.asPromise();
      shard.ready = true;
      console.log(`✅ MongoDB shard ${i + 1} connecté`);
    } catch (error) {
      console.error(`❌ MongoDB shard ${i + 1} indisponible:`, error.message);
      if (i === 0) throw error;
    }
  }

  if (!shards.some(s => s.ready)) throw new Error('Aucune base MongoDB disponible.');
}

function readyIndexes() {
  return shards.filter(s => s.ready).map(s => s.index);
}

function writeIndexes() {
  const result = [];
  for (let offset = 0; offset < shards.length; offset++) {
    const index = (activeShard + offset) % shards.length;
    if (shards[index].ready && !shards[index].full) result.push(index);
  }
  return result;
}

async function write(name, fn) {
  let lastError;
  for (const index of writeIndexes()) {
    try {
      const result = await fn(rawModel(index, name), index);
      activeShard = index;
      return result;
    } catch (error) {
      lastError = error;
      if (!isFullError(error)) throw error;
      shards[index].full = true;
      console.warn(`⚠️ MongoDB shard ${index + 1} pleine, passage au suivant`);
    }
  }
  throw lastError || new Error('Toutes les bases MongoDB sont pleines ou indisponibles.');
}

function getValue(object, path) {
  const parts = path.split('.');
  let values = [object];
  for (const part of parts) {
    values = values.flatMap(value => {
      if (Array.isArray(value)) return value.flatMap(item => item?.[part] ?? []);
      return value?.[part] == null ? [] : [value[part]];
    });
  }
  return values;
}

function replaceRefs(target, parts, byId) {
  if (target == null) return;
  if (Array.isArray(target)) {
    target.forEach(item => replaceRefs(item, parts, byId));
    return;
  }
  const key = parts[0];
  if (parts.length === 1) {
    if (Array.isArray(target[key])) {
      target[key] = target[key].map(value => byId.get(value?.toString()) || null);
    } else if (target[key] != null) {
      target[key] = byId.get(target[key].toString()) || null;
    }
    return;
  }
  replaceRefs(target[key], parts.slice(1), byId);
}

const refs = {
  User: { 'friends.userId': 'User', 'friendRequests.from': 'User', blockedUsers: 'User', 'acceptedAnnouncements.announcementId': 'Announcement' },
  Message: { sender: 'User', receiver: 'User' },
  Group: { owner: 'User', 'members.userId': 'User', 'keyPackages.userId': 'User', 'keyPackages.senderId': 'User' },
  GroupMessage: { group: 'Group', sender: 'User' },
  Report: { reporter: 'User', reportedUser: 'User', messageId: 'Message', groupMessageId: 'GroupMessage', groupId: 'Group' }
};

function normalizePopulate(path, select) {
  if (Array.isArray(path)) return path.flatMap(item => normalizePopulate(item));
  if (typeof path === 'object') return [path];
  return [{ path, select }];
}

async function populateDocs(docs, sourceName, options) {
  const list = Array.isArray(docs) ? docs : [docs];
  for (const option of normalizePopulate(options)) {
    const targetName = option.model?.modelName || refs[sourceName]?.[option.path];
    if (!targetName) continue;
    const ids = [...new Set(list.flatMap(doc => getValue(doc, option.path).map(v => v?.toString()).filter(Boolean)))];
    if (!ids.length) continue;

    const target = await execute(targetName, 'find', [{ _id: { $in: ids } }], {});
    const byId = new Map(target.map(doc => [doc._id.toString(), doc]));

    for (const doc of list) {
      const values = getValue(doc, option.path);
      replaceRefs(doc, option.path.split('.'), byId);
    }

    if (option.populate && target.length) await populateDocs(target, targetName, option.populate);
  }
  return docs;
}

async function execute(name, operation, args, options) {
  const values = [];
  for (const index of readyIndexes()) {
    const model = rawModel(index, name);
    let query = model[operation](...args);
    if (options.select != null) query = query.select(options.select);
    if (options.lean) query = query.lean();
    const result = await query.exec();
    if (Array.isArray(result)) values.push(...result);
    else if (result) values.push(result);
    if ((operation === 'findOne' || operation === 'findById') && result) break;
  }
  return operation === 'findOne' || operation === 'findById' ? (values[0] || null) : values;
}

class MultiQuery {
  constructor(name, operation, args) {
    this.name = name;
    this.operation = operation;
    this.args = args;
    this.options = {};
    this.populates = [];
  }
  select(value) { this.options.select = value; return this; }
  sort(value) { this.options.sort = value; return this; }
  skip(value) { this.options.skip = value; return this; }
  limit(value) { this.options.limit = value; return this; }
  lean(value = true) { this.options.lean = value; return this; }
  populate(path, select) { this.populates.push(...normalizePopulate(path, select)); return this; }
  async exec() {
    let result = await execute(this.name, this.operation, this.args, this.options);
    if (this.operation === 'find') {
      if (this.options.sort) {
        const keys = Object.entries(this.options.sort);
        result.sort((a, b) => {
          for (const [key, direction] of keys) {
            if (a[key] < b[key]) return -direction;
            if (a[key] > b[key]) return direction;
          }
          return 0;
        });
      }
      const skip = this.options.skip || 0;
      result = result.slice(skip, this.options.limit == null ? undefined : skip + this.options.limit);
    }
    if (this.populates.length && result) await populateDocs(result, this.name, this.populates);
    return result;
  }
  then(resolve, reject) { return this.exec().then(resolve, reject); }
  catch(reject) { return this.exec().catch(reject); }
}

function facade(name) {
  return new Proxy(function MultiModel() {}, {
    construct(target, args) {
      const index = writeIndexes()[0];
      if (index == null) throw new Error('Aucune base MongoDB disponible.');
      return new (rawModel(index, name))(...args);
    },
    get(target, property) {
      if (property === 'modelName') return name;
      if (property === 'schema') return schemas.get(name);
      if (property === 'find') return (...args) => new MultiQuery(name, 'find', args);
      if (property === 'findOne') return (...args) => new MultiQuery(name, 'findOne', args);
      if (property === 'findById') return (...args) => new MultiQuery(name, 'findById', args);
      if (property === 'countDocuments') return async (...args) => {
        let total = 0;
        for (const index of readyIndexes()) total += await rawModel(index, name).countDocuments(...args);
        return total;
      };
      if (property === 'create') return async (...args) => {
        const multipleDocuments = args.length === 1 && Array.isArray(args[0]);
        if (multipleDocuments) {
          return write(name, model => model.create(args[0]));
        }
        return write(name, model => model.create(...args));
      };
      if (property === 'updateMany') return async (...args) => {
        let matchedCount = 0, modifiedCount = 0;
        for (const index of readyIndexes()) {
          const result = await rawModel(index, name).updateMany(...args);
          matchedCount += result.matchedCount ?? result.n ?? 0;
          modifiedCount += result.modifiedCount ?? result.nModified ?? 0;
        }
        return { acknowledged: true, matchedCount, modifiedCount };
      };
      if (property === 'updateOne') return async (...args) => {
        for (const index of readyIndexes()) {
          const result = await rawModel(index, name).updateOne(...args);
          if ((result.matchedCount ?? result.n ?? 0) > 0) return result;
        }
        return { acknowledged: true, matchedCount: 0, modifiedCount: 0 };
      };
      if (property === 'deleteMany') return async (...args) => {
        let deletedCount = 0;
        for (const index of readyIndexes()) deletedCount += (await rawModel(index, name).deleteMany(...args)).deletedCount ?? 0;
        return { acknowledged: true, deletedCount };
      };
      if (property === 'deleteOne') return async (...args) => {
        for (const index of readyIndexes()) {
          const result = await rawModel(index, name).deleteOne(...args);
          if ((result.deletedCount ?? 0) > 0) return result;
        }
        return { acknowledged: true, deletedCount: 0 };
      };
      if (property === 'findByIdAndUpdate') return async (id, update, options) => {
        for (const index of readyIndexes()) {
          const model = rawModel(index, name);
          if (await model.exists({ _id: id })) return model.findByIdAndUpdate(id, update, options).exec();
        }
        return null;
      };
      if (property === 'findOneAndUpdate') return async (filter, update, options) => {
        for (const index of readyIndexes()) {
          const model = rawModel(index, name);
          if (await model.exists(filter)) return model.findOneAndUpdate(filter, update, options).exec();
        }
        return null;
      };
      if (property === 'findByIdAndDelete') return async id => {
        for (const index of readyIndexes()) {
          const model = rawModel(index, name);
          if (await model.exists({ _id: id })) return model.findByIdAndDelete(id).exec();
        }
        return null;
      };
      return target[property];
    }
  });
}

module.exports = { registerModel, connectShards };
