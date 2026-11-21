'use strict';

// Sharing, in the Sharing tab of a file's details: with an account of the site (its permission chosen), a public
// link with a password and an expiration date, and the public link opened as a visitor in a browser of its own,
// with the password page and its refusal. The shares a scenario makes are removed after it.

const { When, Then } = require('@cucumber/cucumber');
const h = require('./nextcloud-helpers');
const files = require('./nextcloud-files.steps');

// The Sharing tab is a custom element whose `shadowRoot` is the element itself: a query that pierces shadow roots
// (CSS, text and role locators) can run into it without end ("Maximum call stack size exceeded"). Inside the tab,
// and in its search dropdown, the steps find elements with XPath (which stays in the light tree) and read them
// with the page's own DOM.
const TAB = '//*[@id="tab-sharing"]';

/** An element by XPath (the first one). */
function x(page, xpath) {
  return page.locator(`xpath=${xpath}`).first();
}

/** The clickable part of a checkbox or radio of the Sharing tab, by its words (the component has no <label>). */
function switchXpath(words) {
  return `${TAB}//*[contains(@class, "checkbox-radio-switch__content")][.//*[contains(@class, "checkbox-radio-switch__text")][normalize-space(.)=${xs(words)}]]`;
}

/** The checkboxes and radios of the Sharing tab: [{ words, type, checked }]. */
async function switches(page) {
  return page.evaluate(() => [...document.querySelectorAll('#tab-sharing .checkbox-radio-switch')].map((w) => {
    const input = w.querySelector('input');
    const text = w.querySelector('.checkbox-radio-switch__text');
    return { words: text ? text.textContent.replace(/\s+/g, ' ').trim() : '', type: input ? input.type : '', checked: input ? input.checked : false };
  })).catch(() => []);
}

/** A text as an XPath string literal. */
function xs(text) {
  const t = String(text);
  if (!t.includes('"')) return `"${t}"`;
  if (!t.includes("'")) return `'${t}'`;
  return `concat("${t.split('"').join('", \'"\', "')}")`;
}

/** The name the details sidebar shows, from the page's DOM. */
async function sidebarName(page) {
  return h.clean(await page.evaluate(() => { const a = document.querySelector('aside#app-sidebar-vue, aside.app-sidebar'); const t = a && a.getClientRects().length ? a.querySelector('h2') : null; return t ? t.textContent : ''; }).catch(() => ''));
}

/** The Sharing tab of a file of the list: its details opened (unless they show it already), then the tab. */
async function sharingTab(world, name) {
  const page = world.page;
  if (!h.same(await sidebarName(page), name)) {
    const item = await files.rowAction(world, name, 'Details', 'details');
    await item.click();
    await h.eventually(world, () => sidebarName(page), (t) => h.same(t, name), async (t) => ({ message: `The details of "${name}" did not open${t ? `: the sidebar shows "${t}"` : ''}.`, hint: 'The details open in a sidebar at the right of the list.' }));
  }
  const selected = await page.evaluate(() => { const b = document.getElementById('tab-button-sharing'); return b ? b.getAttribute('aria-selected') : null; });
  if (selected === null) throw h.fail(world, `The details of "${name}" have no Sharing tab.`, 'The Sharing tab comes with the sharing app of the server.');
  if (selected !== 'true') await x(page, '//*[@id="tab-button-sharing"]').click();
  await h.eventually(world, () => page.evaluate(() => { const t = document.getElementById('tab-sharing'); return !!t && t.getClientRects().length > 0 && !!t.querySelector('.sharing-entry, input'); }), Boolean, async () => ({ message: `The Sharing tab of "${name}" did not show.`, hint: 'The tab loads the shares of the file from the server.' }));
  await h.ready(world);
}

/** The entries of the internal shares of the Sharing tab, as a person reads them: "Editor View only". */
async function internalShares(page) {
  return page.evaluate(() => [...document.querySelectorAll('#tab-sharing .sharing-entry')]
    .filter((e) => !/sharing-entry__(link|inherited|internal)/.test(e.className))
    .map((e) => e.innerText.replace(/\s+/g, ' ').trim())).catch(() => []);
}

/** The public link of the Sharing tab: { href, expiry } (the expiry button's words), or null when there is none. */
async function publicLink(page) {
  return page.evaluate(() => {
    for (const e of document.querySelectorAll('#tab-sharing .sharing-entry__link')) {
      const a = e.querySelector('a[href*="/s/"]');
      if (!a) continue;
      const expiry = e.querySelector('[aria-label^="Share expiration"]');
      return { href: a.getAttribute('href'), expiry: expiry ? expiry.getAttribute('aria-label') : '' };
    }
    return null;
  }).catch(() => null);
}

/** The date `days` from today, as the date field takes it (YYYY-MM-DD, the browser's own day). */
function dayFromToday(days) {
  const d = new Date();
  d.setDate(d.getDate() + Number(days));
  return { iso: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`, y: d.getFullYear(), m: d.getMonth(), d: d.getDate() };
}

/** Open the details of the public link (its actions, "Customize link") with its advanced settings shown. */
async function linkSettings(world, name) {
  const page = world.page;
  await sharingTab(world, name);
  if (!(await publicLink(page))) throw h.fail(world, `"${name}" has no public link.`, 'Make one first ("When I create a public link for "…"").');
  await x(page, `${TAB}//li[contains(@class, "sharing-entry__link")][.//a[contains(@href, "/s/")]]//button[starts-with(@aria-label, "Actions for")]`).click();
  await x(page, '//*[@role="menuitem"][normalize-space(.)="Customize link"]').click();
  const advanced = x(page, `${TAB}//button[normalize-space(.)="Advanced settings"]`);
  await advanced.waitFor({ state: 'visible', timeout: h.budget(world) });
  if ((await advanced.getAttribute('aria-expanded')) !== 'true') await advanced.click();
  await h.eventually(world, async () => (await switches(page)).some((w) => w.words === 'Set password'), Boolean, async () => ({ message: `The advanced settings of the public link of "${name}" did not open.`, hint: 'They open under "Advanced settings" in the details of the link.' }));
}

/** Tick a checkbox of the Sharing tab by its words (its input is hidden: the label is what a person clicks). */
async function tick(world, words) {
  const page = world.page;
  const found = (await switches(page)).find((w) => w.words === words);
  if (!found) throw h.fail(world, `The share has no setting "${words}". It has ${h.listed((await switches(page)).map((w) => w.words))}.`, 'The settings of a share are under "Advanced settings" in its details.');
  if (!found.checked) {
    await x(page, switchXpath(words)).click();
    await h.eventually(world, async () => (await switches(page)).find((w) => w.words === words), (w) => w && w.checked, async () => ({ message: `"${words}" did not tick.`, hint: 'A setting of the share ticks when its words are clicked.' }));
  }
}

/** Save the details of a share ("Update share" or "Save share") and wait for the server. */
async function saveShare(world, words) {
  const button = x(world.page, `${TAB}//button[normalize-space(.)=${xs(words)}]`);
  await h.answered(world, '(?:POST|PUT) .*\\/apps\\/files_sharing\\/api\\/v1\\/shares', () => button.click(), { what: 'save the share' });
}

/**
 * Share a file or folder of the list with an account of the site (a handle of the users registry), as a person
 * does in the Sharing tab of its details: the account searched, chosen, its permission ("View only", "Allow
 * editing", or the server's default when none is given), "Save share". The share is removed after the scenario.
 *
 * Example #1: When I share "meeting-notes.md" with "editor"
 * Example #2: When I share "meeting-notes.md" with "editor" as "View only"
 * Example #3: When I share "Project files" with "editor" as "Allow editing"
 * Example #4: When we share "team-photo.png" with "user"
 * Example #5: When I share "budget.txt" with "administrator" as "View only"
 */
When(/^(?:I|we) share "([^"]*)" with "([^"]*)"(?: as "([^"]*)")?$/, async function (name, handle, permission) {
  const page = this.page;
  const recipient = h.resolveUser(this, handle);
  await files.changingFiles(this, 'Sharing a file');
  await sharingTab(this, name);
  const box = x(page, `${TAB}//input[@role="combobox"][@id=//label[normalize-space(.)="Search for internal recipients"]/@for]`).or(x(page, `${TAB}//input[contains(@class, "vs__search")]`)).first();
  await box.click();
  const found = page.waitForResponse((r) => /\/files_sharing\/api\/v1\/sharees\?/.test(r.url()) && decodeURIComponent(r.url()).includes(`search=${recipient.username}`), { timeout: h.budget(this) }).catch(() => null);
  // Typed as a person types: the search box asks the server as the words come.
  await box.pressSequentially(recipient.username, { delay: 40 });
  await found;
  await h.ready(this);
  const options = () => page.evaluate(() => [...document.querySelectorAll('[role="listbox"] [role="option"]')].filter((o) => o.getClientRects().length).map((o) => o.innerText.replace(/\s+/g, ' ').trim())).catch(() => []);
  const wanted = (t) => new RegExp(`(^|\\s)${recipient.username.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(@|\\s|$)`).test(t) || (recipient.email && h.mentions(t, recipient.email));
  const offered = await h.eventually(this, options, (list) => list.some(wanted), async (list) => {
    await page.keyboard.press('Escape').catch(() => {});
    return { message: `The search for "${recipient.username}" offers no such account to share with. It offers ${h.listed(list)}.`, hint: 'The account is made by the build of the site; check its username in worldParameters.users of cucumber.js.' };
  });
  const index = offered.findIndex(wanted);
  await x(page, `(//*[@role="listbox"]//*[@role="option"])[${index + 1}]`).click();
  const save = x(page, `${TAB}//button[normalize-space(.)="Save share"]`);
  await save.waitFor({ state: 'visible', timeout: h.budget(this) });
  if (permission) {
    const radios = (await switches(page)).filter((w) => w.type === 'radio');
    const choice = radios.find((w) => h.same(w.words, permission));
    if (!choice) {
      throw h.fail(this, `The share of "${name}" offers no permission "${permission}". It offers ${h.listed(radios.map((w) => w.words))}.`, 'The permissions a share offers depend on the file and on the server\'s sharing settings.');
    }
    await x(page, switchXpath(choice.words)).click();
    await h.eventually(this, async () => (await switches(page)).find((w) => w.words === choice.words), (w) => w && w.checked, async () => ({ message: `The permission "${permission}" did not take.`, hint: 'A permission of the share is chosen with a click on its words.' }));
  }
  await saveShare(this, 'Save share');
  const displayName = await h.displayNameOf(this, handle);
  await h.eventually(this, () => internalShares(page), (list) => list.some((e) => h.mentions(e, displayName)), async (list) => ({ message: `"${name}" is not shared with ${displayName} after "Save share". The shares are ${h.listed(list)}.`, hint: 'Look at the screenshot of the failure for a message of the server.' }));
});

/**
 * The Sharing tab of a file or folder of the list shows a share with an account (by its display name) — or does
 * not; with a permission given, the share has it ("View only", "Can edit").
 *
 * Example #1: Then "meeting-notes.md" should be shared with "editor"
 * Example #2: Then "meeting-notes.md" should be shared with "editor" as "View only"
 * Example #3: Then "meeting-notes.md" should not be shared with "editor"
 * Example #4: And "Project files" should be shared with "user" as "Can edit"
 * Example #5: Then "team-photo.png" should not be shared with "administrator"
 */
Then(/^"([^"]*)" should( not)? be shared with "([^"]*)"(?: as "([^"]*)")?$/, async function (name, not, handle, permission) {
  await sharingTab(this, name);
  const displayName = await h.displayNameOf(this, handle);
  const wanted = (list) => list.some((e) => h.mentions(e, displayName) && (!permission || h.mentions(e, permission)));
  await h.eventually(this, () => internalShares(this.page), (list) => (not ? !wanted(list) : wanted(list)), async (list) => ({
    message: not ? `"${name}" is still shared with ${displayName}${permission ? ` as "${permission}"` : ''}.` : `"${name}" is not shared with ${displayName}${permission ? ` as "${permission}"` : ''}. The shares are ${h.listed(list)}.`,
    hint: 'The internal shares are listed under "Internal shares" in the Sharing tab of the details.',
  }));
});

/**
 * Make a public link for a file or folder of the list ("Create a new share link" in its Sharing tab); the step
 * waits for the server and for the link. The link is removed after the scenario.
 *
 * Example #1: When I create a public link for "team-photo.png"
 * Example #2: When I create a public link for "Project files"
 * Example #3: When we create a public link for "meeting-notes.md"
 * Example #4: And I create a public link for "annual-report.pdf"
 * Example #5: When I create a public link for "budget.txt"
 */
When(/^(?:I|we) create a public link for "([^"]*)"$/, async function (name) {
  await files.changingFiles(this, 'Making a public link');
  await sharingTab(this, name);
  if (await publicLink(this.page)) throw h.fail(this, `"${name}" has a public link already.`, 'The clean-up removes the links the scenarios make; a link left from an interrupted run can be removed in the Sharing tab.');
  const create = x(this.page, `${TAB}//button[@aria-label="Create a new share link"]`);
  if (!(await create.isVisible().catch(() => false))) throw h.fail(this, `The Sharing tab of "${name}" offers no "Create a new share link".`, 'Public links are turned on in the server\'s sharing settings, and the account may share the file.');
  await h.answered(this, 'POST .*\\/apps\\/files_sharing\\/api\\/v1\\/shares', () => create.click(), { what: 'make the link' });
  await h.eventually(this, () => publicLink(this.page), Boolean, async () => ({ message: `No public link of "${name}" shows after "Create a new share link".`, hint: 'A server that asks for a password for every link shows the password first: set it with "When I protect the public link of "…" with the password "…"".' }));
});

/**
 * Protect the public link of a file or folder with a password: its details ("Customize link"), "Set password", the
 * password, "Update share".
 *
 * Example #1: When I protect the public link of "team-photo.png" with the password "Webship-Share-2026"
 * Example #2: When I protect the public link of "Project files" with the password "Webship-Share-2026"
 * Example #3: When we protect the public link of "meeting-notes.md" with the password "Webship-Share-2026"
 * Example #4: And I protect the public link of "annual-report.pdf" with the password "Another-Share-2026"
 * Example #5: When I protect the public link of "budget.txt" with the password "Webship-Share-2026"
 */
When(/^(?:I|we) protect the public link of "([^"]*)" with the password "([^"]*)"$/, async function (name, password) {
  await linkSettings(this, name);
  await tick(this, 'Set password');
  const field = x(this.page, `${TAB}//input[@type="password"]`);
  await field.waitFor({ state: 'visible', timeout: h.budget(this) });
  await field.fill(password);
  await saveShare(this, 'Update share');
});

/**
 * Give the public link of a file or folder an expiration date a number of days from today: its details ("Customize
 * link"), "Set expiration date", the date, "Update share".
 *
 * Example #1: When I set the public link of "team-photo.png" to expire in 30 days
 * Example #2: When I set the public link of "Project files" to expire in 7 days
 * Example #3: When we set the public link of "meeting-notes.md" to expire in 30 days
 * Example #4: And I set the public link of "annual-report.pdf" to expire in 1 day
 * Example #5: When I set the public link of "budget.txt" to expire in 14 days
 */
When(/^(?:I|we) set the public link of "([^"]*)" to expire in (\d+) days?$/, async function (name, days) {
  await linkSettings(this, name);
  await tick(this, 'Set expiration date');
  const field = x(this.page, `${TAB}//input[@type="date"]`);
  await field.waitFor({ state: 'visible', timeout: h.budget(this) });
  await field.fill(dayFromToday(days).iso);
  await saveShare(this, 'Update share');
});

/**
 * The public link of a file or folder expires on the day a number of days from today: the date its entry shows
 * ("Share expiration: …"), as the browser writes that day.
 *
 * Example #1: Then the public link of "team-photo.png" should expire in 30 days
 * Example #2: Then the public link of "Project files" should expire in 7 days
 * Example #3: And the public link of "meeting-notes.md" should expire in 30 days
 * Example #4: Then the public link of "annual-report.pdf" should expire in 1 day
 * Example #5: Then the public link of "budget.txt" should expire in 14 days
 */
Then(/^the public link of "([^"]*)" should expire in (\d+) days?$/, async function (name, days) {
  await sharingTab(this, name);
  if (!(await publicLink(this.page))) throw h.fail(this, `"${name}" has no public link.`, 'Make one first ("When I create a public link for "…"").');
  const day = dayFromToday(days);
  const label = await h.eventually(this, async () => ((await publicLink(this.page)) || {}).expiry || '', Boolean, async () => ({ message: `The public link of "${name}" has no expiration date.`, hint: 'Set one with "When I set the public link of "…" to expire in … days".' }));
  const expected = await this.page.evaluate(({ y, m, d }) => new Date(y, m, d).toLocaleDateString(), day);
  if (!label.includes(expected)) throw h.fail(this, `The public link of "${name}" does not expire on ${expected} (${day.iso}): its entry says "${label}".`, 'The link expires at the end of the day it was given.');
});

/**
 * Open the public link of a file or folder as a visitor: the link's address read from its entry in the Sharing tab,
 * then a browser of its own with no cookie of the site (a person who got the link). The steps after it work in
 * that browser.
 *
 * Example #1: When I open the public link of "team-photo.png" as a visitor
 * Example #2: When I open the public link of "Project files" as a visitor
 * Example #3: When we open the public link of "meeting-notes.md" as a visitor
 * Example #4: And I open the public link of "annual-report.pdf" as a visitor
 * Example #5: When I open the public link of "budget.txt" as a visitor
 */
When(/^(?:I|we) open the public link of "([^"]*)" as a visitor$/, async function (name) {
  await sharingTab(this, name);
  const link = await publicLink(this.page);
  if (!link) throw h.fail(this, `"${name}" has no public link.`, 'Make one first ("When I create a public link for "…"").');
  const href = link.href;
  // A browser of its own: no cookie and no storage of the site.
  await this.replaceContext({ storageState: { cookies: [], origins: [] } });
  this.__ncUser = null;
  this.__ncPublicLink = href;
  await h.open(this, href);
});

/** Whether the public link's password page is on screen. */
async function onPasswordPage(world) {
  if (!/\/s\/[^/]+\/authenticate/.test(h.currentPath(world))) return false;
  return world.page.locator('input[type="password"]').first().isVisible().catch(() => false);
}

/**
 * The public link asks the visitor for its password (its page "This share is password-protected").
 *
 * Example #1: Then I should be asked for the password of the share
 * Example #2: Then we should be asked for the password of the share
 * Example #3: And I should be asked for the password of the share
 * Example #4: Then I should be asked for the password of the share
 *               When I enter the share password "Webship-Share-2026"
 * Example #5: Then I should be asked for the password of the share
 *               When I enter the share password "Webship-Share-2026"
 */
Then(/^(?:I|we) should be asked for the password of the share$/, async function () {
  await h.eventually(this, () => onPasswordPage(this), Boolean, async () => ({ message: `The public link does not ask for a password: ${await h.pageSummary(this)}.`, hint: 'A link with a password shows its password page first ("This share is password-protected").' }));
});

/**
 * Type a password on the public link's password page and send it.
 *
 * Example #1: When I enter the share password "Webship-Share-2026"
 * Example #2: When I enter the share password "Wrong-password-1"
 * Example #3: When we enter the share password "Webship-Share-2026"
 * Example #4: And I enter the share password "Another-Share-2026"
 * Example #5: When I enter the share password "Webship-Share-2026"
 *               Then the shared file "team-photo.png" should be shown
 */
When(/^(?:I|we) enter the share password "([^"]*)"$/, async function (password) {
  if (!(await onPasswordPage(this))) throw h.fail(this, `The password page of the share is not on screen: ${await h.pageSummary(this)}.`, 'Open the link first ("When I open the public link of "…" as a visitor").');
  const page = this.page;
  await page.locator('input[type="password"]').first().fill(password);
  const submit = page.getByRole('button', { name: 'Submit', exact: true }).or(page.locator('form [type="submit"]')).first();
  await h.navigating(this, () => submit.click());
});

/**
 * The public link refused the password: its password page again, with its message ("The password is wrong or
 * expired.").
 *
 * Example #1: Then the share password should be refused
 * Example #2: And the share password should be refused
 * Example #3: Then the share password should be refused
 *               And I should be asked for the password of the share
 * Example #4: Then the share password should be refused
 *               And I should be asked for the password of the share
 * Example #5: But the share password should be refused
 */
Then(/^the share password should be refused$/, async function () {
  const page = this.page;
  const read = async () => h.clean(await page.locator('[role="alert"], .warning, .notecard--error').first().innerText({ timeout: 500 }).catch(() => ''));
  await h.eventually(this, read, (t) => /password is wrong|wrong password/i.test(t), async (t) => ({ message: `The password page does not say the password is wrong${t ? `: it says "${t}"` : ''} (${await h.pageSummary(this)}).`, hint: 'A refused password brings the password page back with a message over the field.' }));
  if (!(await onPasswordPage(this))) throw h.fail(this, `The share let the visitor in: ${await h.pageSummary(this)}.`, 'Check the password the scenario typed.');
});

/**
 * The public link shows the visitor the shared file or folder: its page named after it, or its row in the list of
 * the share.
 *
 * Example #1: Then the shared file "team-photo.png" should be shown
 * Example #2: Then the shared file "annual-report.pdf" should be shown
 * Example #3: And the shared file "meeting-notes.md" should be shown
 * Example #4: Then the shared file "team-photo.png" should be shown
 *               And the viewer should show the image "team-photo.png"
 * Example #5: Then the shared file "budget.txt" should be shown
 */
Then(/^the shared file "([^"]*)" should be shown$/, async function (name) {
  const page = this.page;
  const read = async () => ({
    title: h.clean(await page.title().catch(() => '')),
    row: await files.rowLocator(page, name).isVisible().catch(() => false),
    password: await onPasswordPage(this),
  });
  await h.eventually(this, read, (s) => !s.password && (s.row || s.title.startsWith(`${name} `) || s.title === name), async (s) => ({
    message: s.password ? `The share still asks for its password: the file "${name}" is not shown.` : `The share does not show "${name}": the page "${s.title}" (${h.currentPath(this)}).`,
    hint: 'A public link of a file shows the file (and opens it in the viewer when it can); a link of a folder lists what is in it.',
  }));
});

module.exports = { sharingTab, publicLink };
