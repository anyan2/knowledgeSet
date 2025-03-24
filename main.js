const { app, BrowserWindow, globalShortcut, ipcMain, Tray, Menu } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const isDev = process.env.NODE_ENV === 'development';
const fs = require('fs');

let mainWindow = null;
let inputWindow = null;
let tray = null;
let backendProcess = null;

// 确保应用程序是单实例运行
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
  return;
}

// 创建数据目录
const userDataPath = app.getPath('userData');
const databaseDir = path.join(userDataPath, 'database');
if (!fs.existsSync(databaseDir)) {
  fs.mkdirSync(databaseDir, { recursive: true });
}

function startBackend() {
  const backendPath = path.join(__dirname, 'backend', 'src', 'server.js');
  console.log(`Starting backend from: ${backendPath}`);
  
  backendProcess = spawn('node', [backendPath], {
    env: {
      ...process.env,
      DATABASE_URL: `file:${path.join(userDataPath, 'database', 'knowledge.db')}`,
      PORT: 3001
    }
  });

  backendProcess.stdout.on('data', (data) => {
    console.log(`Backend: ${data}`);
  });

  backendProcess.stderr.on('data', (data) => {
    console.error(`Backend error: ${data}`);
  });

  backendProcess.on('close', (code) => {
    console.log(`Backend process exited with code ${code}`);
    if (code !== 0 && !app.isQuitting) {
      console.log('Restarting backend...');
      startBackend();
    }
  });
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    icon: path.join(__dirname, 'assets', 'icon.png'),
    show: false
  });

  const startUrl = isDev
    ? 'http://localhost:5173'
    : `file://${path.join(__dirname, 'frontend', 'dist', 'index.html') }`;

  mainWindow.loadURL(startUrl);
  
  mainWindow.on('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function createInputWindow() {
  if (inputWindow) {
    inputWindow.show();
    inputWindow.focus();
    return;
  }

  inputWindow = new BrowserWindow({
    width: 600,
    height: 300,
    frame: false,
    resizable: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    icon: path.join(__dirname, 'assets', 'icon.png'),
    show: false
  });

  const startUrl = isDev
    ? 'http://localhost:5173/#/input'
    : `file://${path.join(__dirname, 'frontend', 'dist', 'index.html') }#/input`;

  inputWindow.loadURL(startUrl);
  
  inputWindow.on('ready-to-show', () => {
    inputWindow.show();
    inputWindow.focus();
  });

  inputWindow.on('blur', () => {
    // 当输入窗口失去焦点时，隐藏它
    inputWindow.hide();
  });

  inputWindow.on('closed', () => {
    inputWindow = null;
  });
}

function createTray() {
  tray = new Tray(path.join(__dirname, 'assets', 'icon.png'));
  const contextMenu = Menu.buildFromTemplate([
    { 
      label: '打开主窗口', 
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
        } else {
          createMainWindow();
        }
      }
    },
    { 
      label: '快速记录想法', 
      click: () => {
        createInputWindow();
      }
    },
    { type: 'separator' },
    { 
      label: '退出', 
      click: () => {
        app.quit();
      }
    }
  ]);
  
  tray.setToolTip('知识库系统');
  tray.setContextMenu(contextMenu);
  
  tray.on('click', () => {
    if (mainWindow) {
      mainWindow.show();
      mainWindow.focus();
    } else {
      createMainWindow();
    }
  });
}

app.whenReady().then(() => {
  // 启动后端服务
  startBackend();
  
  // 创建主窗口
  createMainWindow();
  
  // 创建系统托盘
  createTray();
  
  // 注册全局快捷键
  globalShortcut.register('CommandOrControl+Alt+I', () => {
    createInputWindow();
  });
  
  globalShortcut.register('CommandOrControl+Alt+M', () => {
    if (mainWindow) {
      mainWindow.show();
      mainWindow.focus();
    } else {
      createMainWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    // 在macOS上，应用程序和菜单栏通常会保持活动状态
    // 直到用户使用Cmd + Q显式退出
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createMainWindow();
  }
});

app.on('before-quit', () => {
  app.isQuitting = true;
  if (backendProcess) {
    backendProcess.kill();
  }
});

app.on('will-quit', () => {
  // 注销所有快捷键
  globalShortcut.unregisterAll();
});

// IPC通信处理
ipcMain.on('hide-input-window', () => {
  if (inputWindow) {
    inputWindow.hide();
  }
});

ipcMain.on('show-main-window', () => {
  if (mainWindow) {
    mainWindow.show();
    mainWindow.focus();
  } else {
    createMainWindow();
  }
});
