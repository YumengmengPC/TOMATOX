import React from 'react';
import { Input, Row, Col, Button, message, Checkbox } from 'antd';
import cssM from './setting.scss';
import { getEnabledOrigin, setEnabledOrigin } from '@/utils/db/storage';
import Indexed from '@/utils/db/indexed';
import { DEFAULT_ORIGIN, TABLES } from '@/utils/constants';
import { getMediaUrl } from '@/utils/filterResources';
import store from '@/utils/store';

export default class Setting extends React.Component<any, any> {
    constructor(props: any) {
        super(props);
        this.state = {
            enableOrigin: getEnabledOrigin(),
            selectableOrigins: [],
            originName: '',
            originAddress: '',
            saving: false
        };
    }

    componentDidMount(): void {
        Indexed.instance!.queryAll(TABLES.TABLE_ORIGIN).then(res => {
            const result = res as Iorigin[];
            result.sort((a, b) => a.addTime - b.addTime);
            this.setState({
                selectableOrigins: result
            });
        }).catch(() => message.error('读取视频源失败'));
    }

    private onChange = (e: Iorigin) => {
        if (e.id === this.state.enableOrigin) {
            return;
        }
        this.setState({
            enableOrigin: e.id
        });
        setEnabledOrigin(e.id);
        store.setState('SITE_ADDRESS', e);
        message.success('切换成功');
    };

    private deleteOrigin = async (id: string) => {
        if (id === this.state.enableOrigin || id === DEFAULT_ORIGIN.id) return;
        try {
            await Indexed.instance!.deleteById(TABLES.TABLE_ORIGIN, id);
            this.setState(({ selectableOrigins }: { selectableOrigins: Iorigin[] }) => ({
                selectableOrigins: selectableOrigins.filter(item => item.id !== id)
            }));
        } catch {
            message.error('删除视频源失败');
        }
    };

    private addOrigin = async () => {
        if (this.state.saving) return;
        const name = this.state.originName.trim();
        const url = getMediaUrl(this.state.originAddress.trim());
        if (name === DEFAULT_ORIGIN.id || this.state.selectableOrigins.some((item: Iorigin) => item.id === name)) {
            message.warn('名称已存在');
            return;
        }
        if (!name || !/^[a-zA-Z0-9\u4e00-\u9fa5]+$/.test(name)) {
            message.warn('名称只能包含中文、字母和数字');
            return;
        }
        if (!url) {
            message.warn('请输入完整的 HTTP 或 HTTPS 地址');
            return;
        }
        const source: Iorigin = { id: name, api: url.href, addTime: Date.now() };
        this.setState({ saving: true });
        try {
            await Indexed.instance!.insertOrUpdateOrigin(TABLES.TABLE_ORIGIN, source);
            this.setState(({ selectableOrigins }: { selectableOrigins: Iorigin[] }) => ({
                selectableOrigins: [...selectableOrigins, source],
                originName: '',
                originAddress: ''
            }));
        } catch {
            message.error('保存视频源失败');
        } finally {
            this.setState({ saving: false });
        }
    };

    render(): React.ReactNode {
        return (
            <div className={cssM.settingWrapper}>
                <span className={cssM.settingTitle}>视频源</span>
                <div className={cssM.settingContent}>
                    {this.state.selectableOrigins.map((item: Iorigin) => (
                        <Checkbox
                            key={item.id}
                            className={[cssM.origins, 'theme-color'].join(' ')}
                            checked={this.state.enableOrigin === item.id}
                            onChange={() => {
                                this.onChange(item);
                            }}>
                            <Row>
                                <Col span={4} className={cssM.originItem}>
                                    名称：{item.id}
                                </Col>
                                <Col span={16} className={cssM.originItem}>
                                    {item.id === DEFAULT_ORIGIN.id ? '内置高清片库' : '地址：' + item.api}
                                </Col>
                                {item.id !== DEFAULT_ORIGIN.id && this.state.enableOrigin !== item.id && (
                                    <Col span={2}>
                                        <span
                                            className={cssM.originBtn}
                                            onClick={event => {
                                                event.preventDefault();
                                                event.stopPropagation();
                                                void this.deleteOrigin(item.id);
                                            }}>
                                            删除
                                        </span>
                                    </Col>
                                )}
                            </Row>
                        </Checkbox>
                    ))}
                </div>
                <span className={cssM.settingTitle}>添加视频源</span>
                <div className={[cssM.settingContent, 'theme-input'].join(' ')}>
                    <Row gutter={30}>
                        <Col span={6}>
                            <Input addonBefore="名称" value={this.state.originName}
                                onChange={event => this.setState({ originName: event.target.value })} />
                        </Col>
                        <Col span={13}>
                            <Input addonBefore="地址" value={this.state.originAddress}
                                onChange={event => this.setState({ originAddress: event.target.value })} />
                        </Col>
                        <Col span={4}>
                            <Button loading={this.state.saving} onClick={this.addOrigin}>添加</Button>
                        </Col>
                    </Row>
                </div>
            </div>
        );
    }
}
