import { app, BrowserWindow, IpcMainEvent, ipcMain } from 'electron';
import { autoUpdater, ProgressInfo, UpdateInfo } from 'electron-updater';
import { isAppSender } from '../event-handler/event-handler';

export function initUpdater(window: BrowserWindow, isAppUrl: (url: string) => boolean) {
    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = true;

    const send = (channel: string, data?: unknown) => {
        if (!window.isDestroyed()) window.webContents.send(channel, data);
    };
    const reportError = () => send('update-error');
    const commands = {
        checkForUpdate: () => {
            if (!app.isPackaged) {
                send('update-not-available');
                return;
            }
            void autoUpdater.checkForUpdates().catch(reportError);
        },
        downloadUpdate: () => void autoUpdater.downloadUpdate().catch(reportError),
        quitAndInstall: () => autoUpdater.quitAndInstall()
    };
    const listeners = Object.entries(commands).map(([channel, command]) => {
        const listener = (event: IpcMainEvent) => {
            if (isAppSender(event, window, isAppUrl)) command();
        };
        ipcMain.on(channel, listener);
        return { channel, listener };
    });
    const checking = () => send('checking-for-update');
    const available = ({ version }: UpdateInfo) => send('update-available', { version });
    const notAvailable = () => send('update-not-available');
    const downloaded = () => send('update-downloaded');
    const downloadProgress = (info: ProgressInfo) => send('download-progress', info);
    autoUpdater.on('checking-for-update', checking);
    autoUpdater.on('update-available', available);
    autoUpdater.on('update-not-available', notAvailable);
    autoUpdater.on('error', reportError);
    autoUpdater.on('download-progress', downloadProgress);
    autoUpdater.on('update-downloaded', downloaded);

    return () => {
        listeners.forEach(({ channel, listener }) => ipcMain.removeListener(channel, listener));
        autoUpdater.removeListener('checking-for-update', checking);
        autoUpdater.removeListener('update-available', available);
        autoUpdater.removeListener('update-not-available', notAvailable);
        autoUpdater.removeListener('error', reportError);
        autoUpdater.removeListener('download-progress', downloadProgress);
        autoUpdater.removeListener('update-downloaded', downloaded);
    };
}
