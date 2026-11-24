const media = [
    {
        id: '40750145',
        name: '秋日森林与风力发电机',
        author: 'Efrem Efre',
        video: 'https://videos.pexels.com/video-files/40750145/17404586_3840_2160_60fps.mp4',
        quality: '4K 60 帧'
    },
    {
        id: '19057686',
        name: '礁石海岸的浪花',
        author: 'Ahmed',
        video: 'https://videos.pexels.com/video-files/19057686/19057686-uhd_3840_2160_60fps.mp4',
        quality: '4K 60 帧'
    }
];

export function isCatalogVideo(url: string) {
    return media.some(entry => entry.video === url);
}

export const catalogTypes = [{ id: 1, text: '自然风光' }];

export const catalog: IplayResource[] = media.map(entry => ({
    id: 'catalog-pexels-' + entry.id,
    type: catalogTypes[0].text,
    picture: 'https://images.pexels.com/videos/' + entry.id + '/pexels-photo-' + entry.id + '.jpeg?auto=compress&w=320',
    lang: '',
    name: entry.name,
    director: entry.author,
    describe: entry.name + ' · Pexels · ' + entry.author,
    area: '',
    actor: '',
    class: '',
    doubanId: '',
    doubanScore: '',
    origin: 'Pexels',
    remark: entry.quality,
    tag: entry.quality,
    year: '',
    updateTime: '',
    playList: new Map([[entry.quality, entry.video]])
}));
