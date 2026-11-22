const { app, BrowserWindow, dialog, net, protocol } = require('electron');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

// A stable secure origin keeps saves across portable builds and supports module
// workers, Cache Storage and Web Crypto without opening a listening port.
const origin = 'https://rouge.invalid';

async function start() {
  const game = path.join(process.resourcesPath, 'game');
  protocol.handle('https', async request => {
    const url = new URL(request.url);
    if (url.origin !== origin) return new Response(null, { status: 403 });
    if (request.method !== 'GET') return new Response(null, { status: 405 });
    let pathname;
    try {
      pathname = decodeURIComponent(url.pathname);
    } catch {
      return new Response(null, { status: 400 });
    }
    // Dist contains the entry page and Vite's flat, content-hashed asset tree.
    if (pathname === '/') pathname = '/index.html';
    const commanderPart = /^\/commander-parts\/(?:parts\.json|[0-9a-f]{16}\.(?:bin|webp))$/.test(pathname);
    if (pathname !== '/index.html' && !/^\/assets\/[\w.-]+$/.test(pathname) && !commanderPart) {
      return new Response(null, { status: 404 });
    }
    return net.fetch(pathToFileURL(path.join(game, pathname)).href);
  });

  const window = new BrowserWindow({
    title: '诸省之争',
    width: 1440,
    height: 900,
    backgroundColor: '#101a1b',
    autoHideMenuBar: true,
    webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false },
  });
  window.removeMenu();
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event, url) => {
    if (new URL(url).origin !== origin) event.preventDefault();
  });
  window.maximize();
  await window.loadURL(origin);
}

app.whenReady().then(start).catch(error => {
  dialog.showErrorBox('诸省之争', error.message);
  app.quit();
});
app.on('window-all-closed', () => app.quit());
