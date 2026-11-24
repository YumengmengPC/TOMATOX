import { contextBridge, ipcRenderer } from 'electron';

const updateEvents = [
    'checking-for-update', 'update-available', 'update-not-available',
    'update-error', 'update-downloaded', 'download-progress'
];

contextBridge.exposeInMainWorld('tomatox', {
    minimize: () => ipcRenderer.send('WINDOW_MIN'),
    toggleMaximized: () => ipcRenderer.send('WINDOW_MAX'),
    close: () => ipcRenderer.send('WINDOW_CLOSE'),
    openDevTools: () => ipcRenderer.send('WINDOW_DEBUG'),
    openProject: () => ipcRenderer.send('OPEN_PROJECT'),
    checkForUpdate: () => ipcRenderer.send('checkForUpdate'),
    downloadUpdate: () => ipcRenderer.send('downloadUpdate'),
    quitAndInstall: () => ipcRenderer.send('quitAndInstall'),
    onUpdate: (channel: string, callback: (data: unknown) => void) => {
        if (!updateEvents.includes(channel)) throw new Error('未知更新事件');
        const listener = (_event: unknown, data: unknown) => callback(data);
        ipcRenderer.on(channel, listener);
        return () => { ipcRenderer.removeListener(channel, listener); };
    },
    readVideoSource: (address: string) => ipcRenderer.invoke('read-video-source', address)
});
