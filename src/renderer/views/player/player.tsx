import React from 'react';
import {
    LeftOutlined,
    MinusOutlined,
    BlockOutlined,
    CloseOutlined,
    HeartOutlined,
    HeartFilled
} from '@ant-design/icons';
import { Control } from 'react-keeper';
import { Alert, Button, message, Tabs } from 'antd';

import XGPlayer, { IPlayerOptions } from 'xgplayer';
import Indexed from '@/utils/db/indexed';
import { TABLES } from '@/utils/constants';
import cssM from './palyer.scss';
import { getPlayConfig, setPlayConfig } from '@/utils/db/storage';
import { getMediaUrl, plainDescription } from '@/utils/filterResources';
import { isCatalogVideo } from '@/utils/catalog';

const HlsPlayer: typeof XGPlayer = require('xgplayer-hls.js');
const bufferTimeout = 10_000;
const progressInterval = 5_000;

interface PlaybackAttempt {
    drama: string;
    src: string;
    position: number;
    hasPlayed: boolean;
    failed: boolean;
    player?: XGPlayer;
    buffer?: AbortController;
    objectUrl?: string;
    lastSavedAt?: number;
    lastSavedPosition?: number;
    saving?: Promise<void>;
}

async function bufferClip(url: string, signal: AbortSignal, report: (percent: number) => void) {
    const limit = 64 * 1024 * 1024;
    const response = await fetch(url, { signal, credentials: 'omit' });
    const length = Number(response.headers.get('Content-Length'));
    if (!response.ok || !response.body || length > limit) throw new Error('无法预缓冲高清影片');

    const reader = response.body.getReader();
    const chunks: Uint8Array<ArrayBuffer>[] = [];
    let received = 0;
    let reported = 0;
    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        received += value.byteLength;
        if (received > limit) throw new Error('高清影片超过预缓冲上限');
        chunks.push(value);
        const percent = length > 0 ? Math.min(99, Math.floor(received / length * 100)) : 0;
        if (percent !== reported) {
            reported = percent;
            report(percent);
        }
    }
    if (!received) throw new Error('高清视频为空');
    return new Blob(chunks, { type: 'video/mp4' });
}

export default class Player extends React.Component<any, any> {
    private sourceList: Map<string, Map<string, string>> = new Map();
    private selectedKey = '播放列表';
    private controlState: IplayResource | undefined;
    private playWrapper = React.createRef<HTMLDivElement>();
    private attempt?: PlaybackAttempt;
    state = { curPlaySrc: '', curPlayDrama: '', isCollect: false, error: false, buffering: -1 };

    constructor(props: any) {
        super(props);
        this.controlState = Control.state;
        if (this.controlState) {
            this.sourceList.set('播放列表', this.controlState.playList);
            this.state = {
                curPlaySrc:
                    this.controlState.historyOption?.lastPlaySrc ||
                    this.controlState.playList.values().next().value || '',
                curPlayDrama:
                    this.controlState.historyOption?.lastPlayDrama ||
                    this.controlState.playList.keys().next().value || '',
                isCollect: Indexed.collectedRes.has(this.controlState.id),
                error: false,
                buffering: -1
            };
        }
    }

    private playNext = () => {
        const dramas = Array.from(this.sourceList.get(this.selectedKey)!.keys());
        const curIdx = dramas.indexOf(this.state.curPlayDrama);
        if (curIdx >= 0 && curIdx < dramas.length - 1) {
            const drama = dramas[curIdx + 1];
            const src = this.sourceList.get(this.selectedKey)!.get(dramas[curIdx + 1])!;
            this.playDrama(drama, src);
        }
    };

    async doCollect() {
        if (!this.controlState) return;
        try {
            await Indexed.instance!.doCollect(this.controlState);
            this.setState({ isCollect: true });
        } catch {
            message.error('收藏保存失败');
        }
    }

    async cancelCollect() {
        if (!this.controlState) return;
        try {
            await Indexed.instance!.cancelCollect(this.controlState.id);
            this.setState({ isCollect: false });
        } catch {
            message.error('取消收藏失败');
        }
    }

    componentDidMount(): void {
        if (!this.controlState) return;
        window.addEventListener('pagehide', this.saveCurrentProgress);
        const { curPlayDrama, curPlaySrc } = this.state;
        const position = this.controlState.historyOption?.lastPlayTime ?? 0;
        void this.startPlayback(curPlayDrama, curPlaySrc, position);
    }

    private playDrama(drama: string, url: string) {
        void this.startPlayback(drama, url, 0);
    }

    private stopPlayback() {
        const attempt = this.attempt;
        if (!attempt) return;
        this.attempt = undefined;
        void this.saveProgress(attempt, true);
        attempt.buffer?.abort();
        attempt.player?.pause();
        attempt.player?.destroy();
        if (attempt.objectUrl) URL.revokeObjectURL(attempt.objectUrl);
    }

    private retryPlayback = () => {
        const attempt = this.attempt;
        if (attempt?.failed) void this.startPlayback(attempt.drama, attempt.src, attempt.position, false);
    };

    private async startPlayback(drama: string, src: string, position: number, prebuffer = true) {
        this.stopPlayback();
        const attempt: PlaybackAttempt = { drama, src, position, hasPlayed: false, failed: false };
        this.attempt = attempt;
        this.setState({ curPlayDrama: drama, curPlaySrc: src, error: false, buffering: -1 });

        const url = getMediaUrl(src);
        const element = this.playWrapper.current;
        const fail = () => {
            if (this.attempt !== attempt || attempt.failed) return;
            attempt.failed = true;
            void this.saveProgress(attempt, true);
            this.setState({ error: true });
        };
        if (!url || !element) {
            fail();
            return;
        }

        let playAddress = url.href;
        if (prebuffer && isCatalogVideo(playAddress)) {
            const controller = new AbortController();
            attempt.buffer = controller;
            const timeout = setTimeout(() => controller.abort(), bufferTimeout);
            this.setState({ buffering: 0 });
            try {
                const clip = await bufferClip(playAddress, controller.signal, percent => {
                    if (this.attempt === attempt && !controller.signal.aborted) {
                        this.setState({ buffering: percent });
                    }
                });
                if (this.attempt === attempt && !controller.signal.aborted) {
                    attempt.objectUrl = URL.createObjectURL(clip);
                    playAddress = attempt.objectUrl;
                }
            } catch {
                // For the current video, let the player stream the original URL.
            } finally {
                clearTimeout(timeout);
                controller.abort();
                attempt.buffer = undefined;
            }
        }
        if (this.attempt !== attempt) return;
        this.setState({ buffering: -1 });
        const PlayerClass = /\.m3u8$/i.test(url.pathname) ? HlsPlayer : XGPlayer;
        const config = getPlayConfig();
        try {
            const options: IPlayerOptions & Record<string, unknown> = {
                el: element,
                url: playAddress,
                id: 'tomatox',
                lang: 'zh-cn',
                width: '100%',
                height: '100%',
                autoplay: false,
                videoInit: true,
                screenShot: false,
                preload: 'auto',
                keyShortcut: 'on',
                keyShortcutStep: { currentTime: 10, volume: 0.1 },
                cssFullscreen: true,
                volume: config.voice,
                defaultPlaybackRate: config.speed,
                playbackRate: [0.5, 1, 1.25, 1.5, 2],
                playPrev: true,
                playNextOne: true,
                videoStop: true,
                showList: true,
                showHistory: true,
                quitMiniMode: true,
                videoTitle: true,
                airplay: true,
                closeVideoTouch: true,
                ignores: ['replay', 'error'],
                preloadTime: 20
            };
            const player = new PlayerClass(options);
            attempt.player = player;
            if (position > 0) {
                player.once('loadedmetadata', () => {
                    if (this.attempt === attempt && position < player.duration - 0.5) {
                        player.currentTime = position;
                    }
                });
            }
            player.on('error', fail);
            if (PlayerClass === HlsPlayer) {
                player.on('HLS_ERROR', ({ errorFatal }) => { if (errorFatal) fail(); });
            }
            player.on('playing', () => {
                if (this.attempt !== attempt) return;
                attempt.hasPlayed = true;
                if (attempt.failed) {
                    attempt.failed = false;
                    this.setState({ error: false });
                }
            });
            player.on('timeupdate', () => {
                if (this.attempt === attempt && !attempt.failed) void this.saveProgress(attempt);
            });
            player.on('pause', () => {
                if (this.attempt === attempt) void this.saveProgress(attempt, true);
            });
            player.on('ended', () => {
                if (this.attempt === attempt) this.playNext();
            });
            player.on('volumechange', () => {
                if (this.attempt === attempt) setPlayConfig({ voice: player.volume });
            });
            player.on('playbackrateChange', () => {
                if (this.attempt === attempt) setPlayConfig({ speed: player.playbackRate });
            });
            player.once('canplay', async () => {
                if (this.attempt !== attempt || !player.paused) return;
                try {
                    await player.play();
                } catch (error) {
                    const name = (error as Error)?.name;
                    if (name !== 'NotAllowedError' && name !== 'AbortError') fail();
                }
            });
        } catch {
            fail();
        }
    }

    private saveProgress(attempt: PlaybackAttempt, force = false) {
        const { player } = attempt;
        const db = Indexed.instance;
        if (!attempt.hasPlayed || !player || !db || !this.controlState) return;
        const time = player.currentTime;
        if (Number.isFinite(time) && (attempt.failed ? time > 0 : time >= 0)) {
            attempt.position = time;
        }
        const now = Date.now();
        if (attempt.lastSavedPosition === attempt.position ||
            (!force && attempt.lastSavedAt !== undefined && now - attempt.lastSavedAt < progressInterval)) {
            return attempt.saving;
        }

        attempt.lastSavedAt = now;
        attempt.lastSavedPosition = attempt.position;
        const saving = db.insertOrUpdateResource(TABLES.TABLE_HISTORY, {
            ...this.controlState,
            historyOption: {
                lastPlayDrama: attempt.drama,
                lastPlaySrc: attempt.src,
                lastPlayTime: attempt.position,
                lastPlayDate: now,
                lastPlayDesc: `观看至 ${attempt.drama} ${Player.timeConverter(attempt.position)}`
            }
        }).catch(error => {
            if (attempt.saving === saving) attempt.lastSavedPosition = undefined;
            console.error(error);
        });
        attempt.saving = saving;
        return saving;
    }

    private saveCurrentProgress = () => {
        if (this.attempt) void this.saveProgress(this.attempt, true);
    };

    private closeWindow = async () => {
        if (this.attempt) await this.saveProgress(this.attempt, true);
        window.tomatox.close();
    };

    private static timeConverter(time: number) {
        const hours = Math.floor(time / 3600);
        const minutes = Math.floor((time % 3600) / 60);
        const senconds = Math.floor(time % 60);
        const ms = `${minutes < 10 ? '0' : ''}${minutes}:${senconds < 10 ? '0' : ''}${senconds}`;
        return hours === 0 ? ms : `${hours < 10 ? '0' : ''}${hours}:${ms}`;
    }

    componentWillUnmount(): void {
        window.removeEventListener('pagehide', this.saveCurrentProgress);
        this.stopPlayback();
    }

    descSources() {
        return Array.from(this.sourceList, ([key, playList]) => (
            <Tabs.TabPane tab={key} key={key}>
                {this.descSeries(playList)}
            </Tabs.TabPane>
        ));
    }

    descSeries(playList: Map<string, string>) {
        return Array.from(playList, ([key, src]) => (
            <span
                key={key}
                className={`${cssM.seriesTag} ${
                    src === this.state.curPlaySrc ? cssM.seriesTagActive : ''
                }`}
                onClick={() => {
                    if (src && this.state.curPlaySrc !== src) this.playDrama(key, src);
                }}>
                {key}
            </span>
        ));
    }

    render(): React.ReactNode {
        if (!this.controlState) return <Alert type="info" message="请从影片列表选择一个视频" />;
        return (
            <div className={cssM.playPageWrapper}>
                <div className={[cssM.playFullHeader, 'theme-header'].join(' ')}>
                    <span
                        onClick={() => {
                            Control.go(-1);
                        }}>
                        <LeftOutlined /> 返回
                    </span>
                    <span>
                        <span>{this.controlState?.name}</span>
                        {this.state.isCollect ? (
                            <HeartFilled
                                className={cssM.resourceCollect}
                                onClick={this.cancelCollect.bind(this)}
                                />
                        ) : (
                            <HeartOutlined
                                className={cssM.resourceNotCollect}
                                onClick={this.doCollect.bind(this)}
                                />
                        )}
                    </span>
                    <span>
                        <MinusOutlined
                            onClick={() => {
                                window.tomatox.minimize();
                            }}
                            />
                        <BlockOutlined
                            onClick={() => {
                                window.tomatox.toggleMaximized();
                            }}
                            />
                        <CloseOutlined onClick={this.closeWindow} />
                    </span>
                </div>
                <div className={cssM.playFullWrapper}>
                    <div ref={this.playWrapper} className={cssM.playerWrapper} />
                    {this.state.buffering >= 0 && (
                        <Alert className={cssM.playbackStatus} type="info" showIcon
                            message={`正在缓冲 4K 视频 · ${this.state.buffering}%`} />
                    )}
                    {this.state.error && (
                        <Alert className={cssM.playbackStatus} type="error" showIcon message="视频暂时无法播放"
                            action={<Button onClick={this.retryPlayback}>重试</Button>} />
                    )}

                    <div className={[cssM.videoInfoWrapper, 'theme-content'].join(' ')}>
                        <Tabs
                            defaultActiveKey={'播放列表'}
                            className={cssM.sourceTab}
                            onChange={newKey => {
                                this.selectedKey = newKey.includes('播放列表')
                                    ? newKey
                                    : this.selectedKey;
                            }}>
                            {this.descSources()}
                            <Tabs.TabPane tab={'详情'} key={'详情'}>
                                <div
                                    className={[cssM.detailHeaderWrapper, 'theme-color'].join(' ')}>
                                    <img
                                        className={cssM.detailImage}
                                        src={this.controlState?.picture}
                                        />
                                    <div className={cssM.detailTextWrapper}>
                                        <div className={cssM.detailTitle}>
                                            {this.controlState?.name}
                                        </div>
                                        <div>
                                            {this.controlState?.type && (
                                                <div className={cssM.detailContent}>
                                                    类型：{this.controlState?.type}
                                                </div>
                                            )}
                                            {this.controlState?.lang && (
                                                <div className={cssM.detailContent}>
                                                    语言：{this.controlState?.lang}
                                                </div>
                                            )}
                                            {this.controlState?.area && (
                                                <div className={cssM.detailContent}>
                                                    地区：{this.controlState?.area}
                                                </div>
                                            )}
                                            {this.controlState?.director && (
                                                <div className={cssM.detailContent}>
                                                    导演：{this.controlState?.director}
                                                </div>
                                            )}
                                            {this.controlState?.actor && (
                                                <div className={cssM.detailContent}>
                                                    主演：{this.controlState?.actor}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                                <div className={[cssM.detailNoteWrapper, 'theme-color'].join(' ')}>
                                    <div className={cssM.detailNoteFirst}>
                                        {this.controlState?.remark}
                                    </div>
                                    <div className={cssM.detailNoteSecond}>
                                        更新时间：{this.controlState?.updateTime}
                                    </div>
                                    <div className={cssM.detailDescTitle}>简介</div>
                                    <div className={cssM.detailDesc}>
                                        {plainDescription(this.controlState?.describe)}
                                    </div>
                                </div>
                            </Tabs.TabPane>
                        </Tabs>
                    </div>
                </div>
            </div>
        );
    }
}
