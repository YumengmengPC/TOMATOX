import { app, BrowserWindow } from 'electron';
import { join } from 'path';
import { pathToFileURL } from 'url';
import { initUpdater } from './auto-update/auto-update';
import { registerWindowEvents } from './event-handler/event-handler';

const appUrl = process.env.NODE_ENV === 'production'
    ? pathToFileURL(join(__dirname, 'index.html')).href
    : 'http://localhost:2003/';
let mainWindow: BrowserWindow | null = null;

function createWindow() {
    const window = new BrowserWindow({
        show: false,
        width: 1260,
        height: 700,
        minWidth: 1260,
        minHeight: 700,
        frame: false,
        backgroundColor: '#403f3f',
        webPreferences: {
            preload: join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: true
        }
    });
    mainWindow = window;

    const isAppUrl = (url: string) => url.split('#')[0] === appUrl;
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    window.webContents.on('will-navigate', (event, url) => {
        if (!isAppUrl(url)) event.preventDefault();
    });
    window.webContents.on('will-redirect', (event, url) => {
        if (!isAppUrl(url)) event.preventDefault();
    });

    const disposeWindowEvents = registerWindowEvents(window, isAppUrl);
    const disposeUpdater = initUpdater(window, isAppUrl);
    window.once('ready-to-show', () => window.show());
    window.on('closed', () => {
        disposeWindowEvents();
        disposeUpdater();
        mainWindow = null;
    });
    void window.loadURL(appUrl);
}

app.whenReady().then(() => {
    createWindow();
    app.on('activate', () => {
        if (!mainWindow) createWindow();
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});
