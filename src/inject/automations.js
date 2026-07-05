/* ==========================================================================
   Claude Command Center — in-page automations (MAIN WORLD).
   Injected via webContents.executeJavaScript so it can wrap the page's own
   fetch(). Talks to the preload (isolated world) with window.postMessage; the
   preload relays to the main process over IPC.

   Native replacements for:
     - Claude Auto-Continue      (clicks the "Continue" button)
     - Claude Usage Tracker      (feeds the unified bottom bar)
     - the Tampermonkey resume   (waits out a limit, resumes with human jitter)

   Everything is wrapped in try/catch and selector lookups are text/attribute
   based, so a claude.ai markup change degrades to a no-op, never a broken page.
   ========================================================================== */
(function () {
  'use strict';
  if (window.__CCC_ACTIVE__) return;      // idempotent
  window.__CCC_ACTIVE__ = true;

  var CFG = window.__CCC_CFG__ || {};
  function post(type, data) {
    try { window.postMessage({ __ccc: true, type: type, data: data }, '*'); } catch (e) {}
  }
  var log = function () { if (CFG.usageDebug) console.log.apply(console, ['[ccc:auto]'].concat([].slice.call(arguments))); };

  // -------------------------------------------------------------------------
  // Title report (so the tab chip tracks the chat name)
  // -------------------------------------------------------------------------
  function reportTitle() { post('usage', { title: document.title }); }
  new MutationObserver(reportTitle)
    .observe(document.querySelector('title') || document.documentElement, { childList: true, subtree: true });
  reportTitle();

  // -------------------------------------------------------------------------
  // 1) AUTO-CONTINUE
  // -------------------------------------------------------------------------
  var chain = 0, lastTurnKey = '';
  function findContinueButton() {
    var btns = document.querySelectorAll('button, [role="button"]');
    for (var i = 0; i < btns.length; i++) {
      var txt = (btns[i].textContent || '').trim().toLowerCase();
      if (txt === 'continue' || txt === 'continue response') {
        if (!btns[i].disabled && btns[i].offsetParent !== null) return btns[i];
      }
    }
    return null;
  }
  function autoContinueTick() {
    if (!CFG.autoContinue) return;
    try {
      var btn = findContinueButton();
      if (!btn) { chain = 0; return; }
      // guard: don't hammer the same stuck turn forever
      var key = String(document.querySelectorAll('[data-testid*="message"]').length);
      if (key !== lastTurnKey) { lastTurnKey = key; chain = 0; }
      if (chain >= (CFG.autoContinueMax || 12)) { log('auto-continue chain cap hit'); return; }
      chain++;
      log('clicking Continue (', chain, ')');
      btn.click();
    } catch (e) {}
  }

  // -------------------------------------------------------------------------
  // 2) SESSION-RESUME  (native port of the Tampermonkey script)
  //    When a limit banner appears, remember any prompt we couldn't send,
  //    schedule a wake at reset + random jitter, then resume.
  // -------------------------------------------------------------------------
  var resumeTimer = null, pendingPrompt = null;
  var LIMIT_RE = /(message|usage)\s+limit|reached your (usage|limit)|limit will reset|you'?ve hit|out of messages/i;
  var RESET_TIME_RE = /reset[s]?\s+(?:at\s+)?(\d{1,2}:\d{2}\s*(?:am|pm)?)/i;
  var RESET_IN_RE = /reset[s]?\s+in\s+(?:(\d+)\s*h)?\s*(?:(\d+)\s*m)?/i;

  function limitBannerText() {
    var nodes = document.body.querySelectorAll('div,section,p,span');
    for (var i = 0; i < nodes.length; i++) {
      var t = nodes[i].textContent || '';
      if (t.length < 240 && LIMIT_RE.test(t)) return t;
    }
    return null;
  }
  function jitterMs() {
    var lo = (CFG.resumeJitterMin || 45), hi = (CFG.resumeJitterMax || 210);
    return (lo + Math.random() * (hi - lo)) * 1000;
  }
  function parseResetDelayMs(txt) {
    var m = RESET_IN_RE.exec(txt);
    if (m && (m[1] || m[2])) {
      return ((parseInt(m[1] || 0, 10) * 60 + parseInt(m[2] || 0, 10)) * 60 * 1000);
    }
    m = RESET_TIME_RE.exec(txt);
    if (m) {
      var now = new Date(), target = new Date(now.toDateString() + ' ' + m[1]);
      if (isNaN(target)) return null;
      if (target <= now) target.setDate(target.getDate() + 1);
      return target - now;
    }
    return null; // unknown -> caller will just poll
  }
  function composer() {
    return document.querySelector('div[contenteditable="true"], textarea[data-testid], textarea');
  }
  function setComposer(text) {
    var el = composer(); if (!el) return false;
    if (el.tagName === 'TEXTAREA') {
      el.value = text;
      el.dispatchEvent(new Event('input', { bubbles: true }));
    } else {
      el.focus();
      el.textContent = text;
      el.dispatchEvent(new InputEvent('input', { bubbles: true }));
    }
    return true;
  }
  function clickSend() {
    var b = document.querySelector('button[aria-label*="Send" i], button[data-testid*="send" i]');
    if (b && !b.disabled) { b.click(); return true; }
    return false;
  }
  function scheduleResume(txt) {
    if (!CFG.resume || resumeTimer) return;
    var delay = parseResetDelayMs(txt);
    var wait = (delay != null ? delay : (CFG.resumePoll || 30) * 1000) + jitterMs();
    log('limit hit; resume scheduled in', Math.round(wait / 1000), 's');
    post('limit', { text: txt, resumeInSec: Math.round(wait / 1000) });
    resumeTimer = setTimeout(function tryResume() {
      resumeTimer = null;
      if (limitBannerText()) {           // still limited -> keep polling
        resumeTimer = setTimeout(tryResume, (CFG.resumePoll || 30) * 1000);
        return;
      }
      log('limit lifted; resuming');
      if (pendingPrompt) { setComposer(pendingPrompt); }
      clickSend();
      post('resumed', {});
      pendingPrompt = null;
    }, wait);
  }
  function resumeTick() {
    if (!CFG.resume) return;
    var txt = limitBannerText();
    if (txt) {
      var c = composer();
      if (c && !pendingPrompt) {
        var draft = (c.value || c.textContent || '').trim();
        if (draft) pendingPrompt = draft;
      }
      scheduleResume(txt);
    }
  }

  // -------------------------------------------------------------------------
  // 3) USAGE CAPTURE + COMPLETION  (fetch/XHR wrap)
  //    We don't hardcode claude.ai's private response shape. We (a) scrape the
  //    native usage panel for immediate numbers, and (b) sniff responses that
  //    look usage-related and forward candidates so exact fields can be bound.
  // -------------------------------------------------------------------------
  var USAGE_URL_RE = /usage|rate.?limit|\/limits|\/bootstrap|statsig/i;
  var COMPLETION_URL_RE = /completion|append_message|retry|stop_response|chat_conversations\/.+\/(messages|completion)/i;
  var USAGE_KEY_RE = /five.?hour|resets_at|utilization|usage_limit|"weekly"|remaining_?tokens/i;

  function looksLikeUsage(obj) {
    try { return USAGE_KEY_RE.test(JSON.stringify(obj).slice(0, 2000)); } catch (e) { return false; }
  }

  var origFetch = window.fetch;
  window.fetch = function (input, init) {
    var url = (typeof input === 'string') ? input : (input && input.url) || '';
    var p = origFetch.apply(this, arguments);
    if (CFG.usageDebug) { try { post('url-seen', { url: url }); } catch(e){} }
    if (COMPLETION_URL_RE.test(url)) {
      p.then(function (res) {
        var clone = res.clone();
        // completion streams: fire when the body finishes draining
        if (clone.body && clone.body.getReader) {
          var reader = clone.body.getReader();
          (function pump() {
            reader.read().then(function (r) {
              if (r.done) { post('completed', {}); scrapeSidebarUsage(); return; }
              pump();
            }).catch(function () {});
          })();
        } else { post('completed', {}); scrapeSidebarUsage(); }
      }).catch(function () {});
    }
    if (USAGE_URL_RE.test(url)) {
      p.then(function (res) {
        res.clone().json().then(function (j) {
          if (looksLikeUsage(j)) {
            post('usage-candidate', { url: url, json: j });    // for binding
            emitUsageFromJson(j);                              // best-effort now
          }
        }).catch(function () {});
      }).catch(function () {});
    }
    return p;
  };

  // Best-effort mapping. These field guesses are intentionally conservative and
  // will be replaced with real names once a capture is confirmed (see README).
  function emitUsageFromJson(j) {
    try {
      var out = {};
      var flat = JSON.stringify(j).toLowerCase();
      // if the response clearly carries percentages/resets, hand the raw over;
      // the bottom bar renders whatever recognizable fields it finds.
      if (/five.?hour|5.?hour|session/.test(flat)) out.raw = j;
      if (Object.keys(out).length) post('usage', out);
    } catch (e) {}
  }

  // Native usage panel scrape (immediate, no endpoint needed). Works when the
  // sidebar/usage area is rendered. Matches the "Session (5h)/Weekly" panel.
  function scrapeSidebarUsage() {
    try {
      var data = {};
      var rows = document.body.querySelectorAll('div,li,span');
      for (var i = 0; i < rows.length; i++) {
        var t = (rows[i].textContent || '').trim();
        if (t.length > 60) continue;
        var mSess = /session[^%]*?(\d{1,3})\s*%/i.exec(t);
        var mWeek = /^weekly[^%]*?(\d{1,3})\s*%/i.exec(t);
        var mFab  = /fable[^%]*?(\d{1,3})\s*%/i.exec(t);
        if (mSess) data.session = { pct: +mSess[1] };
        if (mWeek) data.weekly = { pct: +mWeek[1] };
        if (mFab)  data.fableWeekly = { pct: +mFab[1] };
      }
      if (Object.keys(data).length) post('usage', data);
    } catch (e) {}
  }

  // -------------------------------------------------------------------------
  // Heartbeat
  // -------------------------------------------------------------------------
  setInterval(function () {
    autoContinueTick();
    resumeTick();
  }, 1500);
  setInterval(scrapeSidebarUsage, 8000);
  scrapeSidebarUsage();
  log('automations active for tab', CFG.tabId);
})();
