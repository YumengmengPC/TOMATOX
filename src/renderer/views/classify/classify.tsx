import ResourcePager from '@/utils/request/resourcePager';
import React, { ReactElement } from 'react';
import InfiniteScroll from 'react-infinite-scroller';
import TomatoxWaterfall from '@/components/tomatox-waterfall/tomatox-waterfall';
import { Spin, Button } from 'antd';
import CustomSpin from '@/components/custom-spin/custom-spin';
import { queryResources, queryTypes } from '@/utils/request/modules/queryResources';
import store from '@/utils/store';
import cssM from './classify.scss';

export default class Classify extends React.Component<{}, { types: Record<string, number>; selectedType: string; cardsData: IplayResource[]; hasMore: boolean; loading: boolean; error: boolean }> {
    private pages = new ResourcePager();
    private unsubscribe?: () => void;
    private revision = 0;
    state = {
        types: {} as Record<string, number>, selectedType: '',
        cardsData: [] as IplayResource[], hasMore: false, loading: false, error: false
    };

    componentDidMount() {
        this.unsubscribe = store.subscribe('SITE_ADDRESS', this.refresh);
        void this.refresh();
    }

    componentWillUnmount() {
        this.unsubscribe?.();
        this.pages.reset();
        this.revision++;
    }

    private refresh = async () => {
        const revision = ++this.revision;
        this.pages.reset();
        const origin: Iorigin = store.getState('SITE_ADDRESS');
        this.setState({ types: {}, selectedType: '', cardsData: [], hasMore: false, loading: true, error: false });
        try {
            const entries = await queryTypes(origin);
            if (revision !== this.revision) return;
            const types = Object.fromEntries(entries.map(({ text, id }) => [text, id]));
            const selectedType = Object.keys(types)[0] ?? '';
            this.setState({ types, selectedType, loading: false }, () => {
                if (selectedType && revision === this.revision) void this.loadMore();
            });
        } catch {
            if (revision === this.revision) this.setState({ loading: false, error: true });
        }
    };

    private loadMore = async () => {
        if (this.state.loading) return;
        const revision = this.revision;
        const origin: Iorigin = store.getState('SITE_ADDRESS');
        const type = this.state.types[this.state.selectedType];
        this.setState({ loading: true, error: false });
        try {
            const result = await this.pages.next(page => queryResources(page, type, undefined, undefined, origin));
            if (result && revision === this.revision) {
                this.setState(state => ({ cardsData: [...state.cardsData, ...result.list], hasMore: result.hasMore }));
            }
        } catch {
            if (revision === this.revision) this.setState({ error: true });
        } finally {
            if (revision === this.revision) this.setState({ loading: false });
        }
    };

    private changeType(key: string) {
        if (key === this.state.selectedType) return;
        const revision = ++this.revision;
        this.pages.reset();
        this.setState({ selectedType: key, cardsData: [], hasMore: false, loading: false, error: false }, () => {
            if (revision === this.revision) void this.loadMore();
        });
    }

    renderClassify() {
        const res: ReactElement[] = [];
        Object.keys(this.state.types).forEach(item => {
            res.push(
                <span
                    key={item}
                    className={`${cssM.typeItem} ${
                        item === this.state.selectedType ? cssM.typeItemActive : ''
                    }`}
                    onClick={() => this.changeType(item)}>
                    {item}
                </span>
            );
        });
        return res;
    }

    render(): React.ReactNode {
        return (
            <div className={cssM.fullWrapper}>
                <div className={[cssM.typeWrapper, 'theme-2nd-header'].join(' ')}>
                    {this.renderClassify()}
                </div>
                <div className={cssM.scrollWrapper}>
                    <InfiniteScroll
                        initialLoad={false}
                        pageStart={1}
                        hasMore={this.state.hasMore && !this.state.loading && !this.state.error}
                        loadMore={this.loadMore}
                        useWindow={false}>
                        <TomatoxWaterfall data={this.state.cardsData} />
                        {this.state.error && (
                            <Button onClick={this.state.selectedType ? this.loadMore : this.refresh}>视频源请求失败，点击重试</Button>
                        )}
                        {this.state.loading && (
                            <div style={{ height: 100, position: 'relative' }}>
                                <Spin
                                    size={'large'}
                                    indicator={<CustomSpin />}
                                    spinning={this.state.loading}
                                    />
                            </div>
                        )}
                    </InfiniteScroll>
                </div>
            </div>
        );
    }
}
