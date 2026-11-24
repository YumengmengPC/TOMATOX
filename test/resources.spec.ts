import { catalog } from '@/utils/catalog';
import { DEFAULT_ORIGIN } from '@/utils/constants';
import { filterResources, plainDescription } from '@/utils/filterResources';
import { queryResources, ResourcePage } from '@/utils/request/modules/queryResources';
import ResourcePager from '@/utils/request/resourcePager';

jest.mock('@/utils/store', () => ({ getState: () => undefined }));

test('default search is available immediately and supports case-insensitive queries', async () => {
    const title = catalog[0];
    const result = await queryResources(1, undefined, title.director.toUpperCase(), undefined, DEFAULT_ORIGIN);
    expect(result.list).toEqual(expect.arrayContaining([title]));
    expect(result.pagecount).toBe(1);
    expect((await queryResources(2, undefined, title.name, undefined, DEFAULT_ORIGIN)).list).toEqual([]);
});

test('only supported media URLs become playable entries', () => {
    const list = filterResources([{
        id: 4,
        name: '影片',
        dl: { dd: [{ flag: 'other', text: '预告$file:///preview.mp4' }, { flag: 'm3u8', text: '第一集$https://example.invalid/vod.m3u8?key=abc' }] }
    }]);
    expect(Array.from(list[0].playList)).toEqual([['第一集', 'https://example.invalid/vod.m3u8?key=abc']]);
    expect(plainDescription('<p>简介</p>')).toBe('简介');
});

test('a custom XML source uses the active API and preserves a single returned video', async () => {
    const readVideoSource = jest.fn().mockResolvedValue(
        '<rss><list pagecount="2"><video><id>17</id><name>Demo</name><dl>' +
        '<dd flag="hls">第一集$https://example.invalid/vod.m3u8</dd></dl></video></list></rss>'
    );
    Object.assign(globalThis, { window: { tomatox: { readVideoSource } } });
    const origin = { id: '自定义源', api: 'https://example.invalid/api?at=xml', addTime: 1 };
    const page = await queryResources(1, undefined, 'Demo', undefined, origin);
    expect(readVideoSource).toHaveBeenCalledWith(
        'https://example.invalid/api?at=xml&ac=videolist&pg=1&wd=Demo'
    );
    expect(page.pagecount).toBe(2);
    expect(page.list[0].id).toBe(17);
    expect(page.list[0].playList.get('第一集')).toBe('https://example.invalid/vod.m3u8');
});

test('switching sources ignores the previous response and retries a failed page', async () => {
    const pager = new ResourcePager();
    let finishPrevious!: (result: ResourcePage) => void;
    const previous = pager.next(() => new Promise(resolve => { finishPrevious = resolve; }));
    pager.reset();

    const primaryPage = jest.fn().mockRejectedValueOnce(new Error('connection interrupted'))
        .mockResolvedValueOnce({ list: [catalog[0]], pagecount: 1 });
    await expect(pager.next(primaryPage)).rejects.toThrow('connection interrupted');
    await expect(pager.next(primaryPage)).resolves.toEqual({ list: [catalog[0]], hasMore: false });
    expect(primaryPage.mock.calls).toEqual([[1], [1]]);

    finishPrevious({ list: [catalog[1]], pagecount: 5 });
    await expect(previous).resolves.toBeUndefined();
    await expect(pager.next(primaryPage)).resolves.toBeUndefined();
});
