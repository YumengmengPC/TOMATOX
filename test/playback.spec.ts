import React from 'react';
import { Control } from 'react-keeper';
import { catalog } from '@/utils/catalog';
import Indexed from '@/utils/db/indexed';
import { TABLES } from '@/utils/constants';
import Player from '@/views/player/player';
import IptvPlayer from '@/views/iptv/iptv-player/iptv-player';

jest.mock('react-keeper', () => ({ Control: { state: undefined } }));
jest.mock('@/utils/db/storage', () => ({ getPlayConfig: () => ({}), setPlayConfig: jest.fn() }));
jest.mock('@/views/player/palyer.scss', () => ({}));
jest.mock('@/views/iptv/iptv-player/iptv-player.scss', () => ({}));
jest.mock('xgplayer', () => jest.fn());
jest.mock('xgplayer-hls.js', () => jest.fn());
jest.mock('xgplayer-flv.js', () => jest.fn());

class TestPlayer {
    private events = new Map<string, (data?: { errorFatal: boolean }) => void>();
    currentTime = 0;
    duration = 120;
    paused = true;
    play = jest.fn().mockResolvedValue(undefined);
    pause = jest.fn();
    destroy = jest.fn(() => this.emit('error'));

    constructor(public url: string) {}

    on(event: string, listener: (data?: { errorFatal: boolean }) => void) {
        this.events.set(event, listener);
    }

    once(event: string, listener: () => void) {
        this.on(event, () => {
            this.events.delete(event);
            listener();
        });
    }

    emit(event: string, data?: { errorFatal: boolean }) {
        this.events.get(event)?.(data);
    }
}

const players: TestPlayer[] = [];
const write = jest.fn().mockResolvedValue(undefined);
const vodUrl = 'https://example.invalid/episode.mp4';
const secondUrl = 'https://example.invalid/second.mp4';
const catalogUrl = Array.from(catalog[0].playList.values())[0];

type PlaybackView = Player | IptvPlayer;

function mount<T extends PlaybackView>(view: T, ref: 'playWrapper' | 'playerWrapper') {
    Object.assign(view, {
        [ref]: { current: {} },
        setState: (update: object) => Object.assign(view.state, update)
    });
    view.componentDidMount();
    return view;
}

function action(view: PlaybackView, label: string) {
    function find(node: React.ReactNode): (() => void) | undefined {
        if (Array.isArray(node)) {
            for (const child of node) {
                const found = find(child);
                if (found) return found;
            }
        }
        if (!React.isValidElement<{
            onClick?: () => void;
            children?: React.ReactNode;
            action?: React.ReactNode;
        }>(node)) return;
        const { onClick, children, action: alertAction } = node.props;
        if (children === label && onClick) return onClick;
        return find(alertAction) ?? find(children);
    }

    const click = find(view.render());
    if (!click) throw new Error('Missing control: ' + label);
    return click;
}

function vod(src: string, savedPosition?: number) {
    Object.assign(Control, { state: {
        ...catalog[0],
        playList: new Map([['第一集', src], ['第二集', secondUrl]]),
        historyOption: savedPosition === undefined ? undefined : {
            lastPlayDrama: '第一集', lastPlaySrc: src, lastPlayTime: savedPosition
        }
    } });
    return mount(new Player({}), 'playWrapper');
}

beforeEach(() => {
    jest.useFakeTimers();
    players.length = 0;
    write.mockClear();
    Object.assign(Indexed, { instance: { insertOrUpdateResource: write } });
    Object.assign(globalThis, { window: new EventTarget() });
    for (const moduleName of ['xgplayer', 'xgplayer-hls.js', 'xgplayer-flv.js']) {
        (jest.requireMock(moduleName) as jest.Mock).mockReset().mockImplementation(({ url }) => {
            const player = new TestPlayer(url);
            players.push(player);
            return player;
        });
    }
});

afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
});

test('a stalled 4K buffer is aborted at ten seconds and the original URL starts streaming', async () => {
    let signal: AbortSignal | null | undefined;
    jest.spyOn(globalThis, 'fetch').mockImplementation(async (_url, options) => {
        signal = options?.signal;
        const body = new ReadableStream({
            start(controller) {
                signal?.addEventListener('abort', () => controller.error(signal?.reason), { once: true });
            }
        });
        return new Response(body);
    });
    const view = vod(catalogUrl);

    await jest.advanceTimersByTimeAsync(9_999);
    expect(players).toHaveLength(0);
    expect(view.state.buffering).toBe(0);
    await jest.advanceTimersByTimeAsync(1);

    expect(signal?.aborted).toBe(true);
    expect(players.map(player => player.url)).toEqual([catalogUrl]);
    expect(view.state.buffering).toBe(-1);
    expect(players[0].play).not.toHaveBeenCalled();
    players[0].emit('canplay');
    expect(players[0].play).toHaveBeenCalledTimes(1);
    view.componentWillUnmount();
});

test('switching episodes aborts buffering and ignores a late response', async () => {
    let resolveResponse!: (response: Response) => void;
    const request = jest.spyOn(globalThis, 'fetch').mockImplementation(() =>
        new Promise(resolve => { resolveResponse = resolve; })
    );
    const view = vod(catalogUrl);
    action(view, '第二集')();

    expect(request.mock.calls[0][1]?.signal?.aborted).toBe(true);
    resolveResponse(new Response('old clip'));
    await jest.advanceTimersByTimeAsync(0);
    expect(players.map(player => player.url)).toEqual([secondUrl]);
    expect(view.state.error).toBe(false);
    expect(write).not.toHaveBeenCalled();
    view.componentWillUnmount();
});

test('progress is throttled, paused progress is saved, and retry resumes after the old player resets', () => {
    const view = vod(vodUrl, 23);
    const player = players[0];
    player.emit('loadedmetadata');
    expect(player.currentTime).toBe(23);

    player.emit('playing');
    player.currentTime = 24;
    player.emit('timeupdate');
    player.currentTime = 25;
    player.emit('timeupdate');
    expect(write).toHaveBeenCalledTimes(1);

    jest.advanceTimersByTime(5_000);
    player.currentTime = 30;
    player.emit('timeupdate');
    expect(write).toHaveBeenCalledTimes(2);
    player.currentTime = 31;
    player.emit('pause');
    expect(write).toHaveBeenLastCalledWith(TABLES.TABLE_HISTORY, expect.objectContaining({
        historyOption: expect.objectContaining({ lastPlayDrama: '第一集', lastPlayTime: 31 })
    }));

    player.currentTime = 0;
    player.emit('error');
    action(view, '重试')();
    expect(player.destroy).toHaveBeenCalledTimes(1);
    const retried = players[1];
    retried.emit('loadedmetadata');
    expect(retried.currentTime).toBe(31);
    expect(view.state.error).toBe(false);

    retried.emit('playing');
    retried.currentTime = 34;
    action(view, '第二集')();
    expect(write).toHaveBeenLastCalledWith(TABLES.TABLE_HISTORY, expect.objectContaining({
        historyOption: expect.objectContaining({ lastPlaySrc: vodUrl, lastPlayTime: 34 })
    }));
    retried.emit('error');
    retried.emit('ended');
    retried.emit('pause');
    expect(players.map(player => player.url)).toEqual([vodUrl, vodUrl, secondUrl]);
    expect(view.state.error).toBe(false);

    players[2].emit('playing');
    players[2].currentTime = 4;
    view.componentWillUnmount();
    expect(write).toHaveBeenLastCalledWith(TABLES.TABLE_HISTORY, expect.objectContaining({
        historyOption: expect.objectContaining({ lastPlayDrama: '第二集', lastPlayTime: 4 })
    }));
});

test.each([
    ['m3u8', 'xgplayer-hls.js'],
    ['flv', 'xgplayer-flv.js']
])('retrying a failed %s stream replaces its player once and uses the same URL', (extension, moduleName) => {
    const url = 'https://example.invalid/live.' + extension + '?key=test';
    Object.assign(Control, { state: { sourceName: 'fixture', src: url } });
    const view = mount(new IptvPlayer({}), 'playerWrapper');
    const first = players[0];
    if (extension === 'm3u8') {
        first.emit('HLS_ERROR', { errorFatal: false });
        expect(view.state.error).toBe(false);
        first.emit('HLS_ERROR', { errorFatal: true });
    } else {
        first.emit('error');
    }

    const retry = action(view, '重试');
    retry();
    retry();
    first.emit('error');
    expect(jest.requireMock(moduleName)).toHaveBeenCalledTimes(2);
    expect(players.map(player => player.url)).toEqual([url, url]);
    expect(first.pause).toHaveBeenCalledTimes(1);
    expect(first.destroy).toHaveBeenCalledTimes(1);
    expect(view.state.error).toBe(false);
    first.emit('canplay');
    expect(first.play).not.toHaveBeenCalled();
    expect(players[1].play).not.toHaveBeenCalled();
    players[1].emit('canplay');
    expect(players[1].play).toHaveBeenCalledTimes(1);

    view.componentWillUnmount();
    expect(players[1].destroy).toHaveBeenCalledTimes(1);
});
