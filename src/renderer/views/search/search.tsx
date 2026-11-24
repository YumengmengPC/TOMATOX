import React from 'react';
import TomatoxWaterfall from '@/components/tomatox-waterfall/tomatox-waterfall';
import store from '@/utils/store';
import TOMATOX_ICON from '@/images/svg/icon.svg';
import { queryResources } from '@/utils/request/modules/queryResources';
import ResourcePager from '@/utils/request/resourcePager';
import InfiniteScroll from 'react-infinite-scroller';
import { Spin, Button } from 'antd';
import CustomSpin from '@/components/custom-spin/custom-spin';
import cssM from './search.scss';

export default class Search extends React.Component<{}, { cardsData: IplayResource[]; hasMore: boolean; loading: boolean; error: boolean }> {
    private pages = new ResourcePager();
    private listeners: Array<() => void> = [];
    private searchRevision = 0;
    state = { cardsData: [] as IplayResource[], hasMore: false, loading: false, error: false };

    componentDidMount() {
        this.listeners = [
            store.subscribe('SEARCH_KEYWORDS', this.refresh),
            store.subscribe('SITE_ADDRESS', this.refresh)
        ];
        this.refresh();
    }

    componentWillUnmount() {
        this.listeners.forEach(unsubscribe => unsubscribe());
        this.pages.reset();
        this.searchRevision++;
    }

    private refresh = () => {
        const revision = ++this.searchRevision;
        this.pages.reset();
        this.setState({ cardsData: [], hasMore: false, loading: false, error: false }, () => {
            if (revision === this.searchRevision && store.getState('SEARCH_KEYWORDS')) {
                void this.loadMore();
            }
        });
    };

    private loadMore = async () => {
        if (this.state.loading) return;
        const revision = this.searchRevision;
        const keyword = store.getState('SEARCH_KEYWORDS');
        const origin: Iorigin = store.getState('SITE_ADDRESS');
        this.setState({ loading: true, error: false });
        try {
            const result = await this.pages.next(page => queryResources(page, undefined, keyword, undefined, origin));
            if (result && revision === this.searchRevision) {
                this.setState(state => ({ cardsData: [...state.cardsData, ...result.list], hasMore: result.hasMore }));
            }
        } catch {
            if (revision === this.searchRevision) this.setState({ error: true });
        } finally {
            if (revision === this.searchRevision) {
                this.setState({ loading: false });
            }
        }
    };

    render(): React.ReactNode {
        if (this.state.loading && !this.state.cardsData.length) {
            return <Spin size="large" indicator={<CustomSpin />} />;
        }
        if (this.state.error) {
            return <Button onClick={this.loadMore}>视频源请求失败，点击重试</Button>;
        }
        if (this.state.cardsData.length) {
            return (
                <div className={cssM.scrollWrapper}>
                    <InfiniteScroll
                        initialLoad={false}
                        pageStart={1}
                        loadMore={this.loadMore}
                        hasMore={this.state.hasMore && !this.state.loading}
                        useWindow={false}>
                        <TomatoxWaterfall data={this.state.cardsData} />
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
            );
        }
        return (
            <div className={cssM.noResult}>
                <div>
                    <img src={TOMATOX_ICON} />
                </div>
                <span className={'theme-color'}>暂无结果，请尝试搜索其他关键字</span>
            </div>
        );
    }
}
