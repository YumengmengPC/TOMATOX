import store from '@/utils/store';
import xmlParser from '@/utils/xmlParser';
import { filterResources } from '@/utils/filterResources';
import { DEFAULT_ORIGIN } from '@/utils/constants';
import { catalog, catalogTypes } from '@/utils/catalog';

export interface ResourcePage {
    list: IplayResource[];
    pagecount: number;
}

export interface ResourceType {
    id: number;
    text: string;
}

async function readSource(origin: Iorigin, params: Record<string, number | string | undefined>) {
    const url = new URL(origin.api);
    for (const [key, value] of Object.entries(params)) {
        if (value !== undefined) url.searchParams.set(key, String(value));
    }
    const response = xmlParser(await window.tomatox.readVideoSource(url.href));
    const data = response?.rss ?? response;
    if (!data || typeof data !== 'object') throw new Error('无法读取视频源的 XML 响应');
    return data;
}

function asList<T>(items: T | T[] | null | undefined): T[] {
    if (items == null || items === '') return [];
    return Array.isArray(items) ? items : [items];
}

export async function queryResources(
    page: number,
    type?: number,
    keyword?: string,
    lastUpdate?: number,
    origin: Iorigin = store.getState('SITE_ADDRESS')
): Promise<ResourcePage> {
    if (origin.id === DEFAULT_ORIGIN.id) {
        const term = keyword?.trim().toLowerCase() ?? '';
        const matching = catalog.filter(item =>
            (type === undefined || catalogTypes.some(entry => entry.id === type && entry.text === item.type)) &&
            [item.name, item.describe, item.remark, item.director].some(text => text.toLowerCase().includes(term))
        );
        return { list: page === 1 ? matching : [], pagecount: matching.length > 0 ? 1 : 0 };
    }

    const result = await readSource(origin, { ac: 'videolist', pg: page, t: type, wd: keyword, h: lastUpdate });
    if (!result.list && result.list !== '') throw new Error('视频源响应缺少影片列表');

    const list = filterResources(asList(result.list?.video));
    const pagecount = Number(result.list?.pagecount);
    return { list, pagecount: Number.isInteger(pagecount) && pagecount >= 0 ? pagecount : page };
}

export async function queryTypes(origin: Iorigin = store.getState('SITE_ADDRESS')): Promise<ResourceType[]> {
    if (origin.id === DEFAULT_ORIGIN.id) return catalogTypes;
    const result = await readSource(origin, {});
    return asList<{ id: string | number; text: unknown }>(result.class?.ty)
        .map(item => ({ id: Number(item?.id), text: String(item?.text ?? '').trim() }))
        .filter(item => item.text && Number.isInteger(item.id));
}
