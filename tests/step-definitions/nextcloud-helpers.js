'use strict';

// Shared plumbing of the steps for a file and collaboration server: the address of the site, waiting for its
// apps, the users registry and the session cache, the server's own APIs as an account (OCS and WebDAV, in
// sessions of their own), the clean-up after a scenario, the fixtures a scenario uploads, the pop-up messages,
// and the mailbox of the mail catcher.
//
// This file registers no step. Each app of the server (Files, Activity, Settings, the dashboard) is a
// single-page app of its own: a page loads, then the app asks the server's APIs for its content (a WebDAV
// PROPFIND for a folder, an OCS call for the activity, the accounts or the notifications) behind a loading
// icon. The steps wait for those signals: the page load, the loading icon gone, the requests of the page
// answered. Never a fixed time.

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { friendly, smartSettle } = require('webship-js/tests/step-definitions/webship');
const { request: playwrightRequest } = require('playwright');

// ---------------------------------------------------------------------------
// Budgets and text
// ---------------------------------------------------------------------------

/** The per-assertion wait budget: `minWaitTime.page` from cucumber.js, at least 15 seconds. */
function budget(world) {
  return Math.max((world && world.minWaitTime && world.minWaitTime.page) || 0, 15000);
}

/** White space collapsed and trimmed; the invisible marks some texts carry removed. */
function clean(text) {
  return String(text === null || text === undefined ? '' : text).replace(/[­​-‏‪-‮⁠-⁩﻿]/g, '').replace(/\s+/g, ' ').trim();
}

/** A text as a comparison sees it: cleaned, in lower case, typographic quotes straight, a closing colon or ellipsis dropped. */
function normal(text) {
  return clean(text).replace(/[“”„"]/g, '"').replace(/[‘’‚']/g, "'").replace(/(?:\s*[:…]+|\.\.\.)$/, '').toLowerCase();
}

/** Whether a text contains another, as `normal` reads them. */
function mentions(text, part) {
  return normal(text).includes(normal(part));
}

/** Whether two texts are the same, as `normal` reads them. */
function same(a, b) {
  return normal(a) === normal(b);
}

/** A list for an error message: `"a", "b", "c"` or `(none)`. */
function listed(values, max = 12) {
  const items = [...new Set((values || []).map(clean).filter(Boolean))];
  if (!items.length) return '(none)';
  const shown = items.slice(0, max).map((item) => `"${item}"`).join(', ');
  return items.length > max ? `${shown} and ${items.length - max} more` : shown;
}

/** A password no person would choose, that the server's password policy accepts. */
function newPassword() {
  return `Webship-${crypto.randomBytes(6).toString('hex')}-Aa1`;
}

/** A CSS attribute value in double quotes. */
function cssString(value) {
  return `"${String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

// ---------------------------------------------------------------------------
// The address of the site (launchUrl)
// ---------------------------------------------------------------------------

/** The site's root without a trailing slash. */
function siteRoot(world) {
  return String(world.launchUrl || (world.parameters && world.parameters.launchUrl) || '').replace(/\/+$/, '');
}

/** An address of the site from a path (absolute addresses stay as they are). */
function siteUrl(world, href = '/') {
  if (/^https?:\/\//.test(href)) return href;
  return siteRoot(world) + (String(href).startsWith('/') ? '' : '/') + href;
}

/** Whether an address is one of the site's. */
function onSite(world, href) {
  const root = siteRoot(world);
  return String(href || '') === root || String(href || '').startsWith(root + '/');
}

/** The path and query of the page on screen. */
function currentPath(world) {
  try {
    const url = new URL(world.page.url());
    return decodeURIComponent(url.pathname) + decodeURIComponent(url.search);
  } catch {
    return '';
  }
}

// ---------------------------------------------------------------------------
// The request the browser cut
// ---------------------------------------------------------------------------

/** The hint of a failure where the browser cut a request. */
const CUT_HINT = 'The request was cut, or the site\'s name did not resolve, because the network of the machine changed (a container starting); nothing is wrong with the scenario. Run it again. On a shared machine, run the suite in the project\'s container (cmd-tools-testing.sh <project> --run in the Webship Workspace), where the network of the host does not reach.';

const NETWORK_ERRORS = /ERR_NETWORK_CHANGED|ERR_INTERNET_DISCONNECTED|ERR_CONNECTION_RESET|ERR_CONNECTION_CLOSED|ERR_NAME_NOT_RESOLVED|ERR_ADDRESS_UNREACHABLE|ERR_EMPTY_RESPONSE/;

/** A sentence when the browser cut a request of the page since `since`, else ''. */
function cutRequest(world, since = 0) {
  const url = String((world.page && world.page.url()) || '');
  if (url.startsWith('chrome-error://')) return `the browser shows its own error page (${url}): the request was cut before the site answered`;
  const failed = (world.__ncFailedRequests || []).filter((f) => f.at >= since && NETWORK_ERRORS.test(f.error));
  if (failed.length) {
    const f = failed[failed.length - 1];
    return `the browser lost the request ${f.method} ${f.url} (${f.error}): it was cut before the site answered`;
  }
  return '';
}

/** A friendly failure, with the cut request named when there was one. */
function fail(world, message, hint, since = 0) {
  const cut = cutRequest(world, since);
  if (cut && !/cut before the site answered/.test(message)) return friendly({ message: `${message} In this scenario ${cut}.`, hint: CUT_HINT });
  return friendly({ message, hint });
}

// ---------------------------------------------------------------------------
// The page: instrumentation and waiting
// ---------------------------------------------------------------------------

/**
 * Runs in every document before the page's own scripts. webship-js counts the pending timers of a page to know
 * when it settled; the server's apps keep timers that fire many seconds later (the text editor's sync every five
 * seconds, the notifications poll, the session heartbeat): a timer of five seconds or more is no work the page
 * is doing now, so it is taken out of the count, which stays right whichever init script runs first.
 */
function quietLongTimers() {
  if (window.__webshipNcQuiet) return;
  window.__webshipNcQuiet = true;
  const counted = () => typeof window.__webshipPendingTimers === 'number';
  if (typeof window.setTimeout !== 'function') return;
  const previousSet = window.setTimeout;
  const previousClear = window.clearTimeout;
  const long = new Set();
  window.setTimeout = function (callback, delay, ...args) {
    if (!(Number(delay) >= 5000) || !counted()) return previousSet.call(this, callback, delay, ...args);
    let id;
    const fire = function () {
      if (long.delete(id) && counted()) window.__webshipPendingTimers += 1;
      return typeof callback === 'function' ? callback.apply(this, args) : undefined;
    };
    id = previousSet.call(this, fire, delay);
    long.add(id);
    window.__webshipPendingTimers -= 1;
    return id;
  };
  window.clearTimeout = function (id) {
    if (long.delete(id) && counted()) window.__webshipPendingTimers += 1;
    return previousClear.call(this, id);
  };
}

// Requests that come back by themselves while a page is open, and say nothing about the step that ran: the text
// editor's sync, the notifications poll, the session heartbeat, the user status heartbeat.
const BACKGROUND_REQUESTS = /\/apps\/text\/(?:public\/)?session\/[^/]+\/sync|\/apps\/notifications\/api\/v2\/notifications(?:\?|$)|\/csrftoken|\/heartbeat|\/apps\/user_status\/api\/v1\/heartbeat/;

const TRACKED = new WeakMap();

/** The background requests (XHR and fetch) of a page that are still running; a navigation drops those of the page it leaves. */
function requests(page) {
  let state = TRACKED.get(page);
  if (!state) {
    state = { pending: new Set() };
    TRACKED.set(page, state);
    page.on('request', (r) => {
      if (['xhr', 'fetch'].includes(r.resourceType()) && !BACKGROUND_REQUESTS.test(r.url())) state.pending.add(r);
    });
    const done = (r) => { state.pending.delete(r); };
    page.on('requestfinished', done);
    page.on('requestfailed', done);
    page.on('framenavigated', (frame) => { if (frame === page.mainFrame()) state.pending.clear(); });
  }
  return state;
}

/** Set up a page the World opened: the long timers, the requests in flight, the requests the browser cut. */
async function instrument(world, page) {
  await page.addInitScript(quietLongTimers).catch(() => {});
  requests(page);
  world.__ncFailedRequests = world.__ncFailedRequests || [];
  page.on('requestfailed', (r) => {
    const failure = r.failure();
    world.__ncFailedRequests.push({ at: Date.now(), method: r.method(), url: r.url(), error: (failure && failure.errorText) || '' });
  });
}

// A loading icon the server's apps show while they ask for their content (the vue components' loading icon, the
// older icon classes) in the content, the sidebar, a dialog or a header menu.
const SPINNERS = '.loading-icon, .icon-loading, .icon-loading-small, .icon-loading-dark, [aria-busy="true"]';

/** What the page still has to do, as it says itself: '' when nothing. */
async function pageWork(world) {
  try {
    return await world.page.evaluate((spinners) => {
      if (document.readyState === 'loading') return 'the document is still loading';
      // An infinite list keeps its "Loading more …" icon at its foot as the mark that scrolling there loads more
      // (the activity stream): that icon is no work in progress.
      const spinner = [...document.querySelectorAll(spinners)].find((s) => s.getClientRects().length && !s.closest('[aria-hidden="true"]:not(.loading-icon)') && !/^loading more/i.test(s.getAttribute('aria-label') || ''));
      if (spinner) return `the page shows a loading icon (${(spinner.getAttribute('aria-label') || spinner.className || '').toString().slice(0, 60)})`;
      return '';
    }, SPINNERS);
  } catch (err) {
    return /Execution context was destroyed|navigation|Target closed|has been closed/i.test(String(err && err.message)) ? 'a new page is loading' : '';
  }
}

/**
 * Wait until the page is ready to use: its document loaded, no loading icon, no request of its own running, and
 * all of it so for a short moment (200 ms). Returns '' when it is, else what the page was still doing when the
 * time ran out; `strict` makes that a failure.
 */
async function ready(world, { timeout, strict = false } = {}) {
  const page = world.page;
  const limit = timeout || budget(world);
  const deadline = Date.now() + limit;
  const state = requests(page);
  await page.waitForLoadState('domcontentloaded', { timeout: limit }).catch(() => {});
  let busy = '';
  let quietSince = 0;
  for (;;) {
    busy = await pageWork(world);
    if (!busy && state.pending.size) {
      busy = `requests in flight: ${[...state.pending].slice(0, 3).map((r) => `${r.method()} ${decodeURIComponent(r.url().replace(/^https?:\/\/[^/]+/, '')).slice(0, 90)}`).join(', ')}`;
    }
    if (!busy) {
      if (!quietSince) quietSince = Date.now();
      if (Date.now() - quietSince >= 200) return '';
    } else {
      quietSince = 0;
    }
    if (Date.now() > deadline) break;
    await page.waitForTimeout(50);
  }
  if (strict) {
    throw fail(world, `The page did not finish its work within ${Math.round(limit / 1000)} seconds (${page.url()}): ${busy}.`, 'Each app shows a loading icon while it asks the server for its content, and every request answers within a moment; look at the screenshot of the failure and the browser console.');
  }
  return busy;
}

/** Open an address of the site and wait until the page is ready. A cut request is tried again once. */
async function open(world, href) {
  const page = world.page;
  const url = siteUrl(world, href);
  const go = () => page.goto(url, { waitUntil: 'domcontentloaded', timeout: budget(world) * 2 });
  let response = null;
  try {
    response = await go();
  } catch (err) {
    if (NETWORK_ERRORS.test(String(err && err.message)) || /chrome-error:\/\/chromewebdata|ERR_ABORTED/.test(String(err && err.message))) {
      await page.waitForTimeout(500);
      response = await go().catch(() => null);
    } else {
      throw friendly({ message: `Could not open ${url}.`, cause: err, hint: 'Check launchUrl in cucumber.js, and that the site is running (ddev describe).' });
    }
  }
  if (cutRequest(world)) {
    await page.waitForTimeout(500);
    response = await go().catch(() => null);
  }
  await settled(world);
  return response;
}

/**
 * Wait until the page has done its own work: webship-js's settle (no request, no timer, no change for a moment) for
 * at most three seconds, then ready (no loading icon, no request of its own). The settle is bounded: an app that
 * keeps a short timer of its own going would hold it for its whole budget, and a message that pops up after an
 * action lives only a few seconds.
 */
async function settled(world) {
  await smartSettle(world.page, Math.min(budget(world), 3000)).catch(() => {});
  await ready(world);
}

/**
 * Run an action that sends the page to a new address (a form POST of the login page, a link of a menu) and wait
 * for the new page: the main frame navigates, then the page is ready.
 */
async function navigating(world, action, { timeout } = {}) {
  const page = world.page;
  const limit = timeout || budget(world) * 2;
  const since = Date.now();
  const before = page.url();
  const navigated = page.waitForEvent('framenavigated', { predicate: (frame) => frame === page.mainFrame(), timeout: limit }).then(() => true).catch(() => false);
  await action();
  if (!(await navigated)) {
    throw fail(world, `The page did not change within ${Math.round(limit / 1000)} seconds after the action (still at ${before}).`, 'Look at the screenshot of the failure for a message that stopped it.', since);
  }
  await page.waitForLoadState('domcontentloaded', { timeout: limit }).catch(() => {});
  const cut = cutRequest(world, since);
  if (cut) throw friendly({ message: `The page after the action did not come: ${cut}.`, hint: CUT_HINT });
  await settled(world);
}

/**
 * Run an action and wait for the server to answer the request it sends: the first request whose method and
 * address match `pattern` (`METHOD /path` regex source, or a predicate), then the page settled. Returns the
 * response. A step that changes something on the server waits on its own request, never on the clock.
 */
async function answered(world, pattern, action, { timeout, what } = {}) {
  const page = world.page;
  const limit = timeout || budget(world) * 2;
  const since = Date.now();
  const test = typeof pattern === 'function' ? pattern : (r) => new RegExp(pattern).test(`${r.request().method()} ${decodeURIComponent(r.url())}`);
  const response = page.waitForResponse((r) => { try { return test(r); } catch { return false; } }, { timeout: limit }).catch(() => null);
  await action();
  const res = await response;
  if (!res) {
    throw fail(world, `The page sent no request to ${what || 'the server'} within ${Math.round(limit / 1000)} seconds after the action.`, 'The action did not reach the server: look at the screenshot of the failure for a dialog or a message that stopped it.', since);
  }
  // The page's own work after the answer: its loading icons and its requests (the list drawn again).
  await ready(world);
  return res;
}

/** Poll a reading until it satisfies a check, or fail with the last reading. */
async function eventually(world, read, check, explain, timeout) {
  const deadline = Date.now() + (timeout || budget(world));
  let value;
  for (;;) {
    value = await read();
    if (check(value)) return value;
    if (Date.now() > deadline) {
      const e = await explain(value);
      throw fail(world, e.message, e.hint);
    }
    await world.page.waitForTimeout(150);
  }
}

/** The main heading of the page, as a person reads it. */
async function heading(page) {
  return clean(await page.locator('main h1:visible, main h2:visible, h2:visible, h1:visible').first().innerText({ timeout: 1500 }).catch(() => ''));
}

/** What the page on screen says about itself, for an error message. */
async function pageSummary(world) {
  const cut = cutRequest(world);
  if (cut) return cut;
  const page = world.page;
  return `the page "${clean(await page.title().catch(() => '')) || '(no title)'}" shows "${(await heading(page)) || '(no heading)'}" at ${page.url()}`;
}

/** The pop-up messages (toasts) on screen: [{ kind: 'error' | 'success' | 'info', text }]. They stay about seven seconds. */
async function toasts(page) {
  return page.evaluate(() => [...document.querySelectorAll('[class*="_toast_"], .toastify')]
    .filter((t) => t.getClientRects().length && !t.parentElement.closest('[class*="_toast_"]'))
    .map((t) => ({ kind: t.getAttribute('role') === 'alert' || /error/.test(t.className) ? 'error' : (/success/.test(t.className) ? 'success' : 'info'), text: (t.querySelector('[class*="_toastMessage_"]') || t).innerText.replace(/\s+/g, ' ').trim() })))
    .catch(() => []);
}

/** Wait for a pop-up message that contains `text` (a person reads it before it goes). */
async function expectToast(world, text, { kind } = {}) {
  return eventually(world, () => toasts(world.page), (list) => list.some((t) => mentions(t.text, text) && (!kind || t.kind === kind)), async (list) => ({
    message: `No message "${text}" popped up${kind ? ` as ${kind === 'error' ? 'an error' : 'a confirmation'}` : ''}. On screen: ${list.length ? listed(list.map((t) => `${t.text} (${t.kind})`)) : 'no message'}.`,
    hint: 'A message pops up for a few seconds after the action that caused it: check it in the step right after that action.',
  }));
}

// ---------------------------------------------------------------------------
// The users registry and the session cache
// ---------------------------------------------------------------------------

/**
 * The account a handle of the users registry stands for: { handle, username, email, displayName, password,
 * configuredPassword }. A password this scenario gave the account (a reset, a change) wins over the registry's.
 */
function resolveUser(world, handle) {
  const users = (world.parameters && world.parameters.users) || {};
  const entry = users[handle];
  if (!entry) {
    throw friendly({
      message: `The user "${handle}" is not in the users registry. Known users: ${Object.keys(users).join(', ') || '(none)'}.`,
      hint: `Add it to worldParameters.users in cucumber.js: users: { ${handle}: { username: '${handle}', email: '${handle}@example.com', password: process.env.${String(handle).toUpperCase()}_PASSWORD } }. The account itself is made once by the build of the site, never by a feature.`,
    });
  }
  if (!entry.password) {
    throw friendly({ message: `The user "${handle}" has no password in the users registry.`, hint: `Set worldParameters.users.${handle}.password in cucumber.js.` });
  }
  const changed = (world.__ncPasswords || {})[handle];
  return { handle, username: entry.username || handle, email: entry.email || '', displayName: entry.displayName || '', password: changed || entry.password, configuredPassword: entry.password };
}

/** The handle of the registry an address, a username or a display name stands for, or ''. */
function handleOf(world, who) {
  const users = (world.parameters && world.parameters.users) || {};
  if (users[who]) return who;
  for (const [handle, entry] of Object.entries(users)) {
    if (same(entry.username || handle, who) || (entry.email && same(entry.email, who)) || (entry.displayName && same(entry.displayName, who))) return handle;
  }
  return '';
}

/** The email address of a handle of the registry; anything else is an address already. */
function addressOf(world, who) {
  const handle = handleOf(world, who);
  if (handle) {
    const account = resolveUser(world, handle);
    if (!account.email) throw friendly({ message: `The user "${handle}" has no email in the users registry.`, hint: `Set worldParameters.users.${handle}.email in cucumber.js.` });
    return account.email;
  }
  return String(who);
}

// The sessions of the accounts that logged in during this run, by site and username: the browser's cookies of the
// site after the login (the session and, with "Remember me", the login cookies that renew it).
const SESSIONS = new Map();

function sessionKey(world, username) {
  return `${siteRoot(world)}|${String(username).toLowerCase()}`;
}

/** Whether an account that logged in keeps its session for the rest of the run (`reuseSessions`, on by default). */
function reusesSessions(world) {
  return !(world.parameters && world.parameters.reuseSessions === false);
}

/** The cookies of the site in the browser's context. */
async function siteCookies(world) {
  const host = new URL(siteRoot(world)).hostname;
  return (await world.context.cookies()).filter((c) => c.domain.replace(/^\./, '') === host);
}

/** Remember the browser's session for an account. */
async function keepSession(world, handle) {
  if (!reusesSessions(world) || !handle) return;
  const account = resolveUser(world, handle);
  SESSIONS.set(sessionKey(world, account.username), await siteCookies(world));
}

/** Forget the kept session of an account (it logged out, or its password changed). */
function dropSession(world, username) {
  SESSIONS.delete(sessionKey(world, username));
}

/** Drop every cookie of the browser and leave the page: the browser is a visitor; the sessions on the server live on. */
async function forgetBrowser(world) {
  await world.context.clearCookies();
  await world.page.goto('about:blank').catch(() => {});
  world.__ncUser = null;
}

/**
 * The account the server says the browser is logged in as, without touching the page: the server's own answer to
 * GET /ocs/v2.php/cloud/user with the browser's cookies. Returns { id, displayName } or null for a visitor.
 */
async function signedInAs(world) {
  const res = await world.context.request.get(siteUrl(world, '/ocs/v2.php/cloud/user?format=json'), {
    headers: { 'OCS-APIRequest': 'true', Accept: 'application/json' }, failOnStatusCode: false, maxRedirects: 0, ignoreHTTPSErrors: true,
  }).catch(() => null);
  if (!res || res.status() !== 200) return null;
  const json = await res.json().catch(() => ({}));
  const data = json && json.ocs && json.ocs.data;
  return data && data.id ? { id: String(data.id), displayName: String(data['display-name'] || data.displayname || '') } : null;
}

// ---------------------------------------------------------------------------
// The server's APIs as an account (OCS and WebDAV), in sessions of their own
// ---------------------------------------------------------------------------

const CLIENTS = new Map();

/**
 * A client of the server's APIs that works as an account of the registry, with the account's password (HTTP basic
 * authentication), in a request context of its own: the browser's session is never touched.
 *   ocs(method, path, form)        an OCS call under /ocs/v2.php with a form; returns { status, ok, data, message }
 *   ocsJson(method, path, body)    the same with a JSON body
 *   dav(method, path, options)     a WebDAV call under /remote.php/dav/files/<username>; returns the response
 *   davRaw(method, url, options)   a WebDAV call to another address of the server (the trash bin)
 */
async function api(world, handle) {
  const account = resolveUser(world, handle);
  const key = `${sessionKey(world, account.username)}|${account.password}`;
  if (CLIENTS.has(key)) return CLIENTS.get(key);
  const ctx = await playwrightRequest.newContext({ ignoreHTTPSErrors: true, httpCredentials: { username: account.username, password: account.password, send: 'always' } });
  const base = siteRoot(world);
  const filesRoot = `${base}/remote.php/dav/files/${encodeURIComponent(account.username)}`;
  const client = {
    handle,
    account,
    filesRoot,
    async ocs(method, apiPath, form) {
      const options = { method, headers: { 'OCS-APIRequest': 'true', Accept: 'application/json' }, failOnStatusCode: false };
      if (form !== undefined) options.form = form;
      const res = await ctx.fetch(`${base}/ocs/v2.php${apiPath}${apiPath.includes('?') ? '&' : '?'}format=json`, options);
      let json = null;
      try { json = await res.json(); } catch { json = null; }
      const meta = (json && json.ocs && json.ocs.meta) || {};
      return { status: res.status(), ok: res.status() < 300 && meta.status !== 'failure', data: json && json.ocs ? json.ocs.data : null, message: meta.message || '' };
    },
    async ocsJson(method, apiPath, body) {
      const res = await ctx.fetch(`${base}/ocs/v2.php${apiPath}${apiPath.includes('?') ? '&' : '?'}format=json`, { method, headers: { 'OCS-APIRequest': 'true', Accept: 'application/json' }, data: body, failOnStatusCode: false });
      let json = null;
      try { json = await res.json(); } catch { json = null; }
      const meta = (json && json.ocs && json.ocs.meta) || {};
      return { status: res.status(), ok: res.status() < 300 && meta.status !== 'failure', data: json && json.ocs ? json.ocs.data : null, message: meta.message || '' };
    },
    async dav(method, filePath, options = {}) {
      const target = `${filesRoot}/${String(filePath).split('/').filter(Boolean).map(encodeURIComponent).join('/')}`;
      return ctx.fetch(target, Object.assign({ method, failOnStatusCode: false }, options));
    },
    async davRaw(method, url, options = {}) {
      return ctx.fetch(url, Object.assign({ method, failOnStatusCode: false }, options));
    },
  };
  CLIENTS.set(key, client);
  return client;
}

/** The account the test-data steps and the clean-up use for what only an administrator may do (`worldParameters.dataAdmin`). */
async function adminApi(world) {
  const handle = (world.parameters && world.parameters.dataAdmin) || '';
  if (!handle) {
    throw friendly({
      message: 'This step needs an administrator of the site, and cucumber.js names no data administrator.',
      hint: "Set worldParameters.dataAdmin in cucumber.js to a handle of the users registry that is in the admin group, such as 'administrator'.",
    });
  }
  return api(world, handle);
}

/** The display name of a handle of the registry: its `displayName`, else what the server says (asked once). */
const DISPLAY_NAMES = new Map();
async function displayNameOf(world, handle) {
  const account = resolveUser(world, handle);
  if (account.displayName) return account.displayName;
  const key = sessionKey(world, account.username);
  if (DISPLAY_NAMES.has(key)) return DISPLAY_NAMES.get(key);
  const client = await api(world, handle);
  const res = await client.ocs('GET', '/cloud/user');
  const name = (res.ok && res.data && (res.data['display-name'] || res.data.displayname)) || account.username;
  DISPLAY_NAMES.set(key, name);
  return name;
}

/** The names in a folder of an account (WebDAV PROPFIND, depth 1), or null when the folder is not there. */
async function davNames(client, folder = '') {
  const res = await client.dav('PROPFIND', folder, { headers: { Depth: '1', 'Content-Type': 'application/xml' }, data: '<?xml version="1.0"?><d:propfind xmlns:d="DAV:"><d:prop><d:resourcetype/></d:prop></d:propfind>' });
  if (res.status() === 404) return null;
  if (res.status() !== 207) throw friendly({ message: `The server answered ${res.status()} to a listing of "${folder || '/'}" for ${client.account.username}.`, hint: 'Check the account\'s password in worldParameters.users of cucumber.js.' });
  const body = await res.text();
  const hrefs = [...body.matchAll(/<d:href>([^<]+)<\/d:href>/g)].map((m) => decodeURIComponent(m[1]));
  const own = decodeURIComponent(new URL(client.filesRoot).pathname) + (folder ? `/${folder.split('/').filter(Boolean).join('/')}` : '');
  return hrefs.map((h) => h.replace(/\/$/, '')).filter((h) => h !== own.replace(/\/$/, '')).map((h) => h.split('/').pop());
}

/** The entries of an account's trash bin: [{ name (as it was), entry (its name in the trash), url }]. */
async function trashEntries(world, client) {
  const url = `${siteRoot(world)}/remote.php/dav/trashbin/${encodeURIComponent(client.account.username)}/trash`;
  const res = await client.davRaw('PROPFIND', url, { headers: { Depth: '1', 'Content-Type': 'application/xml' }, data: '<?xml version="1.0"?><d:propfind xmlns:d="DAV:" xmlns:nc="http://nextcloud.org/ns"><d:prop><nc:trashbin-filename/></d:prop></d:propfind>' });
  if (res.status() !== 207) return [];
  const body = await res.text();
  const entries = [];
  for (const block of body.split('<d:response>').slice(1)) {
    const href = (block.match(/<d:href>([^<]+)<\/d:href>/) || [])[1];
    const original = (block.match(/<nc:trashbin-filename>([^<]*)<\/nc:trashbin-filename>/) || [])[1];
    if (!href || /\/trash\/?$/.test(decodeURIComponent(href))) continue;
    entries.push({ name: original ? original.replace(/&amp;/g, '&') : decodeURIComponent(href).replace(/\/$/, '').split('/').pop().replace(/\.d\d+$/, ''), entry: decodeURIComponent(href).replace(/\/$/, '').split('/').pop(), url: new URL(href, siteRoot(world)).toString() });
  }
  return entries;
}

// ---------------------------------------------------------------------------
// The clean-up after a scenario
// ---------------------------------------------------------------------------

/** Whether the steps put back after a scenario what it changed (`cleanUp`, on by default). */
function cleansUp(world) {
  return !(world.parameters && world.parameters.cleanUp === false);
}

/** Register a clean-up for after the scenario, once per key; the newest runs first. */
function afterScenario(world, key, fn) {
  world.__ncCleanups = world.__ncCleanups || [];
  if (world.__ncCleanups.some((c) => c.key === key)) return false;
  world.__ncCleanups.push({ key, fn });
  return true;
}

/** Run the clean-ups of the scenario. A failed one is reported, the others still run. */
async function runCleanups(world) {
  const list = (world.__ncCleanups || []).slice().reverse();
  world.__ncCleanups = [];
  const problems = [];
  for (const { key, fn } of list) {
    try { await fn(); } catch (err) { problems.push(`${key}: ${(err && err.message) || err}`); }
  }
  return problems;
}

/**
 * Before the first change a scenario makes to an account's files: remember what the account has (the names at the
 * top of its files, its trash bin, its shares), and after the scenario take away what is new: the files and
 * folders at the top that were not there (with what is in them, their shares and favorites), the entries of the
 * trash bin that were not there, and the shares that were not there.
 */
async function trackFiles(world, handle) {
  if (!cleansUp(world)) return;
  const key = `files:${handle}`;
  if ((world.__ncCleanups || []).some((c) => c.key === key)) return;
  const client = await api(world, handle);
  const top = new Set((await davNames(client, '')) || []);
  const trash = new Set((await trashEntries(world, client)).map((e) => e.entry));
  const shares = await client.ocs('GET', '/apps/files_sharing/api/v1/shares');
  const shareIds = new Set((Array.isArray(shares.data) ? shares.data : []).map((s) => String(s.id)));
  afterScenario(world, key, async () => {
    const nowShares = await client.ocs('GET', '/apps/files_sharing/api/v1/shares');
    for (const s of Array.isArray(nowShares.data) ? nowShares.data : []) {
      if (!shareIds.has(String(s.id))) await client.ocs('DELETE', `/apps/files_sharing/api/v1/shares/${s.id}`);
    }
    for (const name of (await davNames(client, '')) || []) {
      if (!top.has(name)) await deleteItem(client, name);
    }
    for (const e of await trashEntries(world, client)) {
      if (!trash.has(e.entry)) await client.davRaw('DELETE', e.url);
    }
  });
}

/** The file id of an item of an account's files, or null. */
async function davFileId(client, filePath) {
  const res = await client.dav('PROPFIND', filePath, { headers: { Depth: '0', 'Content-Type': 'application/xml' }, data: '<?xml version="1.0"?><d:propfind xmlns:d="DAV:" xmlns:oc="http://owncloud.org/ns"><d:prop><oc:fileid/></d:prop></d:propfind>' });
  if (res.status() !== 207) return null;
  const match = (await res.text()).match(/<oc:fileid>(\d+)<\/oc:fileid>/);
  return match ? match[1] : null;
}

/**
 * Delete an item of an account's files. A document a scenario left open in the text editor (a scenario that failed
 * before it closed the viewer) keeps the editor's lock after the browser is gone, and the server refuses to delete it
 * (423 Locked): the owner of the file takes the lock off with the lock app's API, then deletes it.
 */
async function deleteItem(client, filePath) {
  let res = await client.dav('DELETE', filePath);
  if (res.status() === 423) {
    const fileId = await davFileId(client, filePath);
    if (fileId) await client.ocs('DELETE', `/apps/files_lock/lock/${fileId}`);
    res = await client.dav('DELETE', filePath);
  }
  if (res.status() >= 400 && res.status() !== 404) throw new Error(`DELETE ${filePath} answered ${res.status()}`);
}

/** Note that the scenario gave an account a password: later steps of the scenario use it; the clean-up gives back the registry's. */
function passwordChanged(world, handle, password) {
  world.__ncPasswords = world.__ncPasswords || {};
  world.__ncPasswords[handle] = password;
  dropSession(world, resolveUser(world, handle).username);
}

/** After the scenario, give an account back the registry's password (through the data administrator). */
function restorePasswordAfter(world, handle) {
  if (!cleansUp(world)) return;
  const account = resolveUser(world, handle);
  afterScenario(world, `password:${handle}`, async () => {
    const admin = await adminApi(world);
    const res = await admin.ocs('PUT', `/cloud/users/${encodeURIComponent(account.username)}`, { key: 'password', value: account.configuredPassword });
    if (!res.ok) throw new Error(`the password of ${account.username} could not be put back: ${res.status} ${res.message}`);
    dropSession(world, account.username);
    if (world.__ncPasswords) delete world.__ncPasswords[handle];
  });
}

/** The account the browser is logged in as in this scenario, as a handle of the registry; a step that needs one fails without. */
function currentHandle(world, what) {
  if (world.__ncUser) return world.__ncUser;
  throw friendly({
    message: `${what || 'This step'} works as the account the browser is logged in as, and no account of the users registry logged in in this scenario.`,
    hint: 'Start the scenario with "Given I am a logged in user with the "user" user" (or log in with the login form first).',
  });
}

// ---------------------------------------------------------------------------
// Fixtures: the files a scenario uploads
// ---------------------------------------------------------------------------

const PACK_FIXTURES = path.resolve(__dirname, '..', 'fixtures');

/** The file a scenario names: in the project's tests/assets/ or tests/fixtures/, by its path from the project, or one of this pack's fixtures. */
function fixture(world, name) {
  const file = String(name || '').trim();
  const tried = path.isAbsolute(file) ? [file] : [...new Set([
    path.resolve((world && world.assetsFolder) || path.join(process.cwd(), 'tests', 'assets'), file),
    path.resolve(process.cwd(), 'tests', 'fixtures', file),
    path.resolve(process.cwd(), file),
    path.resolve(PACK_FIXTURES, file),
  ])];
  const found = tried.find((candidate) => { try { return fs.statSync(candidate).isFile(); } catch { return false; } });
  if (found) return found;
  throw friendly({
    message: `The file "${file}" was not found: nothing at ${tried.map((c) => path.relative(process.cwd(), c) || c).join(', ')}.`,
    hint: `Put it in tests/assets/ of the project, or name one of the pack's own files: ${fs.existsSync(PACK_FIXTURES) ? fs.readdirSync(PACK_FIXTURES).join(', ') : '(none)'}.`,
  });
}

// ---------------------------------------------------------------------------
// The mailbox: the mail catcher of the site (Mailpit)
// ---------------------------------------------------------------------------

/** The address of the mail catcher (`worldParameters.mailUrl`), without a trailing slash. */
function mailUrl(world) {
  const url = world.parameters && world.parameters.mailUrl;
  if (!url) throw friendly({ message: 'No mailbox is configured.', hint: 'Set worldParameters.mailUrl in cucumber.js to the mail catcher (Mailpit) the site sends its mail to, for example https://your-project.ddev.site:8026.' });
  return String(url).replace(/\/+$/, '');
}

let MAIL_CONTEXT = null;

async function mailContext() {
  if (!MAIL_CONTEXT) MAIL_CONTEXT = await playwrightRequest.newContext({ ignoreHTTPSErrors: true });
  return MAIL_CONTEXT;
}

/** The messages of the mailbox to an address, newest first, as Mailpit lists them: [{ ID, Subject, Created, To }]. */
async function mailTo(world, address) {
  const ctx = await mailContext();
  const res = await ctx.get(`${mailUrl(world)}/api/v1/search?query=${encodeURIComponent(`to:"${address}"`)}&limit=50`, { failOnStatusCode: false });
  if (res.status() !== 200) throw friendly({ message: `The mail catcher at ${mailUrl(world)} answered ${res.status()}.`, hint: 'Check worldParameters.mailUrl in cucumber.js and that the mail catcher runs (ddev describe lists it).' });
  const json = await res.json();
  return (json.messages || []).filter((m) => (m.To || []).some((t) => same(t.Address, address)));
}

/** One message of the mailbox, whole: { Subject, Text, HTML, To, From }. */
async function mailMessage(world, id) {
  const ctx = await mailContext();
  return (await ctx.get(`${mailUrl(world)}/api/v1/message/${id}`)).json();
}

/** The links of a message: [{ text, href }], from its HTML (the words of the link) or its plain text. */
function mailLinks(message) {
  const links = [];
  for (const m of String(message.HTML || '').matchAll(/<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)) {
    links.push({ text: clean(m[2].replace(/<[^>]+>/g, ' ')), href: m[1].replace(/&amp;/g, '&') });
  }
  for (const m of String(message.Text || '').matchAll(/https?:\/\/\S+/g)) links.push({ text: m[0], href: m[0] });
  return links;
}

/** The mails that came to an address since the scenario began (or since `since`), newest first. */
async function mailSince(world, address, since) {
  const from = since || world.__ncScenarioStart || 0;
  return (await mailTo(world, address)).filter((m) => new Date(m.Created).getTime() >= from - 2000);
}

module.exports = {
  CUT_HINT,
  SESSIONS,
  addressOf,
  adminApi,
  afterScenario,
  answered,
  api,
  budget,
  clean,
  cleansUp,
  cssString,
  currentHandle,
  currentPath,
  cutRequest,
  davNames,
  displayNameOf,
  dropSession,
  eventually,
  expectToast,
  fail,
  fixture,
  forgetBrowser,
  handleOf,
  heading,
  instrument,
  keepSession,
  listed,
  mailLinks,
  mailMessage,
  mailSince,
  mailTo,
  mailUrl,
  mentions,
  navigating,
  newPassword,
  normal,
  onSite,
  open,
  pageSummary,
  pageWork,
  passwordChanged,
  ready,
  resolveUser,
  restorePasswordAfter,
  reusesSessions,
  runCleanups,
  same,
  sessionKey,
  settled,
  signedInAs,
  siteCookies,
  siteRoot,
  siteUrl,
  toasts,
  trackFiles,
  trashEntries,
};
