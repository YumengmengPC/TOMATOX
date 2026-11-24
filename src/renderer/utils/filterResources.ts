import { TABLES } from '@/utils/constants';

export function getMediaUrl(value: string) {
    try {
        const url = new URL(value);
        if (['http:', 'https:'].includes(url.protocol) && !url.username && !url.password) return url;
    } catch {
        return;
    }
}

export function plainDescription(value: unknown): string {
    return typeof value === 'string' ? value.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim() : '';
}

export function filterResources(resources: any[]) {
    return resources
        .filter(item => item?.id != null && item?.name)
        .map(filterResource)
        .filter(item => item.playList.size > 0);
}

export function filterResource(resource: any): IplayResource {
    const source = resource.dl?.dd;
    const sources = Array.isArray(source) ? source : [source];

    return {
        id: resource.id,
        type: resource.type,
        picture: resource.pic,
        lang: resource.lang,
        name: resource.name,
        director: resource.director,
        describe: plainDescription(resource.des),
        area: resource.area,
        actor: resource.actor,
        class: '',
        doubanId: '',
        doubanScore: '',
        origin: '',
        remark: resource.note,
        tag: '',
        year: resource.year,
        updateTime: resource.last,
        playList: sources
            .map(item => filterPlayList(item?.text ?? item))
            .find(list => list.size > 0) ?? new Map()
    };
}

function filterPlayList(value: unknown) {
    const list = new Map<string, string>();
    if (typeof value !== 'string') return list;

    for (const source of value.split('$$$')) {
        for (const item of source.split('#')) {
            const separator = item.indexOf('$');
            const label = separator >= 0 ? item.slice(0, separator).trim() : '播放';
            const url = getMediaUrl(item.slice(separator + 1).trim());
            if (label && url && /\.(m3u8|mp4|webm)$/i.test(url.pathname)) list.set(label, url.href);
        }
        if (list.size) break;
    }
    return list;
}

export function cleanResourceData(dataType: string, data: IplayResource): IplayResource {
    const optData: IplayResource = {
        id: data.id,
        type: data.type,
        picture: data.picture,
        lang: data.lang,
        name: data.name,
        director: data.director,
        describe: data.describe,
        area: data.area,
        actor: data.actor,
        class: data.class,
        doubanId: data.doubanId,
        doubanScore: data.doubanScore,
        origin: data.origin,
        remark: data.remark,
        tag: data.tag,
        year: data.year,
        updateTime: data.updateTime,
        playList: data.playList
    };
    if (dataType === TABLES.TABLE_HISTORY) {
        optData.historyOption = data.historyOption;
    } else if (dataType === TABLES.TABLE_COLLECT) {
        optData.collectOption = data.collectOption;
    }
    return optData;
}
