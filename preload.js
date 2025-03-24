const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electron', {
  hideInputWindow: () => ipcRenderer.send('hide-input-window'),
  showMainWindow: () => ipcRenderer.send('show-main-window'),
  platform: process.platform
});
