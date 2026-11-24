import { indexedDB, IDBKeyRange } from 'fake-indexeddb';
import { catalog } from '@/utils/catalog';
import { DEFAULT_ORIGIN, TABLES } from '@/utils/constants';
import Indexed from '@/utils/db/indexed';

test('upgrading an existing database preserves its sources and removes expired history', async () => {
    Object.assign(globalThis, { window: { indexedDB }, IDBKeyRange });
    const customOrigin = { id: '自定义源', api: 'https://example.invalid/api', addTime: 42 };
    const recent = { ...catalog[0], id: 'recent', historyOption: { lastPlayDate: Date.now() } };
    const expired = {
        ...catalog[0], id: 'expired', historyOption: { lastPlayDate: Date.now() - 100 * 24 * 3600000 }
    };

    await new Promise<void>((resolve, reject) => {
        const request = indexedDB.open('TOMATOX', 4);
        request.onupgradeneeded = () => {
            const db = request.result;
            const history = db.createObjectStore(TABLES.TABLE_HISTORY, { keyPath: 'id' });
            history.createIndex('lastPlayDate', 'lastPlayDate');
            history.put(recent);
            history.put(expired);
            const collections = db.createObjectStore(TABLES.TABLE_COLLECT, { keyPath: 'id' });
            collections.put(recent);
            const origins = db.createObjectStore(TABLES.TABLE_ORIGIN, { keyPath: 'id' });
            origins.put({ id: '百度云资源', api: 'https://api.apibdzy.com/api.php/provide/vod/at/' });
            origins.put(customOrigin);
        };
        request.onsuccess = () => {
            request.result.close();
            resolve();
        };
        request.onerror = () => reject(request.error);
    });

    const db = await Indexed.init();
    expect(await db.queryById(TABLES.TABLE_ORIGIN, customOrigin.id)).toEqual(customOrigin);
    expect(await db.queryById(TABLES.TABLE_ORIGIN, DEFAULT_ORIGIN.id)).toEqual(DEFAULT_ORIGIN);
    expect(await db.queryById(TABLES.TABLE_ORIGIN, '百度云资源')).toBeUndefined();
    const history = await db.queryAll(TABLES.TABLE_HISTORY) as IplayResource[];
    expect(history.map(item => item.id)).toEqual([recent.id]);
    expect(history[0].historyOption).toEqual(recent.historyOption);
    expect(Indexed.collectedRes.has(recent.id)).toBe(true);
});
