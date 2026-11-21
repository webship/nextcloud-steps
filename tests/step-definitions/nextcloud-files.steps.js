'use strict';

// Files: the file list (all files, a folder, the views of the navigation, the deleted files), uploading, a new
// folder, renaming, moving and copying, deleting and restoring, favorites, the details sidebar and its tabs, and
// the messages that pop up after an action. Every change of the server is waited on through its own request (a
// WebDAV PUT, MKCOL, MOVE, COPY or DELETE, the favorites call), then on the list the app draws again.

const path = require('path');
const { When, Then } = require('@cucumber/cucumber');
const h = require('./nextcloud-helpers');

/** The rows of the file list by the name a person reads (the name link's label ends with ": <name>"), or by the row's own name. */
function rowLocator(page, name) {
  const byAttr = page.locator(`tr.files-list__row[data-cy-files-list-row-name=${h.cssString(name)}]`);
  const byLabel = page.locator('tr.files-list__row').filter({ has: page.locator(`[data-cy-files-list-row-name-link][aria-label$=${h.cssString(`: ${name}`)}]`) });
  return byAttr.or(byLabel).first();
}

/** The names the file list shows, as a person reads them (the deleted files without their trash suffix). */
async function shownNames(page) {
  return page.evaluate(() => [...document.querySelectorAll('tr.files-list__row')].map((r) => {
    const t = r.querySelector('.files-list__row-name-text');
    return t ? [...t.children].map((c) => c.textContent.trim()).join('') : (r.getAttribute('data-cy-files-list-row-name') || '');
  })).catch(() => []);
}

/** Wait until the file list has loaded the folder or view it shows: no "Loading current folder" icon, then rows or the empty note. */
async function filesReady(world) {
  const page = world.page;
  const deadline = Date.now() + h.budget(world) * 2;
  for (;;) {
    const state = await page.evaluate(() => {
      const loading = [...document.querySelectorAll('.files-list__loading-icon, [aria-label="Loading current folder"]')].some((e) => e.getClientRects().length);
      const list = document.querySelector('tr.files-list__row, main [role="note"], .files-list__empty, .empty-content');
      return { loading, drawn: !!list, inApp: !!document.querySelector('#app-content-vue, .files-list, main') };
    }).catch(() => ({ loading: true, drawn: false, inApp: false }));
    if (!state.loading && state.drawn) break;
    if (Date.now() > deadline) {
      throw h.fail(world, `The file list did not finish loading: ${await h.pageSummary(world)}.`, 'The list shows a loading icon while it asks the server for the folder (a WebDAV PROPFIND); look at the screenshot of the failure.');
    }
    await page.waitForTimeout(100);
  }
  await h.ready(world);
}

/** The row of a file or folder of the list, or a failure that names what the list shows. */
async function needRow(world, name, where = 'the file list') {
  await filesReady(world);
  const row = rowLocator(world.page, name);
  const deadline = Date.now() + h.budget(world);
  while (!(await row.isVisible().catch(() => false))) {
    if (Date.now() > deadline) {
      throw h.fail(world, `${where[0].toUpperCase()}${where.slice(1)} does not show "${name}". It shows ${h.listed(await shownNames(world.page))} (${h.currentPath(world)}).`, 'Check the name with its extension, and that the scenario is in the folder that holds it ("When I open the folder "…"").');
    }
    await world.page.waitForTimeout(100);
  }
  return row;
}

/** Choose an action of a row's "Actions" menu by the words a person reads (or by the action's own id). */
async function rowAction(world, name, words, id) {
  const page = world.page;
  const row = await needRow(world, name);
  await row.hover().catch(() => {});
  await row.getByRole('button', { name: 'Actions', exact: true }).click();
  const byId = id ? page.locator(`li[data-cy-files-list-row-action=${h.cssString(id)}] button`) : null;
  const byWords = page.getByRole('menuitem', { name: words, exact: typeof words === 'string' });
  const item = (byId ? byWords.or(byId) : byWords).first();
  await item.waitFor({ state: 'visible', timeout: h.budget(world) }).catch(() => {});
  if (!(await item.isVisible().catch(() => false))) {
    const offered = await page.evaluate(() => [...document.querySelectorAll('[role="menu"] [role="menuitem"]')].filter((e) => e.getClientRects().length).map((e) => e.innerText.trim()));
    await page.keyboard.press('Escape').catch(() => {});
    throw h.fail(world, `The actions of "${name}" have no "${typeof words === 'string' ? words : String(words)}". They offer ${h.listed(offered)}.`, 'The actions a row offers depend on the file and on the account\'s rights to it.');
  }
  return item;
}

/** The handle of the account the browser works as, whose files a step changes (the clean-up takes back what it adds). */
async function changingFiles(world, what) {
  const handle = h.currentHandle(world, what);
  await h.trackFiles(world, handle);
  return handle;
}

/** The folder path of the page on screen, from its `dir` (`/` at the top). */
function currentDir(world) {
  try {
    return new URL(world.page.url()).searchParams.get('dir') || '/';
  } catch {
    return '/';
  }
}

/** A folder path as the file list's address takes it: /a/b. */
function dirOf(folder) {
  return `/${String(folder).split('/').filter(Boolean).join('/')}`;
}

/**
 * Go to the file list at the top of the account's files ("All files").
 *
 * Example #1: When I go to the files
 * Example #2: When we go to the files
 * Example #3: When I go to the files
 *               Then the file list should show "Project files"
 * Example #4: And I go to the files
 * Example #5: When I go to the files
 *               Then the file list should show "Project files"
 */
When(/^(?:I|we) go to the files$/, async function () {
  await h.open(this, '/apps/files/files');
  await filesReady(this);
});

/**
 * Go straight to a folder of the account's files by its path from the top (a/b for a folder in a folder).
 *
 * Example #1: When I go to the folder "Project files"
 * Example #2: When I go to the folder "Project files/Reports"
 * Example #3: When we go to the folder "Project files"
 * Example #4: And I go to the folder "Project files"
 * Example #5: When I go to the folder "Archive"
 */
When(/^(?:I|we) go to the folder "([^"]*)"$/, async function (folder) {
  await h.open(this, `/apps/files/files?dir=${encodeURIComponent(dirOf(folder))}`);
  await filesReady(this);
  const missing = await this.page.locator('main [role="note"]').filter({ hasText: /not found|does not exist/i }).first().isVisible().catch(() => false);
  if (missing) throw h.fail(this, `The folder "${folder}" does not exist: ${await h.pageSummary(this)}.`, 'Name the folder by its path from the top of the files.');
});

/**
 * Open a folder of the list, as a person does: its name, clicked. The list then shows what is in it.
 *
 * Example #1: When I open the folder "Project files"
 * Example #2: When we open the folder "Project files"
 * Example #3: And I open the folder "Reports"
 * Example #4: When I open the folder "Project files"
 *               Then the file list should be empty
 * Example #5: When I open the folder "Archive"
 */
When(/^(?:I|we) open the folder "([^"]*)"$/, async function (folder) {
  const row = await needRow(this, folder);
  const before = currentDir(this);
  await row.locator('[data-cy-files-list-row-name-link]').first().click();
  await h.eventually(this, async () => currentDir(this), (dir) => dir !== before && dir.split('/').pop() === folder, async (dir) => ({
    message: `The folder "${folder}" did not open: the list still shows ${dir}.`,
    hint: 'Only a folder opens in the list; a file opens in the viewer ("When I open the file "…"").',
  }));
  await filesReady(this);
});

/**
 * Open one of the views of the files navigation by its words: Recent, Favorites, Shares, Shared with you, Shared
 * with others, Shared by link, Tags, Deleted files and the others the navigation lists. A view of the Shares menu
 * opens the menu first.
 *
 * Example #1: When I open the "Favorites" files view
 * Example #2: When I open the "Shared with you" files view
 * Example #3: When I open the "Recent" files view
 * Example #4: When we open the "Deleted files" files view
 * Example #5: When I open the "Shared with others" files view
 */
When(/^(?:I|we) open the "([^"]*)" files view$/, async function (view) {
  const page = this.page;
  if (!/\/apps\/files\//.test(h.currentPath(this))) await h.open(this, '/apps/files/files');
  const nav = page.getByRole('list', { name: 'Views' });
  let link = nav.getByRole('link', { name: view, exact: true }).first();
  if (!(await link.isVisible().catch(() => false))) {
    // A view of the Shares menu: open the menu of its entry.
    const shares = page.locator('li').filter({ has: page.getByRole('link', { name: 'Shares', exact: true }) }).first();
    const toggle = shares.getByRole('button', { name: 'Open menu' });
    if (await toggle.isVisible().catch(() => false)) await toggle.click();
    link = nav.getByRole('link', { name: view, exact: true }).first();
  }
  if (!(await link.isVisible().catch(() => false))) {
    const offered = await nav.getByRole('link').allInnerTexts().catch(() => []);
    throw h.fail(this, `The files navigation has no view "${view}". It lists ${h.listed(offered)}.`, 'Name a view by the words of its entry in the navigation.');
  }
  const href = await link.getAttribute('href');
  await link.click();
  await h.eventually(this, async () => h.currentPath(this), (p) => !href || p.startsWith(decodeURIComponent(href)), async (p) => ({ message: `The view "${view}" did not open: the page is at ${p}.`, hint: 'The view is a route of the Files app.' }));
  await filesReady(this);
});

/**
 * Go to the deleted files of the account (its trash bin).
 *
 * Example #1: When I go to the deleted files
 * Example #2: When we go to the deleted files
 * Example #3: And I go to the deleted files
 * Example #4: When I go to the deleted files
 *               Then the deleted files should list "meeting-notes.md"
 * Example #5: When I go to the deleted files
 *               Then the deleted files should list "meeting-notes.md"
 */
When(/^(?:I|we) go to the deleted files$/, async function () {
  await h.open(this, '/apps/files/trashbin');
  await filesReady(this);
});

/**
 * The file list shows a file or folder (by the name a person reads, with its extension) — or does not.
 *
 * Example #1: Then the file list should show "meeting-notes.md"
 * Example #2: Then the file list should show "Project files"
 * Example #3: Then the file list should not show "meeting-notes.md"
 * Example #4: And the file list should show "team-photo.png"
 * Example #5: But the file list should not show "minutes.md"
 */
Then(/^the file list should( not)? show "([^"]*)"$/, async function (not, name) {
  await filesReady(this);
  await h.eventually(this, () => rowLocator(this.page, name).isVisible().catch(() => false), (visible) => visible === !not, async () => ({
    message: not ? `The file list still shows "${name}" (${h.currentPath(this)}).` : `The file list does not show "${name}". It shows ${h.listed(await shownNames(this.page))} (${h.currentPath(this)}).`,
    hint: not ? 'A file that was moved, renamed or deleted leaves the list when the server answered.' : 'Check the name with its extension, and the folder the scenario is in.',
  }));
});

/**
 * The file list of the folder or view on screen is empty (its note "No files in here", or the empty note of a view).
 *
 * Example #1: Then the file list should be empty
 * Example #2: And the file list should be empty
 * Example #3: Then the file list should be empty
 *               When I upload the file "meeting-notes.md"
 * Example #4: Then the file list should be empty
 *               When I upload the file "meeting-notes.md"
 * Example #5: But the file list should be empty
 */
Then(/^the file list should be empty$/, async function () {
  await filesReady(this);
  const names = await shownNames(this.page);
  if (names.length) throw h.fail(this, `The file list is not empty: it shows ${h.listed(names)} (${h.currentPath(this)}).`, 'The clean-up of the scenarios takes back what they add; a file left from an interrupted run can be removed in the Files app.');
});

/**
 * Upload a file into the folder on screen, as a person does: "New", "Upload files" and the file chosen. The file
 * is one of the project's (tests/assets/, tests/fixtures/, or a path from the project) or one of the pack's own:
 * meeting-notes.md, budget.txt, team-photo.png, annual-report.pdf. The step waits for the server to store it
 * (its WebDAV PUT) and for the list to show it. What the scenario uploads is removed after it.
 *
 * Example #1: When I upload the file "meeting-notes.md"
 * Example #2: When I upload the file "team-photo.png"
 * Example #3: When I upload the file "annual-report.pdf"
 * Example #4: When we upload the file "budget.txt"
 * Example #5: When I upload the file "tests/assets/report.pdf"
 */
When(/^(?:I|we) upload the file "([^"]*)"$/, { timeout: 120000 }, async function (name) {
  const page = this.page;
  const file = h.fixture(this, name);
  const base = path.basename(file);
  await changingFiles(this, 'Uploading a file');
  await filesReady(this);
  if (await rowLocator(page, base).isVisible().catch(() => false)) {
    throw h.fail(this, `The folder already has "${base}" (${h.currentPath(this)}): an upload would ask what to do with the file that is there.`, 'Upload into a folder that does not have the file yet; the clean-up removes what the scenarios upload.');
  }
  await page.getByRole('button', { name: 'New', exact: true }).first().click();
  const item = page.getByRole('menuitem', { name: 'Upload files', exact: true }).first();
  await item.waitFor({ state: 'visible', timeout: h.budget(this) });
  // A small file is one WebDAV PUT; a large one goes up in chunks, then a MOVE puts it together at its name.
  const stored = page.waitForResponse((r) => {
    const method = r.request().method();
    if (method === 'PUT') return decodeURIComponent(r.url()).endsWith(`/${base}`);
    if (method === 'MOVE') return decodeURIComponent(r.request().headers().destination || '').endsWith(`/${base}`);
    return false;
  }, { timeout: h.budget(this) * 4 }).catch(() => null);
  const [chooser] = await Promise.all([page.waitForEvent('filechooser', { timeout: h.budget(this) }), item.click()]);
  await chooser.setFiles(file);
  const res = await stored;
  if (!res) throw h.fail(this, `The upload of "${base}" did not reach the server.`, 'Look at the screenshot of the failure for a dialog (a conflict, the quota) that stopped it.');
  if (res.status() >= 300) throw h.fail(this, `The server refused the upload of "${base}": it answered ${res.status()}.`, 'Check the account\'s quota and the server\'s upload limits (upload_max_filesize).');
  await h.settled(this);
  await needRow(this, base);
});

/**
 * Make a folder in the folder on screen, as a person does: "New", "New folder", its name, "Create". The step
 * waits for the server (its WebDAV MKCOL) and for the list to show it. The folder is removed after the scenario.
 *
 * Example #1: When I create the folder "Project files"
 * Example #2: When I create the folder "Reports"
 * Example #3: When we create the folder "Project files"
 * Example #4: And I create the folder "Archive"
 * Example #5: When I create the folder "Meeting minutes"
 */
When(/^(?:I|we) create the folder "([^"]*)"$/, async function (name) {
  const page = this.page;
  await changingFiles(this, 'Making a folder');
  await filesReady(this);
  await page.getByRole('button', { name: 'New', exact: true }).first().click();
  await page.getByRole('menuitem', { name: 'New folder', exact: true }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Create new folder' });
  await dialog.waitFor({ state: 'visible', timeout: h.budget(this) });
  await dialog.getByRole('textbox', { name: 'Folder name' }).fill(name);
  const create = dialog.getByRole('button', { name: 'Create', exact: true });
  if (await create.isDisabled().catch(() => false)) {
    const said = (await dialog.innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
    throw h.fail(this, `The folder "${name}" cannot be made here: the dialog says "${said.slice(0, 200)}".`, 'A folder of that name is there already, or the name has a character the server refuses.');
  }
  await h.answered(this, 'MKCOL ', () => create.click(), { what: 'make the folder (MKCOL)' });
  await needRow(this, name);
});

/**
 * Rename a file or folder of the list, as a person does: "Actions", "Rename", the new name, Enter. The step waits
 * for the server (its WebDAV MOVE) and for the list to show the new name.
 *
 * Example #1: When I rename "meeting-notes.md" to "minutes.md"
 * Example #2: When I rename "Project files" to "Projects"
 * Example #3: When we rename "budget.txt" to "budget-2027.txt"
 * Example #4: And I rename "team-photo.png" to "team.png"
 * Example #5: When I rename "minutes.md" to "meeting-notes.md"
 */
When(/^(?:I|we) rename "([^"]*)" to "([^"]*)"$/, async function (name, newName) {
  const page = this.page;
  await changingFiles(this, 'Renaming a file');
  const item = await rowAction(this, name, 'Rename', 'rename');
  await item.click();
  const field = page.locator('form.files-list__row-rename input').or(page.getByRole('textbox', { name: 'Filename' })).first();
  await field.waitFor({ state: 'visible', timeout: h.budget(this) });
  await field.fill(newName);
  await h.answered(this, 'MOVE ', () => field.press('Enter'), { what: 'rename it (MOVE)' });
  await needRow(this, newName);
});

/** Move or copy a row to a folder through the "Choose destination" dialog. */
async function moveOrCopy(world, name, folder, verb) {
  const page = world.page;
  await changingFiles(world, `${verb === 'Move' ? 'Moving' : 'Copying'} a file`);
  const item = await rowAction(world, name, 'Move or copy', 'move-copy');
  await item.click();
  const dialog = page.getByRole('dialog', { name: 'Choose destination' });
  await dialog.waitFor({ state: 'visible', timeout: h.budget(world) });
  const segments = String(folder).split('/').filter(Boolean);
  // From the top of the files: the dialog opens in the folder of the file.
  const top = dialog.getByRole('navigation').last().getByRole('button', { name: 'All files', exact: true }).first();
  if (await top.isVisible().catch(() => false)) await top.click();
  for (const segment of segments) {
    const row = dialog.locator(`tr.file-picker__row[data-filename=${h.cssString(segment)}]`).first();
    await row.waitFor({ state: 'visible', timeout: h.budget(world) }).catch(() => {});
    if (!(await row.isVisible().catch(() => false))) {
      const offered = await dialog.locator('tr.file-picker__row').evaluateAll((rows) => rows.map((r) => r.getAttribute('data-filename')));
      await dialog.getByRole('button', { name: 'Close' }).click().catch(() => {});
      throw h.fail(world, `The destination dialog has no folder "${segment}". It lists ${h.listed(offered)}.`, 'Name the destination by its path from the top of the files (a/b).');
    }
    await row.locator('td').first().click();
    await dialog.getByRole('navigation').last().getByRole('button', { name: segment, exact: true }).first().waitFor({ timeout: h.budget(world) }).catch(() => {});
  }
  const target = segments[segments.length - 1];
  const button = dialog.getByRole('button', { name: `${verb} to ${target}`, exact: true });
  if (!(await button.isVisible().catch(() => false))) {
    const offered = await dialog.getByRole('button').allInnerTexts().catch(() => []);
    await dialog.getByRole('button', { name: 'Close' }).click().catch(() => {});
    throw h.fail(world, `The destination dialog offers no "${verb} to ${target}". It offers ${h.listed(offered)}.`, 'A file cannot be moved into the folder it is in.');
  }
  await h.answered(world, `${verb === 'Move' ? 'MOVE' : 'COPY'} `, () => button.click(), { what: `${verb.toLowerCase()} it (${verb === 'Move' ? 'MOVE' : 'COPY'})` });
  await dialog.waitFor({ state: 'hidden', timeout: h.budget(world) }).catch(() => {});
  await filesReady(world);
}

/**
 * Move a file or folder of the list into a folder (by its path from the top), with "Actions", "Move or copy" and
 * the destination chosen in its dialog; the step waits for the server (its WebDAV MOVE).
 *
 * Example #1: When I move "meeting-notes.md" to the folder "Project files"
 * Example #2: When I move "team-photo.png" to the folder "Project files/Reports"
 * Example #3: When we move "budget.txt" to the folder "Project files"
 * Example #4: And I move "minutes.md" to the folder "Archive"
 * Example #5: When I move "Reports" to the folder "Project files"
 */
When(/^(?:I|we) move "([^"]*)" to the folder "([^"]*)"$/, async function (name, folder) {
  await moveOrCopy(this, name, folder, 'Move');
});

/**
 * Copy a file or folder of the list into a folder (by its path from the top), with "Actions", "Move or copy" and
 * the destination chosen in its dialog; the step waits for the server (its WebDAV COPY).
 *
 * Example #1: When I copy "meeting-notes.md" to the folder "Project files"
 * Example #2: When I copy "team-photo.png" to the folder "Project files/Reports"
 * Example #3: When we copy "budget.txt" to the folder "Project files"
 * Example #4: And I copy "minutes.md" to the folder "Archive"
 * Example #5: When I copy "Reports" to the folder "Project files"
 */
When(/^(?:I|we) copy "([^"]*)" to the folder "([^"]*)"$/, async function (name, folder) {
  await moveOrCopy(this, name, folder, 'Copy');
});

/**
 * Delete a file or folder of the list with its "Actions" menu ("Delete file" or "Delete folder"); it goes to the
 * deleted files. The step waits for the server (its WebDAV DELETE) and for the row to leave the list.
 *
 * Example #1: When I delete "meeting-notes.md"
 * Example #2: When I delete "Project files"
 * Example #3: When we delete "budget.txt"
 * Example #4: And I delete "team-photo.png"
 * Example #5: When I delete "minutes.md"
 */
When(/^(?:I|we) delete "([^"]*)"$/, async function (name) {
  await changingFiles(this, 'Deleting a file');
  const item = await rowAction(this, name, /^Delete( file| folder|)$/, 'delete');
  await h.answered(this, 'DELETE ', () => item.click(), { what: 'delete it (DELETE)' });
  await h.eventually(this, () => rowLocator(this.page, name).isVisible().catch(() => false), (v) => !v, async () => ({ message: `"${name}" is still in the list after the delete.`, hint: 'Look at the screenshot of the failure for a message of the server.' }));
});

/**
 * The deleted files (the trash bin, on screen) list a file or folder by the name it had — or do not.
 *
 * Example #1: Then the deleted files should list "meeting-notes.md"
 * Example #2: Then the deleted files should list "Project files"
 * Example #3: Then the deleted files should not list "meeting-notes.md"
 * Example #4: And the deleted files should list "budget.txt"
 * Example #5: But the deleted files should not list "budget.txt"
 */
Then(/^the deleted files should( not)? list "([^"]*)"$/, async function (not, name) {
  if (!/\/apps\/files\/trashbin/.test(h.currentPath(this))) await h.open(this, '/apps/files/trashbin');
  await filesReady(this);
  await h.eventually(this, () => rowLocator(this.page, name).isVisible().catch(() => false), (visible) => visible === !not, async () => ({
    message: not ? `The deleted files still list "${name}".` : `The deleted files do not list "${name}". They list ${h.listed(await shownNames(this.page))}.`,
    hint: not ? 'A restored file leaves the deleted files when the server answered.' : 'A file deleted in the scenario is in the deleted files of the account that deleted it.',
  }));
});

/**
 * Restore a file or folder from the deleted files (on screen) with its "Restore" button; the step waits for the
 * server (its WebDAV MOVE back) and for the row to leave the deleted files.
 *
 * Example #1: When I restore "meeting-notes.md" from the deleted files
 * Example #2: When I restore "Project files" from the deleted files
 * Example #3: When we restore "budget.txt" from the deleted files
 * Example #4: And I restore "team-photo.png" from the deleted files
 * Example #5: When I restore "minutes.md" from the deleted files
 */
When(/^(?:I|we) restore "([^"]*)" from the deleted files$/, async function (name) {
  if (!/\/apps\/files\/trashbin/.test(h.currentPath(this))) await h.open(this, '/apps/files/trashbin');
  await changingFiles(this, 'Restoring a file');
  const row = await needRow(this, name, 'the deleted files');
  const button = row.getByRole('button', { name: 'Restore', exact: true }).first();
  if (!(await button.isVisible().catch(() => false))) throw h.fail(this, `The row of "${name}" in the deleted files has no "Restore" button.`, 'Only the deleted files offer "Restore".');
  await h.answered(this, 'MOVE .*\\/trashbin\\/', () => button.click(), { what: 'restore it (MOVE out of the trash bin)' });
  await h.eventually(this, () => rowLocator(this.page, name).isVisible().catch(() => false), (v) => !v, async () => ({ message: `"${name}" is still in the deleted files after "Restore".`, hint: 'Look at the screenshot of the failure for a message of the server.' }));
});

/**
 * Add a file or folder of the list to the favorites, or remove it, with its "Actions" menu; the step waits for the
 * server (its favorites call) and for the star of the row.
 *
 * Example #1: When I add "meeting-notes.md" to the favorites
 * Example #2: When I add "Project files" to the favorites
 * Example #3: When I remove "meeting-notes.md" from the favorites
 * Example #4: When we add "budget.txt" to the favorites
 * Example #5: When I remove "Project files" from the favorites
 */
When(/^(?:I|we) (add|remove) "([^"]*)" (?:to|from) the favorites$/, async function (verb, name) {
  await changingFiles(this, 'Marking a favorite');
  const words = verb === 'add' ? 'Add to favorites' : 'Remove from favorites';
  const item = await rowAction(this, name, words, 'favorite');
  await h.answered(this, 'POST .*\\/apps\\/files\\/api\\/v1\\/files\\/', () => item.click(), { what: `${verb} the favorite` });
  const star = rowLocator(this.page, name).locator('.files-list__row-icon-favorite');
  await h.eventually(this, () => star.isVisible().catch(() => false), (v) => v === (verb === 'add'), async () => ({ message: `"${name}" is ${verb === 'add' ? 'not' : 'still'} marked as a favorite after "${words}".`, hint: 'The star shows on the icon of the row once the server answered.' }));
});

/**
 * A file or folder of the list carries the favorite star — or does not.
 *
 * Example #1: Then "meeting-notes.md" should be marked as a favorite
 * Example #2: Then "Project files" should be marked as a favorite
 * Example #3: Then "meeting-notes.md" should not be marked as a favorite
 * Example #4: And "budget.txt" should be marked as a favorite
 * Example #5: But "Project files" should not be marked as a favorite
 */
Then(/^"([^"]*)" should( not)? be marked as a favorite$/, async function (name, not) {
  const row = await needRow(this, name);
  const star = row.locator('.files-list__row-icon-favorite');
  await h.eventually(this, () => star.isVisible().catch(() => false), (v) => v === !not, async () => ({ message: `"${name}" is ${not ? '' : 'not '}marked as a favorite.`, hint: 'The favorite star sits on the icon of the row.' }));
});

/** The details sidebar on screen, or null. */
function sidebar(page) {
  return page.locator('aside#app-sidebar-vue, aside.app-sidebar').first();
}

// The sidebar holds the Sharing tab, a custom element whose `shadowRoot` is the element itself: a query that pierces
// shadow roots can run into it without end. The steps of the sidebar read it with the page's own DOM, and find what
// they click with XPath (which stays in the light tree).
const SIDEBAR = '//aside[@id="app-sidebar-vue" or contains(@class, "app-sidebar")]';

/** What the sidebar shows, read with the page's DOM: { open, name, header, tabs: [{ name, selected }], panel }. */
async function sidebarState(page) {
  return page.evaluate(() => {
    const a = document.querySelector('aside#app-sidebar-vue, aside.app-sidebar');
    if (!a || !a.getClientRects().length) return { open: false, name: '', header: '', tabs: [], panel: '' };
    const h2 = a.querySelector('h2');
    const header = a.querySelector('.app-sidebar-header');
    const tabs = [...a.querySelectorAll('[role="tab"]')].map((t) => ({ name: t.textContent.replace(/\s+/g, ' ').trim(), selected: t.getAttribute('aria-selected') === 'true' }));
    const panel = [...a.querySelectorAll('[role="tabpanel"]')].find((p) => p.getClientRects().length && !p.hidden);
    return { open: true, name: h2 ? h2.textContent.replace(/\s+/g, ' ').trim() : '', header: header ? header.innerText.replace(/\s+/g, ' ').trim() : '', tabs, panel: panel ? panel.innerText.replace(/\s+/g, ' ').trim() : '' };
  }).catch(() => ({ open: false, name: '', header: '', tabs: [], panel: '' }));
}

/**
 * Open the details of a file or folder of the list (its "Actions" menu, "Details"): the sidebar with its name, its
 * size, its date and its owner, and its tabs (Sharing, Activity, Versions). The step waits for the sidebar's own
 * requests (its shares).
 *
 * Example #1: When I open the details of "meeting-notes.md"
 * Example #2: When I open the details of "Project files"
 * Example #3: When we open the details of "team-photo.png"
 * Example #4: And I open the details of "budget.txt"
 * Example #5: When I open the details of "minutes.md"
 */
When(/^(?:I|we) open the details of "([^"]*)"$/, async function (name) {
  const item = await rowAction(this, name, 'Details', 'details');
  await item.click();
  await h.eventually(this, async () => (await sidebarState(this.page)).name, (t) => h.same(t, name), async (t) => ({ message: `The details of "${name}" did not open${t ? `: the sidebar shows "${t}"` : ''}.`, hint: 'The details open in a sidebar at the right of the list.' }));
  await h.ready(this);
});

/**
 * The header of the details sidebar shows a text: the name, or a part of its line of size, date and owner
 * ("115 B", "User").
 *
 * Example #1: Then the details should show "meeting-notes.md"
 * Example #2: Then the details should show "User"
 * Example #3: Then the details should show "< 1 KB"
 * Example #4: And the details should show "Project files"
 * Example #5: Then the details should show "Editor"
 */
Then(/^the details should show "([^"]*)"$/, async function (text) {
  if (!(await sidebarState(this.page)).open) throw h.fail(this, 'The details sidebar is not open.', 'Open it first ("When I open the details of "…"").');
  await h.eventually(this, async () => (await sidebarState(this.page)).header, (t) => h.mentions(t, text), async (t) => ({ message: `The details do not show "${text}". Their header says "${t}".`, hint: 'The header shows the name, then the size, the date and the owner.' }));
});

/**
 * Open a tab of the details sidebar by its words (Sharing, Activity, Versions); the step waits for its content.
 *
 * Example #1: When I open the "Activity" tab of the details
 * Example #2: When I open the "Sharing" tab of the details
 * Example #3: When I open the "Versions" tab of the details
 * Example #4: When we open the "Activity" tab of the details
 * Example #5: And I open the "Sharing" tab of the details
 */
When(/^(?:I|we) open the "([^"]*)" tab of the details$/, async function (tab) {
  const state = await sidebarState(this.page);
  if (!state.open) throw h.fail(this, 'The details sidebar is not open.', 'Open it first ("When I open the details of "…"").');
  if (!state.tabs.some((t) => h.same(t.name, tab))) throw h.fail(this, `The details have no tab "${tab}". They have ${h.listed(state.tabs.map((t) => t.name))}.`, 'The tabs depend on the apps of the server.');
  await this.page.locator(`xpath=${SIDEBAR}//*[@role="tab"][normalize-space(.)=${JSON.stringify(tab)}]`).first().click();
  await h.eventually(this, async () => (await sidebarState(this.page)).tabs.find((t) => h.same(t.name, tab)), (t) => t && t.selected, async () => ({ message: `The tab "${tab}" did not open.`, hint: 'A tab of the details opens on a click.' }));
  await h.ready(this);
});

/**
 * The tab of the details sidebar on screen shows a text (the words given, as a part of its content): an activity,
 * a share, a version.
 *
 * Example #1: Then the details tab should show "You created meeting-notes.md"
 * Example #2: Then the details tab should show "Editor"
 * Example #3: Then the details tab should show "Current version"
 * Example #4: And the details tab should show "You renamed"
 * Example #5: Then the details tab should show "Share link"
 */
Then(/^the details tab should show "([^"]*)"$/, async function (text) {
  await h.eventually(this, async () => (await sidebarState(this.page)).panel, (t) => h.mentions(t, text), async (t) => ({ message: `The details tab does not show "${text}". It shows "${t.slice(0, 300)}".`, hint: 'Open the tab first ("When I open the "…" tab of the details").' }));
});

/**
 * Close the details sidebar with its "Close sidebar" button.
 *
 * Example #1: When I close the details
 * Example #2: When we close the details
 * Example #3: And I close the details
 * Example #4: When I close the details
 *               Then the file list should show "meeting-notes.md"
 * Example #5: Then I close the details
 */
When(/^(?:I|we) close the details$/, async function () {
  if (!(await sidebarState(this.page)).open) return;
  await this.page.locator(`xpath=${SIDEBAR}//button[@aria-label="Close sidebar"]`).first().click();
  await h.eventually(this, async () => (await sidebarState(this.page)).open, (open) => !open, async () => ({ message: 'The details sidebar did not close.', hint: 'It closes with its "Close sidebar" button.' }));
  await h.ready(this);
});

/**
 * A message pops up after the action (the words given, as a part of it): "Created new folder", "Delete file: done",
 * "Wrong password". The messages stay a few seconds, so this step follows the action at once.
 *
 * Example #1: Then a message "Delete file: done" should pop up
 * Example #2: Then a message "Created new folder" should pop up
 * Example #3: Then a message "Wrong password" should pop up
 * Example #4: And a message "Restore: done" should pop up
 * Example #5: Then a message "User already exists" should pop up
 */
Then(/^a message "([^"]*)" should pop up$/, async function (text) {
  await h.expectToast(this, text);
});

module.exports = { filesReady, needRow, rowLocator, rowAction, shownNames, sidebar, sidebarState, changingFiles, currentDir };
