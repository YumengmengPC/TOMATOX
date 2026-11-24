import ResourcePager from '@/utils/request/resourcePager';
import React from 'react';
import { Button, Spin } from 'antd';
import store from '@/utils/store';
import InfiniteScroll from 'react-infinite-scroller';
import CustomSpin from '@/components/custom-spin/custom-spin';
import TomatoxWaterfall from '@/components/tomatox-waterfall/tomatox-waterfall';
import { queryResources } from '@/utils/request/modules/queryResources';
import cssM from './recommend.scss';

export default class Recommend extends React.Component<{}, { cardsData: IplayResource[]; hasMore: boolean; loading: boolean; error: boolean }> {
    private pages = new ResourcePager();
    private unsubscribe?: () => void;
    private revision = 0;
    state = { cardsData: [] as IplayResource[], hasMore: false, loading: false, error: false };

    componentDidMount() {
        this.unsubscribe = store.subscribe('SITE_ADDRESS', this.refresh);
        this.refresh();
    }

    componentWillUnmount() {
        this.unsubscribe?.();
        this.pages.reset();
        this.revision++;
    }

    private refresh = () => {
        const revision = ++this.revision;
        this.pages.reset();
        this.setState({ cardsData: [], hasMore: false, loading: false, error: false }, () => {
            if (revision === this.revision) void this.loadMore();
        });
    };

    private loadMore = async () => {
        if (this.state.loading) return;
        const revision = this.revision;
        const origin: Iorigin = store.getState('SITE_ADDRESS');
        this.setState({ loading: true, error: false });
        try {
            const result = await this.pages.next(page => queryResources(page, undefined, undefined, 24 * 30, origin));
            if (result && revision === this.revision) {
                this.setState(state => ({ cardsData: [...state.cardsData, ...result.list], hasMore: result.hasMore }));
            }
        } catch {
            if (revision === this.revision) this.setState({ error: true });
        } finally {
            if (revision === this.revision) this.setState({ loading: false });
        }
    };

    render(): React.ReactNode {
        return (
            <div className={cssM.scrollWrapper}>
                <InfiniteScroll
                    initialLoad={false}
                    pageStart={1}
                    loadMore={this.loadMore}
                    hasMore={this.state.hasMore && !this.state.loading && !this.state.error}
                    useWindow={false}>
                    <TomatoxWaterfall data={this.state.cardsData} />
                    {this.state.error && <Button onClick={this.loadMore}>视频源请求失败，点击重试</Button>}
                    <div style={{ height: 100, position: 'relative' }}>
                        <Spin
                            size={'large'}
                            indicator={<CustomSpin />}
                            spinning={this.state.loading}
                            />
                    </div>
                </InfiniteScroll>
            </div>
        );
    }
}
