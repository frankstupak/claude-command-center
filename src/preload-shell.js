'use strict';

// Preload for our own chrome (topbar/bottombar). Exposes a tiny, safe bridge.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('ccc', {
  send: (channel, payload) => {
    const ok = [
      'ccc:newTab', 'ccc:closeTab', 'ccc:focusTab',
      'ccc:page', 'ccc:toggleSidebar'
    ];
    if (ok.includes(channel)) ipcRenderer.send(channel, payload);
  },
  on: (channel, cb) => {
    const ok = ['tabs', 'usage', 'limit', 'resumed'];
    if (ok.includes(channel)) ipcRenderer.on(channel, (_e, data) => cb(data));
  }
});
