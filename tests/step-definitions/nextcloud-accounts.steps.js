'use strict';

// The accounts page of an administrator, read only or with its refusals (a suite never makes or deletes an
// account): the list of accounts, an account's groups, the search, a group's list, and a new account refused (a name
// that is taken). An account without the right gets the server's "Access forbidden" page.

const { When, Then } = require('@cucumber/cucumber');
const h = require('./nextcloud-helpers');

/** The rows of the accounts list: [{ username, text }]. */
async function accountRows(page) {
  return page.locator('tr.user-list__row, tr[data-cy-user-row]').evaluateAll((rows) => rows.map((r) => ({ username: r.getAttribute('data-cy-user-row') || '', text: r.innerText.replace(/\s+/g, ' ').trim() }))).catch(() => []);
}

/** Wait until the accounts page has drawn its list after its request. */
async function accountsReady(world) {
  await h.ready(world);
  await h.eventually(world, () => world.page.locator('tr.user-list__row, tr[data-cy-user-row], main [role="note"]').first().isVisible().catch(() => false), Boolean, async () => ({
    message: `The accounts list did not show: ${await h.pageSummary(world)}.`,
    hint: 'The accounts page belongs to an administrator (or the administrator of a group); another account gets "Access forbidden".',
  }));
}

/**
 * Go to the accounts page of the site (the administrator's list of accounts). Another account gets the server's
 * "Access forbidden" page, which the step leaves on screen.
 *
 * Example #1: When I go to the accounts page
 * Example #2: When we go to the accounts page
 * Example #3: And I go to the accounts page
 * Example #4: When I go to the accounts page
 *               Then I should see the error page "Access forbidden"
 * Example #5: When I go to the accounts page
 *               Then I should see the error page "Access forbidden"
 */
When(/^(?:I|we) go to the accounts page$/, async function () {
  const response = await h.open(this, '/settings/users');
  if (response && response.status() === 403) return;
  await accountsReady(this);
});

/**
 * The accounts list shows an account (a handle of the registry, by its username) — or does not.
 *
 * Example #1: Then the account list should show "editor"
 * Example #2: Then the account list should show "administrator"
 * Example #3: Then the account list should not show "editor"
 * Example #4: And the account list should show "user"
 * Example #5: But the account list should not show "user"
 */
Then(/^the account list should( not)? show "([^"]*)"$/, async function (not, who) {
  const handle = h.handleOf(this, who);
  const username = handle ? h.resolveUser(this, handle).username : who;
  await accountsReady(this);
  await h.eventually(this, () => accountRows(this.page), (rows) => rows.some((r) => h.same(r.username, username)) === !not, async (rows) => ({
    message: not ? `The account list shows "${username}".` : `The account list does not show "${username}". It shows ${h.listed(rows.map((r) => r.username))}.`,
    hint: 'The list shows the accounts of the group or the search on screen.',
  }));
});

/**
 * The row of an account in the accounts list names a group of the account (its "Groups" column).
 *
 * Example #1: Then the account "administrator" should be in the group "admin"
 * Example #2: Then the account "editor" should not be in the group "admin"
 * Example #3: And the account "administrator" should be in the group "admin"
 * Example #4: Then the account "user" should not be in the group "admin"
 * Example #5: But the account "editor" should not be in the group "admin"
 */
Then(/^the account "([^"]*)" should( not)? be in the group "([^"]*)"$/, async function (who, not, group) {
  const handle = h.handleOf(this, who);
  const username = handle ? h.resolveUser(this, handle).username : who;
  await accountsReady(this);
  const row = this.page.locator(`tr[data-cy-user-row=${h.cssString(username)}]`).first();
  if (!(await row.isVisible().catch(() => false))) throw h.fail(this, `The account list does not show "${username}".`, 'Show all accounts first ("When I open the "All accounts" account list").');
  const groups = await row.evaluate((r) => {
    const table = r.closest('table');
    const heads = table ? [...table.querySelectorAll('thead th, [role="columnheader"]')].map((t) => t.innerText.trim()) : [];
    const index = heads.findIndex((t) => /^groups$/i.test(t));
    const cells = [...r.querySelectorAll('td, [role="cell"]')];
    return (index >= 0 && cells[index] ? cells[index].innerText : '').split(/[,\n]/).map((g) => g.trim()).filter(Boolean);
  });
  const has = groups.some((g) => h.same(g, group));
  if (has === !!not) throw h.fail(this, not ? `The account "${username}" is in the group "${group}".` : `The account "${username}" is not in the group "${group}". Its groups are ${h.listed(groups)}.`, 'The "Groups" column lists the groups of the account.');
});

/**
 * Search the accounts list (its box "Search accounts and groups…"); the step waits for the server's answer.
 *
 * Example #1: When I search the accounts for "edit"
 * Example #2: When I search the accounts for "administrator"
 * Example #3: When we search the accounts for "user"
 * Example #4: And I search the accounts for "example.com"
 * Example #5: When I search the accounts for "nobody"
 */
When(/^(?:I|we) search the accounts for "([^"]*)"$/, async function (term) {
  const page = this.page;
  if (!/^\/settings\/users/.test(h.currentPath(this))) await h.open(this, '/settings/users');
  const box = page.getByRole('searchbox', { name: /^Search accounts/ }).first();
  if (!(await box.isVisible().catch(() => false))) throw h.fail(this, `The accounts page has no search: ${await h.pageSummary(this)}.`, 'The search is at the top of the accounts navigation.');
  await h.answered(this, `GET .*\\/ocs\\/v2\\.php\\/cloud\\/users\\/details\\?.*search=${encodeURIComponent(term).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, () => box.fill(term), { what: 'search the accounts' });
});

/**
 * Show one list of the accounts navigation by its words: All accounts, Admins, Recently active, Disabled accounts, a
 * group.
 *
 * Example #1: When I open the "Admins" account list
 * Example #2: When I open the "All accounts" account list
 * Example #3: When I open the "Recently active" account list
 * Example #4: When we open the "Admins" account list
 * Example #5: And I open the "All accounts" account list
 */
When(/^(?:I|we) open the "([^"]*)" account list$/, async function (list) {
  const page = this.page;
  if (!/^\/settings\/users/.test(h.currentPath(this))) await h.open(this, '/settings/users');
  const nav = page.getByRole('navigation', { name: 'Account management' }).first();
  const link = nav.getByRole('link', { name: new RegExp(`^${list.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:\\s+\\d+)?$`) }).first();
  if (!(await link.isVisible().catch(() => false))) {
    const offered = await nav.getByRole('link').allInnerTexts().catch(() => []);
    throw h.fail(this, `The accounts navigation has no list "${list}". It lists ${h.listed(offered.map((t) => t.replace(/\s+\d+$/, '')))}.`, 'Name a list by the words of its entry in the navigation.');
  }
  await h.answered(this, 'GET .*\\/ocs\\/v2\\.php\\/cloud\\/(?:users|groups)\\/', () => link.click(), { what: 'list the accounts' });
  await accountsReady(this);
});

/**
 * Try to make an account with a name that is taken, as a person does ("New account", its name and a password, "Add
 * new account"): for the refusal. The server refuses it and the dialog stays open; no account is made.
 *
 * Example #1: When I try to create the account "editor"
 * Example #2: When I try to create the account "user"
 * Example #3: When we try to create the account "administrator"
 * Example #4: And I try to create the account "editor"
 * Example #5: When I try to create the account "user"
 *               Then the new account should be refused with "User already exists"
 */
When(/^(?:I|we) try to create the account "([^"]*)"$/, async function (who) {
  const page = this.page;
  const handle = h.handleOf(this, who);
  const username = handle ? h.resolveUser(this, handle).username : who;
  if (!handle) throw h.fail(this, `"${who}" is not an account of the users registry: a suite never makes an account, it only tries a name that is taken.`, 'Name an account of worldParameters.users of cucumber.js.');
  if (!/^\/settings\/users/.test(h.currentPath(this))) await h.open(this, '/settings/users');
  await page.getByRole('button', { name: 'New account', exact: true }).first().click();
  const dialog = page.getByRole('dialog', { name: 'New account' }).first();
  await dialog.waitFor({ state: 'visible', timeout: h.budget(this) });
  await dialog.getByRole('textbox', { name: /^Account name/ }).first().fill(username);
  await dialog.getByRole('textbox', { name: /^Password/ }).first().fill(h.newPassword());
  const res = await h.answered(this, 'POST .*\\/ocs\\/v2\\.php\\/cloud\\/users(?:\\?|$)', () => dialog.getByRole('button', { name: 'Add new account', exact: true }).click(), { what: 'make the account' });
  if (res.status() < 300) throw h.fail(this, `The server made the account "${username}" a second time.`, 'An account name that is taken is refused by the server; check the name.');
});

/**
 * The new account was refused, with the server's words (as a part of the message that popped up); the dialog is
 * still open, and the step closes it.
 *
 * Example #1: Then the new account should be refused with "User already exists"
 * Example #2: Then the new account should be refused with "already exists"
 * Example #3: And the new account should be refused with "User already exists"
 * Example #4: Then the new account should be refused with "User already exists"
 *               And the account list should show "editor"
 * Example #5: Then the new account should be refused with "Unable to proceed"
 */
Then(/^the new account should be refused with "([^"]*)"$/, async function (message) {
  const page = this.page;
  await h.expectToast(this, message, { kind: 'error' });
  const dialog = page.getByRole('dialog', { name: 'New account' }).first();
  if (!(await dialog.isVisible().catch(() => false))) throw h.fail(this, 'The "New account" dialog closed: the account may have been made.', 'A refused account keeps the dialog open.');
  await dialog.getByRole('button', { name: 'Close', exact: true }).first().click().catch(() => {});
  await dialog.waitFor({ state: 'hidden', timeout: h.budget(this) }).catch(() => {});
});
