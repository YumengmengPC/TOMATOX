import React, { useState } from 'react';
import { message } from 'antd';
import { Link } from 'react-keeper';
import TOMATOX_ICON from '@/images/svg/icon.svg';
import { HeartOutlined, HeartFilled } from '@ant-design/icons';
import Indexed from '@/utils/db/indexed';
import cssM from './tomatox-waterfall.scss';

export default function tomatoxWaterfall(props: { data: IplayResource[] }) {
    const [collectRes, setCollectRes] = useState(Indexed.collectedRes);
    const cardsData = props.data;
    function convertEle() {
        const res = [];
        for (const ele of cardsData) {
            res.push(
                <span key={ele.id}>
                    <Link to={`/play`} state={ele}>
                        <div key={ele.id} className={cssM.card}>
                            <div>
                                <img src={ele.picture} className={cssM.descImg} />
                                <span className={cssM.topRightTitle}>{ele.remark}</span>
                                <div>
                                    {collectRes.has(ele.id) ? (
                                        <HeartFilled
                                            className={cssM.resourceCollect}
                                            onClick={async e => {
                                                e.stopPropagation();
                                                e.preventDefault();
                                                try {
                                                    await Indexed.instance?.cancelCollect(ele.id);
                                                    setCollectRes(new Set(Indexed.collectedRes));
                                                } catch {
                                                    message.error('取消收藏失败');
                                                }
                                            }}
                                            />
                                    ) : (
                                        <HeartOutlined
                                            className={cssM.resourceNotCollect}
                                            onClick={async e => {
                                                e.stopPropagation();
                                                e.preventDefault();
                                                try {
                                                    await Indexed.instance?.doCollect(ele);
                                                    setCollectRes(new Set(Indexed.collectedRes));
                                                } catch {
                                                    message.error('收藏保存失败');
                                                }
                                            }}
                                            />
                                    )}
                                </div>
                            </div>
                            <span className={'theme-color'}>{ele.name}</span>
                            <span className={'theme-color'}>
                                {ele.historyOption?.lastPlayDesc ? '' : ele.actor || ele.director || '未知'}
                            </span>
                            {ele.historyOption?.lastPlayDesc && (
                                <span className={'theme-color'}>
                                    {ele.historyOption.lastPlayDesc}
                                </span>
                            )}
                        </div>
                    </Link>
                </span>
            );
        }
        return res;
    }
    return <div className={cssM.cardList}>{convertEle()}</div>;
}
