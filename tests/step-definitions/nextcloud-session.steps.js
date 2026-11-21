'use strict';

// The session: logging in with the login form (or taking over the account's session from earlier in the run),
// the login form's refusal, logging out, and who the server says is logged in. This file also sets up every page
// the World opens and puts back, after each scenario, what the scenario changed on the site.

const { Given, When, Then, Before, After } = require('@cucumber/cucumber');
const { friendly, onNewPage } = require('webship-js/tests/step-definitions/webship');
const h = require('./nextcloud-helpers');

onNewPage(async (world, page) => {
  world.__ncFailedRequests = [];
  await h.instrument(world, page);
});

Before(function () {
  this.__ncScenarioStart = Date.now();
});

After({ name: 'put back what the scenario changed on the site' }, async function () {
  const problems = await h.runCleanups(this);
  if (problems.length) {
    // A clean-up that failed does not fail the scenario; the build script's ACCOUNTS_ONLY=1 gives the accounts back their state.
    console.warn(`[nextcloud-steps] clean-up: ${problems.join('; ')}`);
  }
});

/** Whether the page on screen is the login page of the site. */
async function onLoginPage(world) {
  if (!/^\/login/.test(h.currentPath(world))) return false;
  return world.page.locator('form.login-form, form[name="login"]').first().isVisible().catch(() => false);
}

/** The words of a refusal on the login page: the message under the fields, or a note over them. */
async function loginMessages(world) {
  return world.page.evaluate(() => [...document.querySelectorAll('.login-form .input-field__helper-text-message--error, .login-form [role="alert"], .login-form .notecard--error, .login-form .warning, .notecard--error')]
    .filter((e) => e.getClientRects().length).map((e) => e.innerText.replace(/\s+/g, ' ').trim()).filter(Boolean)).catch(() => []);
}

/** Fill the login form in and send it; the server answers with the next page (the app, or the form again). */
async function sendLoginForm(world, login, password) {
  const page = world.page;
  const form = page.locator('form.login-form').first();
  if (!(await form.isVisible().catch(() => false))) {
    await form.waitFor({ state: 'visible', timeout: h.budget(world) }).catch(() => {});
  }
  if (!(await form.isVisible().catch(() => false))) {
    throw h.fail(world, `The login form is not on the page: ${await h.pageSummary(world)}.`, 'Start from "Given I am on the login page"; a browser that is logged in already is sent past the login page.');
  }
  const name = page.getByRole('textbox', { name: 'Account name or email' }).or(page.locator('form.login-form #user')).first();
  const secret = page.getByRole('textbox', { name: 'Password', exact: true }).or(page.locator('form.login-form #password')).first();
  await name.fill(login);
  await secret.fill(password);
  const submit = form.getByRole('button', { name: 'Log in', exact: true }).or(form.locator('button[type="submit"]')).first();
  await h.navigating(world, () => submit.click());
}

/** Log the browser in as an account of the registry, or take its session over from earlier in the run. */
async function logIn(world, handle) {
  const account = h.resolveUser(world, handle);
  const key = h.sessionKey(world, account.username);
  await h.forgetBrowser(world);
  if (h.reusesSessions(world) && h.SESSIONS.has(key)) {
    await world.context.addCookies(h.SESSIONS.get(key));
    const who = await h.signedInAs(world);
    if (who && h.same(who.id, account.username)) {
      // The server's own landing page for a logged-in account (its default app), as after a login.
      await h.open(world, '/');
      if (!(await onLoginPage(world))) {
        world.__ncUser = handle;
        return;
      }
    }
    h.SESSIONS.delete(key);
    await h.forgetBrowser(world);
  }
  await h.open(world, '/login');
  await sendLoginForm(world, account.username, account.password);
  if (await onLoginPage(world)) {
    const messages = await loginMessages(world);
    throw h.fail(world, `The site refused the login of "${handle}" (${account.username})${messages.length ? `: it says ${h.listed(messages)}` : ''}.`, 'Check the username and the password of the account in worldParameters.users of cucumber.js; the build of the site makes the accounts (ACCOUNTS_ONLY=1 of the build script gives them back their password).');
  }
  if (/\/login\/(?:selectchallenge|challenge)/.test(h.currentPath(world))) {
    throw h.fail(world, `The site asks "${handle}" for a second factor before it lets it in.`, 'An account a scenario logs in with has no second factor: turn it off for the account (occ twofactorauth:disable).');
  }
  await h.keepSession(world, handle);
  world.__ncUser = handle;
}

/**
 * Log in as an account of the users registry (worldParameters.users) and land where the site sends a logged-in
 * account (its default app): an account that logged in earlier in the run gets its session back; otherwise the
 * login form is filled in and sent.
 *
 * Example #1: Given I am a logged in user with the "user" user
 * Example #2: Given I am a logged in user with the "editor" user
 * Example #3: Given I am a logged in user with the "administrator" user
 * Example #4: Given we are a logged in user with the "user" user
 * Example #5: When I am a logged in user with the "editor" user
 */
Given(/^(?:I am|we are) a logged in user with the "([^"]*)" user$/, { timeout: 120000 }, async function (handle) {
  await logIn(this, handle);
});

/**
 * Make the browser a visitor: its cookies are dropped (the sessions on the server live on for a later scenario),
 * then the site's front page opens, which sends a visitor to the login page.
 *
 * Example #1: Given I am not logged in
 * Example #2: Given we are not logged in
 * Example #3: When I am not logged in
 * Example #4: Given I am not logged in
 *               Then I should be on the login page
 * Example #5: Given I am not logged in
 *               Then I should not be logged in
 */
Given(/^(?:I am|we are) not logged in$/, async function () {
  await h.forgetBrowser(this);
  await h.open(this, '/');
});

/**
 * Be a visitor on the login page: the browser's cookies dropped, then the login page opened.
 *
 * Example #1: Given I am on the login page
 * Example #2: Given we are on the login page
 * Example #3: Given I am on the login page
 *               When I log in with the username "user" and the password "Wrong-password-1"
 * Example #4: Given I am on the login page
 *               Then I should be on the login page
 * Example #5: When I am on the login page
 */
Given(/^(?:I am|we are) on the login page$/, async function () {
  await h.forgetBrowser(this);
  await h.open(this, '/login');
  if (!(await onLoginPage(this))) throw h.fail(this, `The login page did not open: ${await h.pageSummary(this)}.`, 'A visitor sees the login form at /login.');
});

/**
 * Go to the login page as a person does, with the browser as it is: a browser that is logged in already is sent
 * past it to the site, and the step says so.
 *
 * Example #1: When I go to the login page
 * Example #2: When we go to the login page
 * Example #3: When I go to the login page
 *               Then I should be on the login page
 * Example #4: When I go to the login page
 *               Then I should be on the login page
 * Example #5: And I go to the login page
 */
When(/^(?:I|we) go to the login page$/, async function () {
  await h.open(this, '/login');
  if (!(await onLoginPage(this))) {
    const who = await h.signedInAs(this);
    throw h.fail(this, `The login page did not open${who ? `: the browser is logged in as ${who.id}, and the site sent it on to ${h.currentPath(this)}` : `: ${await h.pageSummary(this)}`}.`, 'Start from "Given I am not logged in".');
  }
});

/**
 * Log in as an account of the users registry with the login form, always (no session taken over): the browser's
 * cookies are dropped first, the login page opened, the form filled in and sent; the step fails when the site
 * refuses the login.
 *
 * Example #1: When I log in as "user" with the login form
 * Example #2: When I log in as "editor" with the login form
 * Example #3: When I log in as "administrator" with the login form
 * Example #4: When we log in as "user" with the login form
 * Example #5: When I log in as "user" with the login form
 *               Then I should be logged in as "user"
 */
When(/^(?:I|we) log in as "([^"]*)" with the login form$/, { timeout: 120000 }, async function (handle) {
  const account = h.resolveUser(this, handle);
  if (!(await onLoginPage(this))) {
    await h.forgetBrowser(this);
    await h.open(this, '/login');
  }
  await sendLoginForm(this, account.username, account.password);
  if (await onLoginPage(this)) {
    const messages = await loginMessages(this);
    throw h.fail(this, `The site refused the login of "${handle}" (${account.username})${messages.length ? `: it says ${h.listed(messages)}` : ''}.`, 'Check the password of the account in worldParameters.users of cucumber.js.');
  }
  await h.keepSession(this, handle);
  this.__ncUser = handle;
});

/**
 * Fill the login form in with a username (or email address) and a password as given, and send it: for the
 * refusals. A handle of the users registry stands for its username.
 *
 * Example #1: When I log in with the username "user" and the password "Wrong-password-1"
 * Example #2: When I log in with the username "nobody" and the password "Wrong-password-1"
 * Example #3: When I log in with the username "user@example.com" and the password "Wrong-password-1"
 * Example #4: When we log in with the username "editor" and the password "Wrong-password-1"
 * Example #5: When I log in with the username "user" and the password "Wrong-password-1"
 *               Then the login should be refused with "Wrong login or password."
 */
When(/^(?:I|we) log in with the username "([^"]*)" and the password "([^"]*)"$/, async function (login, password) {
  const handle = h.handleOf(this, login);
  const username = handle && !login.includes('@') ? h.resolveUser(this, handle).username : login;
  if (!(await onLoginPage(this))) await h.open(this, '/login');
  await sendLoginForm(this, username, password);
});

/**
 * The site refused the login: the login form is on the page again, with the message (the words given, as a part of
 * the message under the fields).
 *
 * Example #1: Then the login should be refused with "Wrong login or password."
 * Example #2: Then the login should be refused with "Wrong login or password"
 * Example #3: And the login should be refused with "Wrong login or password."
 * Example #4: Then the login should be refused with "Wrong login or password."
 *               And I should not be logged in
 * Example #5: But the login should be refused with "Wrong login"
 */
Then(/^the login should be refused with "([^"]*)"$/, async function (message) {
  if (!(await onLoginPage(this))) {
    const who = await h.signedInAs(this);
    throw h.fail(this, `The login was not refused: ${who ? `the browser is logged in as ${who.id}` : await h.pageSummary(this)}.`, 'Check the password the scenario typed: a refusal keeps the login form on the page.');
  }
  await h.eventually(this, () => loginMessages(this), (list) => list.some((m) => h.mentions(m, message)), async (list) => ({
    message: `The login page does not say "${message}". It says ${h.listed(list)}.`,
    hint: 'The refusal is shown under the password field after the form comes back.',
  }));
});

/**
 * Log out with the user menu (its "Log out" link), as a person does; the server ends the session and shows the
 * login page. The session the run kept for the account is forgotten.
 *
 * Example #1: When I log out
 * Example #2: When we log out
 * Example #3: And I log out
 * Example #4: When I log out
 *               Then I should be on the login page
 * Example #5: When I log out
 *               Then I should not be logged in
 */
When(/^(?:I|we) log out$/, async function () {
  const page = this.page;
  if (!h.onSite(this, page.url()) || (await onLoginPage(this))) await h.open(this, '/');
  if (await onLoginPage(this)) throw h.fail(this, 'The browser is not logged in: there is nothing to log out of.', 'Log in first ("Given I am a logged in user with the "user" user").');
  const trigger = page.getByRole('button', { name: 'Settings menu' }).or(page.locator('#user-menu button.header-menu__trigger')).first();
  // A click on a menu that is open already would close it.
  if ((await trigger.getAttribute('aria-expanded').catch(() => null)) !== 'true') await trigger.click();
  const link = page.locator('#logout a, a[href*="/logout?"]').first();
  await link.waitFor({ state: 'visible', timeout: h.budget(this) }).catch(() => {});
  if (!(await link.isVisible().catch(() => false))) throw h.fail(this, `The user menu has no "Log out" link: ${await h.pageSummary(this)}.`, 'The user menu opens from the avatar at the right of the header.');
  await h.navigating(this, () => link.click());
  if (this.__ncUser) h.dropSession(this, h.resolveUser(this, this.__ncUser).username);
  this.__ncUser = null;
});

/**
 * The server says the browser is logged in (to any account).
 *
 * Example #1: Then I should be logged in
 * Example #2: Then we should be logged in
 * Example #3: And I should be logged in
 * Example #4: Then I should be logged in
 *               And I should be in the "Dashboard" app
 * Example #5: But I should be logged in
 */
Then(/^(?:I|we) should be logged in$/, async function () {
  const who = await h.signedInAs(this);
  if (!who) throw h.fail(this, `The browser is not logged in: ${await h.pageSummary(this)}.`, 'The server answers the account of the browser\'s session; a refused login or an ended session leaves none.');
});

/**
 * The server says the browser is logged in as an account of the users registry (by its username).
 *
 * Example #1: Then I should be logged in as "user"
 * Example #2: Then I should be logged in as "editor"
 * Example #3: Then I should be logged in as "administrator"
 * Example #4: Then we should be logged in as "user"
 * Example #5: And I should be logged in as "user"
 */
Then(/^(?:I|we) should be logged in as "([^"]*)"$/, async function (handle) {
  const account = h.resolveUser(this, handle);
  const who = await h.signedInAs(this);
  if (!who) throw h.fail(this, `The browser is not logged in, not as ${account.username} ("${handle}"): ${await h.pageSummary(this)}.`, 'Log in first, and check that the login was not refused.');
  if (!h.same(who.id, account.username)) throw h.fail(this, `The browser is logged in as ${who.id}, not as ${account.username} ("${handle}").`, 'A scenario that changes accounts logs in again with "Given I am a logged in user with the "…" user".');
});

/**
 * The server says the browser is not logged in.
 *
 * Example #1: Then I should not be logged in
 * Example #2: Then we should not be logged in
 * Example #3: And I should not be logged in
 * Example #4: Then I should not be logged in
 *               And I should be on the login page
 * Example #5: But I should not be logged in
 */
Then(/^(?:I|we) should not be logged in$/, async function () {
  const who = await h.signedInAs(this);
  if (who) throw h.fail(this, `The browser is logged in as ${who.id}.`, 'Log out first ("When I log out"), or start from "Given I am not logged in".');
});

/**
 * The login page is on screen: its address and its login form.
 *
 * Example #1: Then I should be on the login page
 * Example #2: Then we should be on the login page
 * Example #3: And I should be on the login page
 * Example #4: Then I should be on the login page
 *               And I should not be logged in
 * Example #5: Then I should be on the login page
 *               And I should not be logged in
 */
Then(/^(?:I|we) should be on the login page$/, async function () {
  await h.eventually(this, () => onLoginPage(this), Boolean, async () => ({
    message: `The login page is not on screen: ${await h.pageSummary(this)}.`,
    hint: 'A visitor is sent to /login, with the login form.',
  }));
});

module.exports = { logIn, onLoginPage, sendLoginForm, loginMessages };
