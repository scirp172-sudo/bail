"use strict";
const { createRequire } = require('module');
const require = createRequire(import.meta.url);
const cacheManager = require("cache-manager");

const WAProto_1 = require('../../WAProto/index.js');
const Utils_1 = require('../Utils/index.js');
const logger = require('../Utils/logger.js').default || require('../Utils/logger.js');

module.exports = async function makeCacheManagerAuthState(store, sessionKey) {;
module.exports.default = async function makeCacheManagerAuthState(store, sessionKey) {;
Object.defineProperty(module.exports, '__esModule', { value: true });
    const defaultKey = (file) => `${sessionKey}:${file}`;
    const databaseConn = await cacheManager.caching(store);

    const writeData = async (file, data) => {
        let ttl = undefined;
        if (file === "creds") ttl = 63115200; // 2 years
        await databaseConn.set(
            defaultKey(file),
            JSON.stringify(data, Utils_1.BufferJSON.replacer),
            ttl
        );
    };

    const readData = async (file) => {
        try {
            const data = await databaseConn.get(defaultKey(file));
            if (data) return JSON.parse(data, Utils_1.BufferJSON.reviver);
            return null;
        } catch (error) {
            logger.error(error);
            return null;
        }
    };

    const removeData = async (file) => {
        try {
            return await databaseConn.del(defaultKey(file));
        } catch {
            logger.error(`Error removing ${file} from session ${sessionKey}`);
        }
    };

    const clearState = async () => {
        try {
            const result = await databaseConn.store.keys(`${sessionKey}*`);
            await Promise.all(result.map(async (key) => databaseConn.del(key)));
        } catch {}
    };

    const creds = (await readData("creds")) || Utils_1.initAuthCreds();

    return {
        clearState,
        saveCreds: () => writeData("creds", creds),
        state: {
            creds,
            keys: {
                get: async (type, ids) => {
                    const data = {};
                    await Promise.all(
                        ids.map(async (id) => {
                            let value = await readData(`${type}-${id}`);
                            if (type === "app-state-sync-key" && value) {
                                value =
                                    WAProto_1.proto.Message.AppStateSyncKeyData.fromObject(value);
                            }
                            data[id] = value;
                        })
                    );
                    return data;
                },
                set: async (data) => {
                    const tasks = [];
                    for (const category in data) {
                        for (const id in data[category]) {
                            const value = data[category][id];
                            const key = `${category}-${id}`;
                            tasks.push(value ? writeData(key, value) : removeData(key));
                        }
                    }
                    await Promise.all(tasks);
                }
            }
        }
    };
}