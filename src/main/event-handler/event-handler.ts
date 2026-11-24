import { BrowserWindow, ipcMain, IpcMainEvent, IpcMainInvokeEvent, net, shell } from 'electron';

export function isAppSender(
    event: IpcMainEvent | IpcMainInvokeEvent,
    window: BrowserWindow,
    isAppUrl: (url: string) => boolean
) {
    const frame = event.senderFrame;
    return event.sender === window.webContents && !!frame &&
        frame === window.webContents.mainFrame && isAppUrl(frame.url);
}

const maxSourceSize = 8 * 1024 * 1024;

export function registerWindowEvents(window: BrowserWindow, isAppUrl: (url: string) => boolean) {
    const commands = {
        WINDOW_MIN: () => window.minimize(),
        WINDOW_MAX: () => (window.isMaximized() ? window.unmaximize() : window.maximize()),
        WINDOW_CLOSE: () => window.close(),
        WINDOW_DEBUG: () => {
            if (process.env.NODE_ENV !== 'production') window.webContents.openDevTools();
        },
        OPEN_PROJECT: () => void shell.openExternal('https://github.com/yanjiaxuan/TOMATOX')
    };
    const listeners = Object.entries(commands).map(([channel, command]) => {
        const listener = (event: IpcMainEvent) => {
            if (isAppSender(event, window, isAppUrl)) command();
        };
        ipcMain.on(channel, listener);
        return { channel, listener };
    });
    ipcMain.handle('read-video-source', async (event, address: string) => {
        if (!isAppSender(event, window, isAppUrl)) throw new Error('视频源请求无权限');
        const url = new URL(address);
        if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
            throw new Error('视频源地址必须是 HTTP 或 HTTPS');
        }
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000);
        try {
            const response = await net.fetch(url.href, { signal: controller.signal, credentials: 'omit' });
            if (!response.ok || !response.body) throw new Error('视频源请求失败，HTTP ' + response.status);

            const reader = response.body.getReader();
            const chunks: Uint8Array[] = [];
            let size = 0;
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                size += value.byteLength;
                if (size > maxSourceSize) throw new Error('视频源响应过大');
                chunks.push(value);
            }
            return Buffer.concat(chunks).toString('utf8');
        } finally {
            controller.abort();
            clearTimeout(timeout);
        }
    });
    return () => {
        listeners.forEach(({ channel, listener }) => ipcMain.removeListener(channel, listener));
        ipcMain.removeHandler('read-video-source');
    };
}
