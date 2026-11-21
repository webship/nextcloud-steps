'use strict';

// Notifications: one given to an account as test data (the administrators' notice of the server, through its API),
// the notifications menu of the header, a notification dismissed, all of them dismissed, and none left. The
// notifications a scenario gives are removed after it.

const { Given, When, Then } = require('@cucumber/cucumber');
const h = require('./nextcloud-helpers');

/** The notifications menu of the header (opened or not). */
function panel(page) {
  return page.locator('#header-menu-notifications').first();
}

/** The notifications the menu lists: [{ subject, message }]. */
async function listed(page) {
  return panel(page).locator('li.notification, .notification').evaluateAll((items) => items.map((i) => ({
    subject: ((i.querySelector('.notification-subject .subject, .notification-subject') || i).innerText || '').replace(/\s+/g, ' ').trim(),
    message: ((i.querySelector('.notification-message') || {}).innerText || '').replace(/\s+/g, ' ').trim(),
  }))).catch(() => []);
}

/**
 * Give an account of the registry a notification, as test data: the server's notice from an administrator (its
 * subject and, with "saying", its message), sent through the server's API as the data administrator. The account
 * reads it in its notifications menu; it is removed after the scenario.
 *
 * Example #1: Given "user" has the notification "Quarterly review is due"
 * Example #2: Given "user" has the notification "Quarterly review is due" saying "Please send your figures by Friday."
 * Example #3: Given "editor" has the notification "Budget meeting moved"
 * Example #4: And "user" has the notification "Server maintenance tonight"
 * Example #5: Given "administrator" has the notification "Backup finished" saying "All files were saved."
 */
Given(/^"([^"]*)" has the notification "([^"]*)"(?: saying "([^"]*)")?$/, async function (handle, subject, message) {
  const account = h.resolveUser(this, handle);
  const admin = await h.adminApi(this);
  const res = await admin.ocs('POST', `/apps/notifications/api/v2/admin_notifications/${encodeURIComponent(account.username)}`, { shortMessage: subject, longMessage: message || '' });
  if (!res.ok) throw h.fail(this, `The notification for ${account.username} could not be given: the server answered ${res.status} ${res.message}.`, 'The data administrator (worldParameters.dataAdmin) must be in the admin group, and the notifications app enabled.');
  if (!h.cleansUp(this)) return;
  const own = await h.api(this, handle);
  h.afterScenario(this, `notification:${handle}:${subject}`, async () => {
    const list = await own.ocs('GET', '/apps/notifications/api/v2/notifications');
    for (const n of Array.isArray(list.data) ? list.data : []) {
      if (n.app === 'admin_notifications' && n.subject === subject) await own.ocs('DELETE', `/apps/notifications/api/v2/notifications/${n.notification_id}`);
    }
  });
});

/**
 * Open the notifications menu of the header; the step waits for the server's list of notifications.
 *
 * Example #1: When I open the notifications
 * Example #2: When we open the notifications
 * Example #3: And I open the notifications
 * Example #4: When I open the notifications
 *               Then the notifications should show "Quarterly review is due"
 * Example #5: Then I open the notifications
 */
When(/^(?:I|we) open the notifications$/, async function () {
  const page = this.page;
  if (!h.onSite(this, page.url()) || /\/login/.test(h.currentPath(this))) await h.open(this, '/');
  if (await panel(page).isVisible().catch(() => false)) return;
  const button = page.getByRole('button', { name: 'Notifications', exact: true }).first();
  if (!(await button.isVisible().catch(() => false))) throw h.fail(this, `The page has no notifications menu: ${await h.pageSummary(this)}.`, 'The notifications menu is in the header of every app page of a logged-in account.');
  await h.answered(this, 'GET .*\\/apps\\/notifications\\/api\\/v2\\/notifications', () => button.click(), { what: 'list the notifications' });
  await panel(page).waitFor({ state: 'visible', timeout: h.budget(this) });
});

/**
 * The notifications menu lists a notification by its subject (or a part of its message) — or does not.
 *
 * Example #1: Then the notifications should show "Quarterly review is due"
 * Example #2: Then the notifications should show "Please send your figures by Friday."
 * Example #3: Then the notifications should not show "Quarterly review is due"
 * Example #4: And the notifications should show "Budget meeting moved"
 * Example #5: But the notifications should not show "Budget meeting moved"
 */
Then(/^the notifications should( not)? show "([^"]*)"$/, async function (not, text) {
  const page = this.page;
  if (!(await panel(page).isVisible().catch(() => false))) throw h.fail(this, 'The notifications menu is not open.', 'Open it first ("When I open the notifications").');
  const has = (list) => list.some((n) => h.mentions(n.subject, text) || h.mentions(n.message, text));
  await h.eventually(this, () => listed(page), (list) => (not ? !has(list) : has(list)), async (list) => ({
    message: not ? `The notifications still show "${text}".` : `The notifications do not show "${text}". They show ${h.listed(list.map((n) => n.subject))}.`,
    hint: 'The menu lists the notifications the server had when it opened; open it again for newer ones.',
  }));
});

/**
 * Dismiss a notification of the open menu (by its subject) with its "Dismiss" button; the step waits for the
 * server (its DELETE) and for the notification to leave the menu.
 *
 * Example #1: When I dismiss the notification "Quarterly review is due"
 * Example #2: When we dismiss the notification "Budget meeting moved"
 * Example #3: And I dismiss the notification "Quarterly review is due"
 * Example #4: When I dismiss the notification "Quarterly review is due"
 *               Then I should have no notifications
 * Example #5: When I dismiss the notification "Server maintenance tonight"
 */
When(/^(?:I|we) dismiss the notification "([^"]*)"$/, async function (subject) {
  const page = this.page;
  if (!(await panel(page).isVisible().catch(() => false))) throw h.fail(this, 'The notifications menu is not open.', 'Open it first ("When I open the notifications").');
  const item = panel(page).locator('li.notification, .notification').filter({ hasText: subject }).first();
  if (!(await item.isVisible().catch(() => false))) throw h.fail(this, `The notifications show no "${subject}". They show ${h.listed((await listed(page)).map((n) => n.subject))}.`, 'Give the account the notification first ("Given "user" has the notification "…"").');
  await h.answered(this, 'DELETE .*\\/apps\\/notifications\\/api\\/v2\\/notifications\\/', () => item.getByRole('button', { name: 'Dismiss', exact: true }).click(), { what: 'dismiss the notification' });
  await h.eventually(this, () => item.isVisible().catch(() => false), (v) => !v, async () => ({ message: `The notification "${subject}" is still in the menu after "Dismiss".`, hint: 'Look at the screenshot of the failure for a message of the server.' }));
});

/**
 * Dismiss every notification of the open menu ("Dismiss all notifications"); the step waits for the server.
 *
 * Example #1: When I dismiss all notifications
 * Example #2: When we dismiss all notifications
 * Example #3: And I dismiss all notifications
 * Example #4: When I dismiss all notifications
 *               Then I should have no notifications
 * Example #5: Then I dismiss all notifications
 */
When(/^(?:I|we) dismiss all notifications$/, async function () {
  const page = this.page;
  if (!(await panel(page).isVisible().catch(() => false))) throw h.fail(this, 'The notifications menu is not open.', 'Open it first ("When I open the notifications").');
  const button = panel(page).getByRole('button', { name: 'Dismiss all notifications', exact: true }).first();
  if (!(await button.isVisible().catch(() => false))) throw h.fail(this, 'The notifications menu offers no "Dismiss all notifications": it has no notification.', 'Give the account a notification first ("Given "user" has the notification "…"").');
  await h.answered(this, 'DELETE .*\\/apps\\/notifications\\/api\\/v2\\/notifications', () => button.click(), { what: 'dismiss the notifications' });
});

/**
 * The notifications menu has no notification ("No notifications").
 *
 * Example #1: Then I should have no notifications
 * Example #2: Then we should have no notifications
 * Example #3: And I should have no notifications
 * Example #4: Then I should have no notifications
 *               And the notifications should not show "Quarterly review is due"
 * Example #5: But I should have no notifications
 */
Then(/^(?:I|we) should have no notifications$/, async function () {
  const page = this.page;
  if (!(await panel(page).isVisible().catch(() => false))) throw h.fail(this, 'The notifications menu is not open.', 'Open it first ("When I open the notifications").');
  await h.eventually(this, () => listed(page), (list) => list.length === 0, async (list) => ({ message: `The notifications menu still lists ${h.listed(list.map((n) => n.subject))}.`, hint: 'Dismiss them ("When I dismiss all notifications").' }));
  const note = panel(page).getByText('No notifications', { exact: true }).first();
  if (!(await note.isVisible().catch(() => false))) throw h.fail(this, 'The notifications menu lists nothing, but it does not say "No notifications".', 'The empty menu says "No notifications".');
});
