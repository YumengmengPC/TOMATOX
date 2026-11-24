import { DEFAULT_ORIGIN, TABLES } from '@/utils/constants';
import { cleanResourceData } from '@/utils/filterResources';

export default class Indexed {
    private static db: IDBDatabase | undefined;
    private static opening: Promise<Indexed> | undefined;
    public static instance: Indexed | undefined;
    static collectedRes = new Set<IplayResource['id']>();

    private constructor() {
        // do nothing
    }

    public static init(): Promise<Indexed> {
        if (this.instance) return Promise.resolve(this.instance);
        if (this.opening) return this.opening;

        this.opening = new Promise<Indexed>((resolve, reject) => {
            const request = window.indexedDB.open('TOMATOX', 6);
            request.onupgradeneeded = () => {
                const db = request.result;
                const transaction = request.transaction!;
                const history = db.objectStoreNames.contains(TABLES.TABLE_HISTORY)
                    ? transaction.objectStore(TABLES.TABLE_HISTORY)
                    : db.createObjectStore(TABLES.TABLE_HISTORY, { keyPath: 'id' });
                const indexName = 'lastPlayDate';
                const datePath = 'historyOption.lastPlayDate';
                if (history.indexNames.contains(indexName) && history.index(indexName).keyPath !== datePath) {
                    history.deleteIndex(indexName);
                }
                if (!history.indexNames.contains(indexName)) {
                    history.createIndex(indexName, datePath);
                }
                if (!db.objectStoreNames.contains(TABLES.TABLE_COLLECT)) {
                    db.createObjectStore(TABLES.TABLE_COLLECT, { keyPath: 'id' });
                }
                const origins = db.objectStoreNames.contains(TABLES.TABLE_ORIGIN)
                    ? transaction.objectStore(TABLES.TABLE_ORIGIN)
                    : db.createObjectStore(TABLES.TABLE_ORIGIN, { keyPath: 'id' });
                origins.put(DEFAULT_ORIGIN);
                const candidate = origins.get('百度云资源');
                candidate.onsuccess = () => {
                    if ([
                        'https://api.apibdzy.com/api.php/provide/vod/at/',
                        'https://m3u8.apibdzy.com/api.php/provide/vod/at/xml'
                    ].includes(candidate.result?.api)) {
                        origins.delete('百度云资源');
                    }
                };
            };
            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                const db = request.result;
                this.db = db;
                db.onversionchange = () => db.close();
                const instance = new Indexed();
                instance.removeThreeMonthAgoHistoryData().catch(console.error);
                instance.loadCollectedRes().then(() => {
                    this.instance = instance;
                    resolve(instance);
                }, reject);
            };
        }).finally(() => { this.opening = undefined; });
        return this.opening;
    }

    public queryById(tableName: string, id: any) {
        return new Promise((resolve, reject) => {
            const req = Indexed.db!.transaction(tableName, 'readonly')
                .objectStore(tableName)
                .get(id);
            req.onerror = () => reject(req.error);
            req.onsuccess = () => {
                resolve(req.result);
            };
        });
    }

    public queryAll(tableName: string) {
        return new Promise((resolve, reject) => {
            const req = Indexed.db!.transaction(tableName, 'readonly')
                .objectStore(tableName)
                .getAll();
            req.onerror = () => reject(req.error);
            req.onsuccess = () => {
                resolve(req.result);
            };
        });
    }

    public queryAllKeys(tableName: string) {
        return new Promise((resolve, reject) => {
            const req = Indexed.db!.transaction(tableName, 'readonly')
                .objectStore(tableName)
                .getAllKeys();
            req.onerror = () => reject(req.error);
            req.onsuccess = () => {
                resolve(req.result);
            };
        });
    }

    public insertOrUpdateOrigin(tableName: string, data: Iorigin) {
        return this.write(tableName, table => table.put(data));
    }

    public async insertOrUpdateResource(tableName: string, data: IplayResource) {
        await this.write(tableName, table => table.put(cleanResourceData(tableName, data)));
        if (tableName === TABLES.TABLE_COLLECT) Indexed.collectedRes.add(data.id);
    }

    public async deleteById(tableName: string, id: IplayResource['id']) {
        await this.write(tableName, table => table.delete(id));
        if (tableName === TABLES.TABLE_COLLECT) Indexed.collectedRes.delete(id);
    }

    public async deleteAll(tableName: string) {
        await this.write(tableName, table => table.clear());
        if (tableName === TABLES.TABLE_COLLECT) Indexed.collectedRes.clear();
    }

    private write(tableName: string, action: (table: IDBObjectStore) => void) {
        return new Promise<void>((resolve, reject) => {
            const tx = Indexed.db!.transaction(tableName, 'readwrite');
            tx.oncomplete = () => resolve();
            tx.onabort = () => reject(tx.error);
            action(tx.objectStore(tableName));
        });
    }

    public doCollect(data: IplayResource) {
        return this.insertOrUpdateResource(TABLES.TABLE_COLLECT, {
            ...data,
            collectOption: { collectDate: Date.now() }
        });
    }

    public cancelCollect(id: IplayResource['id']) {
        return this.deleteById(TABLES.TABLE_COLLECT, id);
    }

    private removeThreeMonthAgoHistoryData() {
        return this.write(TABLES.TABLE_HISTORY, table => {
            const bound = IDBKeyRange.upperBound(Date.now() - 90 * 24 * 3600000, true);
            const request = table.index('lastPlayDate').openCursor(bound);
            request.onsuccess = () => {
                const cursor = request.result;
                if (!cursor) return;
                cursor.delete();
                cursor.continue();
            };
        });
    }

    private async loadCollectedRes() {
        const ids = await this.queryAllKeys(TABLES.TABLE_COLLECT);
        (ids as IplayResource['id'][]).forEach(id => Indexed.collectedRes.add(id));
    }
}
