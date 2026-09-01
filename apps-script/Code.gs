/**
 * NIAT Records — Google Sheets → Sync Worker bridge
 * ------------------------------------------------------------------
 * On any edit, this signs and POSTs a "tab dirty" event to the worker,
 * which then pulls & syncs just that tab. Near-instant on the happy path;
 * the worker's 60s cron is the safety net if a push is ever missed.
 *
 * SETUP (once):
 *   1. Extensions → Apps Script in your spreadsheet, paste this file.
 *   2. Project Settings → Script Properties, add:
 *        WORKER_URL   = https://your-worker.up.railway.app/webhook/sync
 *        SYNC_SECRET  = (same value as the worker's SYNC_WEBHOOK_SECRET)
 *   3. Run installTriggers() once and authorize.
 */

/**
 * Adds a "NIAT Sync" menu on open so onboarding a NEW semester's spreadsheet
 * is one click — no code editing. Because this script is bound to the file, a
 * File → Make a copy of a master sheet carries the script into every new
 * semester automatically; the operator just runs "Install triggers" once.
 */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('⚙ NIAT Sync')
    .addItem('Install / refresh triggers', 'installTriggers')
    .addItem('Sync this tab now', 'syncActiveTabNow')
    .addToUi();
}

function installTriggers() {
  const ss = SpreadsheetApp.getActive();
  // Clear old triggers to avoid duplicates
  ScriptApp.getProjectTriggers().forEach(function (t) { ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('onSheetEdit').forSpreadsheet(ss).onEdit().create();
  ScriptApp.newTrigger('onSheetChange').forSpreadsheet(ss).onChange().create();
  SpreadsheetApp.getActive().toast('NIAT Sync triggers installed.', 'NIAT Sync', 5);
}

/** Manual push of the currently active tab (handy right after onboarding). */
function syncActiveTabNow() {
  notify(SpreadsheetApp.getActive().getActiveSheet().getName());
  SpreadsheetApp.getActive().toast('Sync requested for this tab.', 'NIAT Sync', 5);
}

/** Fine-grained cell edits — gives us the exact tab. */
function onSheetEdit(e) {
  try {
    var name = e && e.range ? e.range.getSheet().getName() : SpreadsheetApp.getActive().getActiveSheet().getName();
    notify(name);
  } catch (err) { Logger.log('onSheetEdit error: ' + err); }
}

/** Structural changes (row insert/delete, etc.). */
function onSheetChange(e) {
  try {
    var name = SpreadsheetApp.getActive().getActiveSheet().getName();
    notify(name);
  } catch (err) { Logger.log('onSheetChange error: ' + err); }
}

/** Debounce per tab (5s) using CacheService, then POST the dirty tab. */
function notify(tabName) {
  var denylist = ['Sheet10', 'Sheet11', 'Sheet12', '{University_Copy this sheet and make your subshet}'];
  if (denylist.indexOf(tabName) !== -1) return;

  var cache = CacheService.getScriptCache();
  var key = 'dirty::' + tabName;
  if (cache.get(key)) { cache.put(key, '1', 6); return; } // already queued
  cache.put(key, '1', 6);
  Utilities.sleep(1200); // small coalesce window

  var props = PropertiesService.getScriptProperties();
  var url = props.getProperty('WORKER_URL');
  var secret = props.getProperty('SYNC_SECRET');
  if (!url || !secret) { Logger.log('Missing WORKER_URL / SYNC_SECRET'); return; }

  var body = JSON.stringify({
    spreadsheetId: SpreadsheetApp.getActive().getId(),
    tabName: tabName,
    ts: Date.now(),
  });
  var sig = hmacHex(body, secret);

  UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    payload: body,
    headers: { 'x-signature': sig },
    muteHttpExceptions: true,
  });
}

/** HMAC-SHA256 hex, matching the worker's crypto.createHmac('sha256').digest('hex'). */
function hmacHex(message, secret) {
  var raw = Utilities.computeHmacSha256Signature(message, secret);
  return raw.map(function (b) {
    var v = (b < 0 ? b + 256 : b).toString(16);
    return v.length === 1 ? '0' + v : v;
  }).join('');
}
