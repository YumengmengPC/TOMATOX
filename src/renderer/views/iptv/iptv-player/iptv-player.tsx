import React from 'react';
import cssM from './iptv-player.scss';
import { Control } from 'react-keeper';
import { Alert } from 'antd';
import {
    LeftOutlined,
    MinusOutlined,
    BlockOutlined,
    CloseOutlined,
    HeartOutlined,
    HeartFilled
} from '@ant-design/icons';
import { getPlayConfig, setPlayConfig } from '@/utils/db/storage';
import XGPlayer from 'xgplayer';

const HlsPlayer = require('xgplayer-hls.js');
const FlvPlayer = require('xgplayer-flv.js');

export default class IptvPlayer extends React.Component<any, any> {
    private xgPlayer: XGPlayer | undefined;

    constructor(props: any) {
        super(props);
        this.state = {
            resource: Control.state,
            error: false
        };
    }

    private updateVolumeConf = () => {
        setPlayConfig({ voice: this.xgPlayer!.volume });
    };

    private updateSpeedConf = () => {
        setPlayConfig({ speed: this.xgPlayer!.playbackRate });
    };

    componentDidMount(): void {
        if (!this.state.resource?.src) return;
        const PlayerClass = (/\.m3u8$/i.test(new URL(this.state.resource.src).pathname)
            ? HlsPlayer
            : FlvPlayer) as any;
        this.xgPlayer = new PlayerClass({
            el: this.refs.iptvPlayer as any,
            url: this.state.resource.src,
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
            volume: getPlayConfig().voice,
            defaultPlaybackRate: getPlayConfig().speed,
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
        this.xgPlayer?.on('error', () => this.setState({ error: true }));
        this.xgPlayer?.play();
        this.xgPlayer?.on('volumechange', this.updateVolumeConf);
        this.xgPlayer?.on('playbackrateChange', this.updateSpeedConf);
    }

    componentWillUnmount(): void {
        this.xgPlayer?.off('volumechange', this.updateVolumeConf);
        this.xgPlayer?.off('playbackrateChange', this.updateSpeedConf);
        this.xgPlayer?.destroy();
    }

    render(): React.ReactNode {
        if (!this.state.resource) return <Alert type="info" message="请先输入直播地址" />;
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
                        <span>{this.state.resource.sourceName}</span>
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
                <div ref={'iptvPlayer'} />
                {this.state.error && <Alert className={cssM.playbackStatus} type="error"
                    message="直播暂时无法播放，请检查播放地址" />}
            </div>
        );
    }
}
