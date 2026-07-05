'use strict';

const fs = require('fs');
const path = require('path');
const { app } = require('electron');

// Small hand-rolled persistence (no electron-store dep to avoid version churn).
// State shape:
// {
//   tabs: [ { id, url, title, lastActive, sidebarExpanded } ],
//   pageOffset: number
// }

function stateFile() {
  return path.join(app.getPath('userData'), 'ccc-state.json');
}

function load() {
  try {
    const raw = fs.readFileSync(stateFile(), 'utf8');
    const data = JSON.parse(raw);
    if (!data || !Array.isArray(data.tabs)) return null;
    return data;
  } catch (_e) {
    return null; // first run or corrupt -> caller supplies defaults
  }
}

let pending = null;
function saveDebounced(getState, delayMs) {
  clearTimeout(pending);
  pending = setTimeout(() => {
    try {
      const data = getState();
      const tmp = stateFile() + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
      fs.renameSync(tmp, stateFile()); // atomic on same fs
    } catch (e) {
      console.error('[ccc] state save failed:', e.message);
    }
  }, delayMs);
}

module.exports = { load, saveDebounced, stateFile };
