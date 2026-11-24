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
import { Alert, Button, message, Tag, Tabs } from 'antd';

import XGPlayer from 'xgplayer';
import Indexed from '@/utils/db/indexed';
import { TABLES } from '@/utils/constants';
import cssM from './palyer.scss';
import { getPlayConfig, setPlayConfig } from '@/utils/db/storage';
import { getMediaUrl, plainDescription } from '@/utils/filterResources';
import { isCatalogVideo } from '@/utils/catalog';

const HlsPlayer = require('xgplayer-hls.js');

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
        if (received > limit) {
            await reader.cancel();
            throw new Error('高清影片超过预缓冲上限');
        }
        chunks.push(value);
        const percent = length > 0 ? Math.min(99, Math.floor(received / length * 100)) : 0;
        if (percent !== reported) {
            reported = percent;
            report(percent);
        }
    }
    return new Blob(chunks, { type: 'video/mp4' });
}

export default class Player extends React.Component<any, any> {
    private xgPlayer: XGPlayer | undefined;
    private sourceList: Map<string, Map<string, string>> = new Map();
    private selectedKey = '播放列表';
    private controlState: IplayResource | undefined;
    private playWrapper = React.createRef<HTMLDivElement>();
    private bufferRequest?: AbortController;
    private objectUrl?: string;
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
        void this.startPlayback(this.state.curPlaySrc, this.controlState?.historyOption?.lastPlayTime || 0);
    }

    private playDrama(drama: string, url: string) {
        this.setState({ curPlayDrama: drama, curPlaySrc: url });
        void this.startPlayback(url, 0);
    }

    private stopPlayback() {
        this.bufferRequest?.abort();
        this.bufferRequest = undefined;
        this.xgPlayer?.pause();
        this.xgPlayer?.destroy();
        this.xgPlayer = undefined;
        if (this.objectUrl) URL.revokeObjectURL(this.objectUrl);
        this.objectUrl = undefined;
    }

    private async startPlayback(src: string, startAt: number) {
        this.stopPlayback();
        const url = getMediaUrl(src);
        if (!url) {
            this.setState({ error: true });
            return;
        }
        let playAddress = url.href;
        if (isCatalogVideo(playAddress)) {
            const controller = new AbortController();
            this.bufferRequest = controller;
            this.setState({ buffering: 0, error: false });
            try {
                const clip = await bufferClip(playAddress, controller.signal, percent => {
                    if (!controller.signal.aborted) this.setState({ buffering: percent });
                });
                if (controller.signal.aborted) return;
                this.objectUrl = URL.createObjectURL(clip);
                playAddress = this.objectUrl;
            } catch {
                if (controller.signal.aborted) return;
            }
        }
        if (!this.playWrapper.current) return;
        this.setState({ error: false, buffering: -1 });
        const PlayerClass = /\.m3u8$/i.test(url.pathname) ? HlsPlayer : XGPlayer;
        const config = getPlayConfig();
        this.xgPlayer = new PlayerClass({
            el: this.playWrapper.current,
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
            ignores: ['replay'],
            preloadTime: 20
        });
        if (startAt > 0) {
            this.xgPlayer?.once('loadedmetadata', () => {
                if (this.xgPlayer && startAt < this.xgPlayer.duration - 0.5) {
                    this.xgPlayer.currentTime = startAt;
                }
            });
        }
        this.xgPlayer?.on('error', () => this.setState({ error: true }));
        this.xgPlayer?.play();
        this.xgPlayer?.on('ended', this.playNext);
        this.xgPlayer?.on('volumechange', this.updateVolumeConf);
        this.xgPlayer?.on('playbackrateChange', this.updateSpeedConf);
    }

    private updateVolumeConf = () => {
        setPlayConfig({ voice: this.xgPlayer!.volume });
    };

    private updateSpeedConf = () => {
        setPlayConfig({ speed: this.xgPlayer!.playbackRate });
    };

    private static timeConverter(time: number) {
        const hours = Math.floor(time / 3600);
        const minutes = Math.floor((time % 3600) / 60);
        const senconds = Math.floor(time % 60);
        const ms = `${minutes < 10 ? '0' : ''}${minutes}:${senconds < 10 ? '0' : ''}${senconds}`;
        return hours === 0 ? ms : `${hours < 10 ? '0' : ''}${hours}:${ms}`;
    }

    componentWillUnmount(): void {
        if (!this.controlState || !this.xgPlayer) {
            this.stopPlayback();
            return;
        }
        const newData: IplayResource = {
            ...this.controlState,
            historyOption: {
                lastPlayDrama: this.state.curPlayDrama,
                lastPlaySrc: this.state.curPlaySrc,
                lastPlayTime: this.xgPlayer?.currentTime || 0,
                lastPlayDate: Date.now(),
                lastPlayDesc: `观看至 ${this.state.curPlayDrama || ''} ${Player.timeConverter(
                    this.xgPlayer?.currentTime || 0
                )}`
            }
        };
        void Indexed.instance!.insertOrUpdateResource(TABLES.TABLE_HISTORY, newData).catch(console.error);

        this.stopPlayback();
    }

    descSources() {
        const eles = [];
        // @ts-ignore
        for (const [key] of this.sourceList) {
            eles.push(
                <Tabs.TabPane tab={key} key={key}>
                    {this.descSeries(this.sourceList.get(key)!)}
                </Tabs.TabPane>
            );
        }
        return eles;
    }

    descSeries(playList: Map<string, string>) {
        const eles = [];
        // @ts-ignore
        for (const [key] of playList) {
            eles.push(
                <span
                    key={key}
                    className={`${cssM.seriesTag} ${
                        playList.get(key) === this.state.curPlaySrc ? cssM.seriesTagActive : ''
                    }`}
                    onClick={() => {
                        const src = playList.get(key);
                        if (src && this.state.curPlaySrc !== src) this.playDrama(key, src);
                    }}>
                    {key}
                </span>
            );
        }
        return eles;
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
                        <CloseOutlined
                            onClick={() => {
                                window.tomatox.close();
                            }}
                            />
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
                            action={<Button onClick={() => this.startPlayback(this.state.curPlaySrc, 0)}>重试</Button>} />
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
