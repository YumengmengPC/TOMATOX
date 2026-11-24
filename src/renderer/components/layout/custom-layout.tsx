import { Alert, Button, Layout } from 'antd';
import React, { useEffect, useState } from 'react';
import { HashRouter } from 'react-keeper';
import Indexed from '@/utils/db/indexed';
import cssM from './custom-layout.scss';
import CustomSider from './sider/custom-sider';
import CustomHeader from './header/custom-header';
import CustomContent from './content/custom-content';
import { DEFAULT_ORIGIN, TABLES } from '@/utils/constants';
import { getEnabledOrigin, getTheme, setEnabledOrigin } from '@/utils/db/storage';
import store from '@/utils/store';

const { Header, Sider, Content } = Layout;

export default function CustomLayout() {
    const [loaded, setLoaded] = useState(false);
    const [failed, setFailed] = useState(false);
    const [attempt, setAttempt] = useState(0);
    useEffect(() => {
        let active = true;
        Indexed.init().then(async db => {
            const selected = await db.queryById(TABLES.TABLE_ORIGIN, getEnabledOrigin()) as Iorigin | undefined;
            if (!active) return;
            if (!selected) setEnabledOrigin(DEFAULT_ORIGIN.id);
            store.setState('SITE_ADDRESS', selected ?? DEFAULT_ORIGIN);
            setLoaded(true);
        }).catch(() => {
            if (active) setFailed(true);
        });
        return () => { active = false; };
    }, [attempt]);
    if (failed) {
        return <Alert type="error" message="本地视频库加载失败" action={
            <Button onClick={() => { setFailed(false); setAttempt(attempt + 1); }}>重试</Button>
        } />;
    }
    return (
        <>
            {loaded ? (
                <LayoutFunc />
            ) : (
                <div className={[cssM.defaultBackground, 'theme-content'].join(' ')}>
                    {/* <GlobalLoading /> */}
                </div>
            )}
        </>
    );
}

function LayoutFunc() {
    const [theme, setTheme] = useState(getTheme());
    useEffect(() => {
        return store.subscribe('TOMATOX_THEME', (val: any) => {
            setTheme(val);
        });
    });
    return (
        <HashRouter>
            <Layout className={cssM.fullContent}>
                <Sider theme={theme as 'light' | 'dark'} width={170}>
                    <CustomSider theme={theme} />
                </Sider>
                <Layout>
                    <Header
                        className={[cssM.customHeader, 'theme-header', 'theme-input'].join(' ')}>
                        <CustomHeader />
                    </Header>
                    <Content className={[cssM.customContent, 'theme-content'].join(' ')}>
                        <CustomContent />
                    </Content>
                </Layout>
            </Layout>
        </HashRouter>
    );
}
