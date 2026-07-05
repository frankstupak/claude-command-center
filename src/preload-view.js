'use strict';

// Runs in each claude.ai tile (isolated world). Two jobs:
//  1. Relay the main-world automations' window.postMessage traffic to main.
//  2. Apply sidebar collapse/expand requests coming down from the shell.

const { ipcRenderer } = require('electron');

window.addEventListener('message', (ev) => {
  const m = ev.data;
  if (!m || m.__ccc !== true) return;
  switch (m.type) {
    case 'usage':            ipcRenderer.send('ccc:usage', m.data); break;
    case 'usage-candidate':  ipcRenderer.send('ccc:usageCandidate', m.data); break;
    case 'url-seen':         ipcRenderer.send('ccc:urlSeen', m.data); break;
    case 'completed':        ipcRenderer.send('ccc:completed', m.data); break;
    case 'limit':            ipcRenderer.send('ccc:limit', m.data); break;
    case 'resumed':          ipcRenderer.send('ccc:resumed', m.data); break;
    default: break;
  }
});

ipcRenderer.on('ccc:setSidebar', (_e, expanded) => {
  try {
    document.body.classList.toggle('ccc-sidebar-collapsed', !expanded);
  } catch (_err) {}
});
