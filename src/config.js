'use strict';

// ---------------------------------------------------------------------------
// Claude Command Center — central config. Everything you'd want to tweak lives
// here so you never have to dig through main.js.
// ---------------------------------------------------------------------------

module.exports = {
  // The site we wrap. Kept as a constant so a future *.claude.ai move is one edit.
  START_URL: 'https://claude.ai/new',
  ORIGIN: 'https://claude.ai',

  // Layout ------------------------------------------------------------------
  TOPBAR_HEIGHT: 40,     // px — tab strip + "+" + slider
  BOTTOMBAR_HEIGHT: 30,  // px — unified usage bar
  MIN_TILE_WIDTH: 470,   // px — narrowest a chat tile is allowed to get.
                         // columns = floor(windowWidth / MIN_TILE_WIDTH).
                         // ~1920px maximized  -> 4 columns. Half-width -> 2.
  MAX_COLUMNS: 6,        // hard ceiling regardless of monitor width

  // MRU auto-priority -------------------------------------------------------
  // 'offscreen-only' : activating a chat pulls it to the front ONLY if it was
  //                    hidden behind the slider (recommended — visible tiles
  //                    never jump around under you).
  // 'always'         : any activated chat jumps to front-left (literal reading
  //                    of the spec; can be jarring when you click a visible one).
  // 'off'            : manual order only.
  REORDER_MODE: 'offscreen-only',

  // Cloudflare / anti-bot ---------------------------------------------------
  // The wrapper failure mode is a Turnstile loop when the UA string and the
  // JS/client-hint brand disagree. We present a clean, consistent Chrome/Linux
  // identity. BUMP THIS when Chrome moves a major version.
  CHROME_MAJOR: '140',
  USER_AGENT:
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) ' +
    'Chrome/140.0.0.0 Safari/537.36',

  // Session-resume (native port of the Tampermonkey script) -----------------
  // After a session/weekly limit banner, wait until reset, then add a random
  // human-ish delay before resuming so usage doesn't look mechanically timed.
  RESUME_ENABLED: true,
  RESUME_JITTER_MIN_SEC: 45,
  RESUME_JITTER_MAX_SEC: 210,
  RESUME_POLL_SEC: 30, // how often to re-check whether the limit has lifted

  // Auto-continue -----------------------------------------------------------
  AUTOCONTINUE_ENABLED: true,
  AUTOCONTINUE_MAX_CHAIN: 12, // safety: never auto-continue the same turn forever

  // Usage capture -----------------------------------------------------------
  // 'capture' dumps candidate usage responses to a log so we can bind exact
  // field names to real traffic. Flip to false once wired.
  USAGE_CAPTURE_DEBUG: false,

  // Notifications (optional) — you already run ntfy fleet-wide.
  NTFY_TOPIC_URL: '', // e.g. 'https://ntfy.lumennode.uk/ccc' ; empty = disabled

  // Persistence -------------------------------------------------------------
  STATE_DEBOUNCE_MS: 400
};
