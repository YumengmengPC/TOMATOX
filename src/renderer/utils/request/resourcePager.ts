import { ResourcePage } from './modules/queryResources';

export default class ResourcePager {
    private page = 1;
    private pending = false;
    private hasMore = true;
    private revision = 0;

    reset() {
        this.revision++;
        this.page = 1;
        this.pending = false;
        this.hasMore = true;
    }

    async next(loadPage: (page: number) => Promise<ResourcePage>) {
        if (this.pending || !this.hasMore) return;
        const revision = this.revision;
        this.pending = true;
        try {
            const result = await loadPage(this.page);
            if (revision !== this.revision) return;
            this.hasMore = this.page < result.pagecount;
            this.page++;
            return { list: result.list, hasMore: this.hasMore };
        } catch (error) {
            if (revision === this.revision) throw error;
        } finally {
            if (revision === this.revision) this.pending = false;
        }
    }
}
