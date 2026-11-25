import React from 'react';
import cssM from './iptv-player.scss';
import { Control } from 'react-keeper';
import { Alert, Button } from 'antd';
import {
    LeftOutlined,
    MinusOutlined,
    BlockOutlined,
    CloseOutlined
} from '@ant-design/icons';
import { getPlayConfig, setPlayConfig } from '@/utils/db/storage';
import { getMediaUrl } from '@/utils/filterResources';
import type XGPlayer from 'xgplayer';
import type { IPlayerOptions } from 'xgplayer';

const HlsPlayer: typeof XGPlayer = require('xgplayer-hls.js');
const FlvPlayer: typeof XGPlayer = require('xgplayer-flv.js');

interface LiveResource {
    sourceName: string;
    src: string;
}

export default class IptvPlayer extends React.Component {
    private readonly resource = Control.state as LiveResource | undefined;
    private readonly playerWrapper = React.createRef<HTMLDivElement>();
    private player?: XGPlayer;
    private failed = false;
    state = { error: false };

    componentDidMount(): void {
        if (this.resource) this.startPlayback();
    }

    private retryPlayback = () => {
        if (this.failed) this.startPlayback();
    };

    private startPlayback() {
        this.failed = false;
        this.stopPlayback();
        this.setState({ error: false });

        const url = getMediaUrl(this.resource?.src ?? '');
        const element = this.playerWrapper.current;
        let player: XGPlayer | undefined;
        const fail = () => {
            if (this.player !== player || this.failed) return;
            this.failed = true;
            this.setState({ error: true });
        };
        if (!url || !element || !/\.(m3u8|flv)$/i.test(url.pathname)) {
            fail();
            return;
        }

        const PlayerClass = /\.m3u8$/i.test(url.pathname) ? HlsPlayer : FlvPlayer;
        const config = getPlayConfig();
        try {
            const options: IPlayerOptions & Record<string, unknown> = {
                el: element,
                url: url.href,
                id: 'tomatox-iptv',
                lang: 'zh-cn',
                width: '100%',
                height: '100%',
                autoplay: false,
                videoInit: true,
                screenShot: true,
                keyShortcut: 'on',
                keyShortcutStep: { currentTime: 10, volume: 0.1 },
                crossOrigin: true,
                cssFullscreen: true,
                volume: config.voice,
                defaultPlaybackRate: config.speed,
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
            const nextPlayer = new PlayerClass(options);
            player = nextPlayer;
            this.player = nextPlayer;
            nextPlayer.on('error', fail);
            if (PlayerClass === HlsPlayer) {
                nextPlayer.on('HLS_ERROR', ({ errorFatal }) => { if (errorFatal) fail(); });
            }
            nextPlayer.on('playing', () => {
                if (this.player !== nextPlayer || !this.failed) return;
                this.failed = false;
                this.setState({ error: false });
            });
            nextPlayer.on('volumechange', () => {
                if (this.player === nextPlayer) setPlayConfig({ voice: nextPlayer.volume });
            });
            nextPlayer.on('playbackrateChange', () => {
                if (this.player === nextPlayer) setPlayConfig({ speed: nextPlayer.playbackRate });
            });
            nextPlayer.once('canplay', async () => {
                if (this.player !== nextPlayer || !nextPlayer.paused) return;
                try {
                    await nextPlayer.play();
                } catch (error) {
                    const name = (error as Error)?.name;
                    if (name !== 'NotAllowedError' && name !== 'AbortError') fail();
                }
            });
        } catch {
            fail();
        }
    }

    private stopPlayback() {
        const player = this.player;
        this.player = undefined;
        player?.pause();
        player?.destroy();
    }

    componentWillUnmount(): void {
        this.stopPlayback();
    }

    render(): React.ReactNode {
        if (!this.resource) return <Alert type="info" message="请先输入直播地址" />;
        return (
            <div className={[cssM.fullScreen, 'theme-content'].join(' ')}>
                <div className={[cssM.playFullHeader, 'theme-header'].join(' ')}>
                    <span
                        onClick={() => {
                            Control.go(-1);
                        }}>
                        <LeftOutlined /> 返回
                    </span>
                    <span>
                        <span>{this.resource.sourceName}</span>
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
                <div ref={this.playerWrapper} />
                {this.state.error && <Alert className={cssM.playbackStatus} type="error" showIcon
                    message="直播暂时无法播放，请检查播放地址"
                    action={<Button onClick={this.retryPlayback}>重试</Button>} />}
            </div>
        );
    }
}
