import React from 'react';
import { Input, message } from 'antd';
import {
    BugOutlined,
    ReloadOutlined,
    SearchOutlined,
    LeftOutlined,
    MinusOutlined,
    BlockOutlined,
    CloseOutlined,
    UserOutlined,
    SkinOutlined,
    ShareAltOutlined
} from '@ant-design/icons';
import { Control } from 'react-keeper';
import store from '@/utils/store';
import cssModule from './custom-header.scss';
import { setTheme } from '@/utils/db/storage';

function developingMsg() {
    message.info({
        content: '功能正在开发中...',
        className: cssModule.msgClass,
        icon: <></>,
        duration: 1
    });
}

function changeTheme() {
    const targetTheme = store.getState('TOMATOX_THEME') === 'dark' ? 'light' : 'dark';
    store.setState('TOMATOX_THEME', targetTheme);
    setTheme(targetTheme);
}

export default function CustomHeader() {
    function onSearch(keyword: string) {
        const searchText = keyword.trim();
        if (!searchText) return;
        store.setState('SEARCH_KEYWORDS', searchText);
        Control.go('/search');
    }
    return (
        <div className={cssModule.headerWrapper}>
            <Input.Search
                placeholder="搜索当前视频源"
                onSearch={onSearch}
                enterButton={
                    <span>
                        <SearchOutlined /> 搜索
                    </span>
                }
                className={cssModule.headerInput}
                />
            <span className={cssModule.appBtn}>
                {process.env.NODE_ENV !== 'production' && (
                    <BugOutlined
                        onClick={() => {
                            window.tomatox.openDevTools();
                        }}
                        />
                )}
                {process.env.NODE_ENV !== 'production' && (
                    <ReloadOutlined
                        onClick={() => {
                            window.location.href = '/';
                        }}
                        style={{ fontSize: 18 }}
                        />
                )}
                <SkinOutlined onClick={changeTheme} />
                <UserOutlined onClick={developingMsg} />
                <ShareAltOutlined onClick={developingMsg} />
            </span>
            <span className={cssModule.operationBtn}>
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
    );
}
