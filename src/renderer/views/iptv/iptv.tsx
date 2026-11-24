import React from 'react';
import { Alert, Input } from 'antd';
import { Control } from 'react-keeper';
import { getMediaUrl } from '@/utils/filterResources';
import cssM from './iptv.scss';

export default class Iptv extends React.Component {
    state = { error: '' };

    private play = (address: string) => {
        const url = getMediaUrl(address.trim());
        if (!url || !/\.(m3u8|flv)$/i.test(url.pathname)) {
            this.setState({ error: '请输入有效的 HTTP 或 HTTPS 直播地址（.m3u8 或 .flv）' });
            return;
        }
        this.setState({ error: '' });
        Control.go('/iptvPlayer', { sourceName: url.hostname, src: url.href });
    };

    render() {
        return (
            <div className={cssM.searchWrapper}>
                <Input.Search placeholder="直播播放地址" enterButton="播放" onSearch={this.play} />
                {this.state.error && <Alert type="error" showIcon message={this.state.error} />}
            </div>
        );
    }
}
