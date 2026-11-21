'use strict';

// The header and the dashboard: the apps menu and the app on screen, the user menu (what it offers, an entry
// chosen), the online status, the server's error pages, and the dashboard (its greeting, its widgets, a widget
// added or removed with "Customize"). What a scenario changes (the layout of the dashboard, the status) is put back
// after it.

const { When, Then } = require('@cucumber/cucumber');
const h = require('./nextcloud-helpers');

/** Make sure an app page of the site is on screen (the header is on every one). */
async function onAppPage(world) {
  if (!h.onSite(world, world.page.url()) || /^\/login/.test(h.currentPath(world))) await h.open(world, '/');
  if (!(await world.page.locator('header#header, header').first().isVisible().catch(() => false))) {
    throw h.fail(world, `The page has no header of the apps: ${await h.pageSummary(world)}.`, 'Log in first ("Given I am a logged in user with the "user" user").');
  }
}

/**
 * Open a header menu with its trigger and wait until it is open: the trigger says so (aria-expanded) and the menu
 * shows its entries. A menu that is closing (its fade after Escape) is waited out first, so a click never closes it.
 */
async function openHeaderMenu(world, trigger, menu, entries) {
  const page = world.page;
  const expanded = async () => (await trigger.getAttribute('aria-expanded').catch(() => null)) === 'true';
  if (!(await expanded())) {
    await menu.waitFor({ state: 'hidden', timeout: h.budget(world) }).catch(() => {});
    await trigger.click();
  }
  await h.eventually(world, async () => (await expanded()) && (await entries.first().isVisible().catch(() => false)), Boolean, async () => ({
    message: 'The menu of the header did not open.',
    hint: 'A menu of the header opens when its button is clicked, and lists its entries.',
  }));
}

/** Close a header menu with Escape and wait until it is closed (its trigger says so and the menu is gone). */
async function closeHeaderMenu(world, trigger, menu) {
  await world.page.keyboard.press('Escape').catch(() => {});
  await h.eventually(world, async () => (await trigger.getAttribute('aria-expanded').catch(() => null)) !== 'true' && !(await menu.isVisible().catch(() => false)), Boolean, async () => ({
    message: 'The menu of the header did not close.',
    hint: 'A menu of the header closes with Escape.',
  })).catch(() => {});
}

/** The apps menu and its trigger. */
function appsMenuParts(page) {
  const trigger = page.getByRole('button', { name: 'Open apps menu', exact: true }).first();
  const menu = page.getByRole('menu', { name: 'Apps' }).first();
  return { trigger, menu, items: menu.getByRole('menuitem') };
}

/** The entries of the apps menu, as a person reads them (opened when it is not). */
async function appsMenu(world) {
  const { trigger, menu, items } = appsMenuParts(world.page);
  await openHeaderMenu(world, trigger, menu, items);
  return { menu, trigger, entries: await items.allInnerTexts().catch(() => []) };
}

/** The user menu and its trigger. */
function userMenuParts(page) {
  const trigger = page.getByRole('button', { name: 'Settings menu', exact: true }).or(page.locator('#user-menu button.header-menu__trigger')).first();
  const menu = page.locator('#header-menu-user-menu').first();
  return { trigger, menu, items: menu.locator('li a') };
}

/** The entries of the user menu, as a person reads them (opened when it is not). */
async function userMenu(world) {
  const { trigger, menu, items } = userMenuParts(world.page);
  await openHeaderMenu(world, trigger, menu, items);
  const entries = await items.evaluateAll((links) => links.map((a) => a.innerText.replace(/\s+/g, ' ').trim())).catch(() => []);
  return { menu, trigger, entries };
}

/**
 * Open an app with the apps menu of the header, as a person does: the menu opened, the app chosen; the step waits
 * for the app's page.
 *
 * Example #1: When I open the "Files" app
 * Example #2: When I open the "Activity" app
 * Example #3: When I open the "Dashboard" app
 * Example #4: When we open the "Photos" app
 * Example #5: And I open the "Files" app
 */
When(/^(?:I|we) open the "([^"]*)" app$/, async function (app) {
  await onAppPage(this);
  const { menu, trigger, entries } = await appsMenu(this);
  const item = menu.getByRole('menuitem', { name: app, exact: true }).first();
  if (!(await item.isVisible().catch(() => false))) {
    await closeHeaderMenu(this, trigger, menu);
    throw h.fail(this, `The apps menu has no "${app}". It lists ${h.listed(entries)}.`, 'The apps menu lists the apps the account may use.');
  }
  await h.navigating(this, () => item.click());
});

/**
 * The app on screen is the one named: the header says it ("Open apps menu, currently in Files").
 *
 * Example #1: Then I should be in the "Files" app
 * Example #2: Then I should be in the "Dashboard" app
 * Example #3: Then we should be in the "Activity" app
 * Example #4: And I should be in the "Files" app
 * Example #5: Then I should be in the "Files" app
 *               And the file list should show "meeting-notes.md"
 */
Then(/^(?:I|we) should be in the "([^"]*)" app$/, async function (app) {
  const page = this.page;
  const read = async () => h.clean(await page.locator('button.app-menu__current-app, [aria-label^="Open apps menu, currently in"]').first().getAttribute('aria-label').catch(() => '') || '');
  await h.eventually(this, read, (label) => h.same(label.replace(/^Open apps menu, currently in\s*/i, ''), app), async (label) => ({ message: `The app on screen is not "${app}": the header says "${label || '(nothing)'}" (${h.currentPath(this)}).`, hint: 'Open the app first ("When I open the "…" app").' }));
});

/**
 * The apps menu of the header lists an app — or does not.
 *
 * Example #1: Then the apps menu should list "Files"
 * Example #2: Then the apps menu should list "Activity"
 * Example #3: Then the apps menu should not list "Mail"
 * Example #4: And the apps menu should list "Photos"
 * Example #5: But the apps menu should not list "Calendar"
 */
Then(/^the apps menu should( not)? list "([^"]*)"$/, async function (not, app) {
  await onAppPage(this);
  const { menu, trigger, entries } = await appsMenu(this);
  await closeHeaderMenu(this, trigger, menu);
  const has = entries.some((e) => h.same(e, app));
  if (has === !!not) throw h.fail(this, not ? `The apps menu lists "${app}".` : `The apps menu does not list "${app}". It lists ${h.listed(entries)}.`, 'The apps menu lists the apps the account may use.');
});

/**
 * The user menu of the header offers an entry (Settings, Accounts, Administration settings, Log out…) — or does
 * not. An administrator's menu offers more than an account's.
 *
 * Example #1: Then the user menu should offer "Accounts"
 * Example #2: Then the user menu should offer "Administration settings"
 * Example #3: Then the user menu should not offer "Accounts"
 * Example #4: And the user menu should offer "Log out"
 * Example #5: But the user menu should not offer "Administration settings"
 */
Then(/^the user menu should( not)? offer "([^"]*)"$/, async function (not, entry) {
  await onAppPage(this);
  const { menu, trigger, entries } = await userMenu(this);
  await closeHeaderMenu(this, trigger, menu);
  const has = entries.some((e) => h.same(e, entry));
  if (has === !!not) throw h.fail(this, not ? `The user menu offers "${entry}".` : `The user menu does not offer "${entry}". It offers ${h.listed(entries)}.`, 'The entries of the user menu depend on the account (an administrator has more).');
});

/**
 * Choose an entry of the user menu of the header (Settings, Appearance and accessibility, Accounts…); the step
 * waits for its page.
 *
 * Example #1: When I choose "Settings" in the user menu
 * Example #2: When I choose "Accounts" in the user menu
 * Example #3: When I choose "Appearance and accessibility" in the user menu
 * Example #4: When we choose "Personal settings" in the user menu
 * Example #5: And I choose "Help & privacy" in the user menu
 */
When(/^(?:I|we) choose "([^"]*)" in the user menu$/, async function (entry) {
  await onAppPage(this);
  const { menu, trigger, entries } = await userMenu(this);
  const link = menu.locator('li a').filter({ hasText: entry }).first();
  if (!entries.some((e) => h.same(e, entry)) || !(await link.isVisible().catch(() => false))) {
    await closeHeaderMenu(this, trigger, menu);
    throw h.fail(this, `The user menu has no "${entry}". It offers ${h.listed(entries)}.`, 'The entries of the user menu depend on the account (an administrator has more).');
  }
  await h.navigating(this, () => link.click());
});

/** The status entry of the user menu (its words are the status, or "Set status"). */
async function statusEntry(world) {
  const { menu } = await userMenu(world);
  return menu.locator('li[class*="userStatusMenuItem"] a, li:has([class*="user-status-icon"]) a').first();
}

/**
 * Set the account's online status (Online, Away, Busy, Do not disturb, Invisible) with the status entry of the user
 * menu and its "Online status" dialog. The status the account had is put back after the scenario.
 *
 * Example #1: When I set my status to "Away"
 * Example #2: When I set my status to "Do not disturb"
 * Example #3: When I set my status to "Online"
 * Example #4: When we set my status to "Busy"
 * Example #5: And I set my status to "Invisible"
 */
When(/^(?:I|we) set my status to "([^"]*)"$/, async function (status) {
  const page = this.page;
  await onAppPage(this);
  const handle = h.currentHandle(this, 'Setting the status');
  if (h.cleansUp(this)) {
    const client = await h.api(this, handle);
    const now = await client.ocs('GET', '/apps/user_status/api/v1/user_status');
    const before = (now.ok && now.data && now.data.status) || 'online';
    h.afterScenario(this, `status:${handle}`, async () => { await client.ocs('PUT', '/apps/user_status/api/v1/user_status/status', { statusType: before }); });
  }
  const entry = await statusEntry(this);
  await entry.click();
  const dialog = page.getByRole('dialog', { name: 'Online status' }).first();
  await dialog.waitFor({ state: 'visible', timeout: h.budget(this) });
  const choice = dialog.getByRole('radiogroup', { name: 'Online status' }).getByText(status, { exact: true }).first();
  if (!(await choice.isVisible().catch(() => false))) {
    const offered = await dialog.getByRole('radio').evaluateAll((rs) => rs.map((r) => r.getAttribute('aria-label') || r.value));
    throw h.fail(this, `The online status dialog offers no "${status}". It offers ${h.listed(offered)}.`, 'The statuses are Online, Away, Busy, Do not disturb and Invisible.');
  }
  await h.answered(this, 'PUT .*\\/apps\\/user_status\\/api\\/v1\\/user_status\\/status', () => choice.click(), { what: 'set the status' });
  await dialog.getByRole('button', { name: 'Close', exact: true }).first().click().catch(() => {});
  await dialog.waitFor({ state: 'hidden', timeout: h.budget(this) }).catch(() => {});
});

/**
 * The account's online status is the one named, as the header says it to a screen reader ("Avatar of User — Away").
 *
 * Example #1: Then my status should be "Away"
 * Example #2: Then my status should be "Online"
 * Example #3: And my status should be "Do not disturb"
 * Example #4: Then my status should be "Away"
 *               When I set my status to "Online"
 * Example #5: Then my status should be "Busy"
 */
Then(/^my status should be "([^"]*)"$/, async function (status) {
  await onAppPage(this);
  const read = async () => h.clean(await this.page.locator('header .header-menu__description, #user-menu .header-menu__description').first().textContent({ timeout: 500 }).catch(() => ''));
  await h.eventually(this, read, (t) => h.same(t.split('—').pop(), status), async (t) => ({ message: `The status is not "${status}": the header says "${t}".`, hint: 'Set it first ("When I set my status to "…"").' }));
});

/**
 * The server shows one of its error pages, by its heading: "Access forbidden" (a page the account may not open),
 * "Page not found".
 *
 * Example #1: Then I should see the error page "Access forbidden"
 * Example #2: Then I should see the error page "Page not found"
 * Example #3: Then we should see the error page "Access forbidden"
 * Example #4: Then I should see the error page "Access forbidden"
 *               And I should be logged in as "user"
 * Example #5: And I should see the error page "Page not found"
 */
Then(/^(?:I|we) should see the error page "([^"]*)"$/, async function (title) {
  const page = this.page;
  const read = async () => h.clean(await page.locator('.guest-box h2, .body-login-container h2, main h2, h2').first().innerText({ timeout: 500 }).catch(() => ''));
  await h.eventually(this, read, (t) => h.same(t, title), async (t) => ({ message: `The site does not show the error page "${title}": ${t ? `it shows "${t}"` : await h.pageSummary(this)}.`, hint: 'An error page has its heading and a link back to the site.' }));
});

/**
 * Go to the dashboard of the account.
 *
 * Example #1: When I go to the dashboard
 * Example #2: When we go to the dashboard
 * Example #3: And I go to the dashboard
 * Example #4: When I go to the dashboard
 *               Then the dashboard should greet "User"
 * Example #5: When I go to the dashboard
 *               Then the dashboard should greet "User"
 */
When(/^(?:I|we) go to the dashboard$/, async function () {
  await h.open(this, '/apps/dashboard/');
  await h.eventually(this, () => this.page.locator('main h2').first().isVisible().catch(() => false), Boolean, async () => ({ message: `The dashboard did not open: ${await h.pageSummary(this)}.`, hint: 'Log in first: the dashboard is the start page of an account.' }));
});

/**
 * The dashboard greets the account by its name ("Good morning, User": the time of day changes, the name does not).
 *
 * Example #1: Then the dashboard should greet "User"
 * Example #2: Then the dashboard should greet "Editor"
 * Example #3: Then the dashboard should greet "Administrator"
 * Example #4: And the dashboard should greet "User"
 * Example #5: Then the dashboard should greet "Editor"
 *               And the dashboard should show the "Recommended files" widget
 */
Then(/^the dashboard should greet "([^"]*)"$/, async function (name) {
  const read = async () => h.clean(await this.page.locator('main h2').first().innerText({ timeout: 500 }).catch(() => ''));
  await h.eventually(this, read, (t) => /^(good|hello|hi)\b/i.test(t) && h.mentions(t, name), async (t) => ({ message: `The dashboard does not greet "${name}": it says "${t}".`, hint: 'The greeting names the display name of the account ("Good morning, User").' }));
});

/** The widgets the dashboard shows, by their titles. */
async function widgets(page) {
  return page.locator('main .panel .panel--header h2').allInnerTexts().then((all) => all.map((t) => h.clean(t))).catch(() => []);
}

/**
 * The dashboard shows a widget (by its title) — or does not.
 *
 * Example #1: Then the dashboard should show the "Recommended files" widget
 * Example #2: Then the dashboard should show the "Favorite files" widget
 * Example #3: Then the dashboard should not show the "Favorite files" widget
 * Example #4: And the dashboard should show the "Recent activity" widget
 * Example #5: But the dashboard should not show the "Recent activity" widget
 */
Then(/^the dashboard should( not)? show the "([^"]*)" widget$/, async function (not, widget) {
  await h.eventually(this, () => widgets(this.page), (list) => list.some((w) => h.same(w, widget)) === !not, async (list) => ({
    message: not ? `The dashboard shows the "${widget}" widget.` : `The dashboard does not show the "${widget}" widget. It shows ${h.listed(list)}.`,
    hint: 'Widgets are added and removed with "Customize" at the bottom of the dashboard.',
  }));
});

/** Tick or untick a widget in the "Edit widgets" dialog of "Customize", then close it; the layout is put back after the scenario. */
async function customize(world, widget, wanted) {
  const page = world.page;
  const handle = h.currentHandle(world, 'Changing the dashboard');
  if (h.cleansUp(world)) {
    const client = await h.api(world, handle);
    const now = await client.ocs('GET', '/apps/dashboard/api/v3/layout');
    const layout = now.ok && now.data && Array.isArray(now.data.layout) ? now.data.layout : null;
    if (layout) h.afterScenario(world, `dashboard:${handle}`, async () => { await client.ocsJson('POST', '/apps/dashboard/api/v3/layout', { layout }); });
  }
  if (!/\/apps\/dashboard/.test(h.currentPath(world))) await h.open(world, '/apps/dashboard/');
  await page.getByRole('button', { name: 'Customize', exact: true }).first().click();
  const dialog = page.getByRole('dialog').filter({ has: page.getByRole('heading', { name: 'Edit widgets' }) }).first();
  await dialog.waitFor({ state: 'visible', timeout: h.budget(world) });
  const box = dialog.getByRole('checkbox', { name: widget, exact: true }).first();
  if (!(await box.count())) {
    const offered = await dialog.getByRole('checkbox').evaluateAll((bs) => bs.map((b) => (b.labels && b.labels[0] ? b.labels[0].innerText : b.id).trim()));
    await dialog.getByRole('button', { name: 'Close', exact: true }).first().click().catch(() => {});
    throw h.fail(world, `The dashboard has no widget "${widget}" to choose. It offers ${h.listed(offered)}.`, 'The widgets come from the apps of the server.');
  }
  if ((await box.isChecked()) !== wanted) {
    const id = await box.getAttribute('id');
    await h.answered(world, 'POST .*\\/apps\\/dashboard\\/api\\/v3\\/layout', () => dialog.locator(`label[for=${h.cssString(id)}]`).first().click(), { what: 'save the layout of the dashboard' });
  }
  await dialog.getByRole('button', { name: 'Close', exact: true }).first().click();
  await dialog.waitFor({ state: 'hidden', timeout: h.budget(world) }).catch(() => {});
  await h.ready(world);
}

/**
 * Add a widget to the dashboard, or remove one, as a person does: "Customize", the widget ticked or unticked,
 * "Close". The step waits for the server to save the layout; the layout the account had is put back after the
 * scenario.
 *
 * Example #1: When I add the "Favorite files" widget to the dashboard
 * Example #2: When I add the "Recent activity" widget to the dashboard
 * Example #3: When I remove the "Recommended files" widget from the dashboard
 * Example #4: When we add the "Favorite files" widget to the dashboard
 * Example #5: When I remove the "Favorite files" widget from the dashboard
 */
When(/^(?:I|we) (add|remove) the "([^"]*)" widget (?:to|from) the dashboard$/, async function (verb, widget) {
  await customize(this, widget, verb === 'add');
});

/**
 * A widget of the dashboard lists an item (a file, an activity) — or, with "say", shows a note ("No favorites").
 *
 * Example #1: Then the "Favorite files" widget should list "meeting-notes.md"
 * Example #2: Then the "Favorite files" widget should say "No favorites"
 * Example #3: Then the "Recent activity" widget should list "meeting-notes.md"
 * Example #4: And the "Recommended files" widget should say "No recommendations yet"
 * Example #5: Then the "Favorite files" widget should list "Project files"
 */
Then(/^the "([^"]*)" widget should (list|say) "([^"]*)"$/, async function (widget, verb, text) {
  const page = this.page;
  const panel = page.locator('main .panel').filter({ has: page.locator('.panel--header h2').filter({ hasText: widget }) }).first();
  if (!(await panel.isVisible().catch(() => false))) throw h.fail(this, `The dashboard shows no "${widget}" widget. It shows ${h.listed(await widgets(page))}.`, 'Add it first ("When I add the "…" widget to the dashboard").');
  const read = async () => (verb === 'list'
    ? panel.locator('.panel--content li').allInnerTexts().then((all) => all.map((t) => h.clean(t))).catch(() => [])
    : [h.clean(await panel.locator('.panel--content [role="note"], .panel--content .empty-content').first().innerText({ timeout: 500 }).catch(() => ''))]);
  await h.eventually(this, read, (list) => list.some((t) => h.mentions(t, text)), async (list) => ({ message: `The "${widget}" widget does not ${verb} "${text}". It shows ${h.listed(list)}.`, hint: 'A widget loads its items from the server after the dashboard opened.' }));
});

module.exports = { onAppPage, userMenu };
