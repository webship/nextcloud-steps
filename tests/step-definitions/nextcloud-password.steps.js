'use strict';

// The forgotten password: the reset asked for on the login page, the mail it sends (read from the mail catcher of
// the site), its link opened, and a new password chosen. The registry's password is put back after the scenario.

const { When, Then } = require('@cucumber/cucumber');
const h = require('./nextcloud-helpers');
const session = require('./nextcloud-session.steps');

/**
 * Ask for a password reset link on the login page ("Forgot password?", the login or email, "Reset password"); the
 * step waits for the server's answer and for its note. A handle of the users registry stands for its username;
 * anything else is typed as it is.
 *
 * Example #1: When I ask for a password reset link for "user"
 * Example #2: When I ask for a password reset link for "editor"
 * Example #3: When I ask for a password reset link for "nobody@example.com"
 * Example #4: When we ask for a password reset link for "user"
 * Example #5: When I ask for a password reset link for "user"
 *               Then an email about "password reset" should be sent to "user"
 */
When(/^(?:I|we) ask for a password reset link for "([^"]*)"$/, async function (who) {
  const page = this.page;
  const handle = h.handleOf(this, who);
  const login = handle && !who.includes('@') ? h.resolveUser(this, handle).username : who;
  if (!(await session.onLoginPage(this))) await h.open(this, '/login');
  await page.getByRole('button', { name: 'Forgot password?', exact: true }).or(page.locator('#lost-password')).first().click();
  const field = page.getByRole('textbox', { name: 'Login or email', exact: true }).first();
  await field.waitFor({ state: 'visible', timeout: h.budget(this) });
  await field.fill(login);
  await h.answered(this, 'POST .*\\/lostpassword\\/email', () => page.getByRole('button', { name: 'Reset password', exact: true }).first().click(), { what: 'send the reset link' });
  await h.eventually(this, () => page.locator('[role="note"], .notecard').first().isVisible().catch(() => false), Boolean, async () => ({ message: `The login page says nothing after "Reset password": ${await h.pageSummary(this)}.`, hint: 'The server answers every request the same way ("If this account exists, a password reset message has been sent…").' }));
});

/**
 * A mail came to an account of the registry (or an address) since the scenario began whose subject has the words
 * given ("password reset"), as the mail catcher of the site has it.
 *
 * Example #1: Then an email about "password reset" should be sent to "user"
 * Example #2: Then an email about "password reset" should be sent to "editor"
 * Example #3: And an email about "password reset" should be sent to "user@example.com"
 * Example #4: Then an email about "password reset" should be sent to "user"
 *               When I open the password reset link of the email to "user"
 * Example #5: Then an email about "reset" should be sent to "user"
 */
Then(/^an email about "([^"]*)" should be sent to "([^"]*)"$/, async function (words, who) {
  const address = h.addressOf(this, who);
  await h.eventually(this, () => h.mailSince(this, address), (list) => list.some((m) => h.mentions(m.Subject, words)), async (list) => ({
    message: `No mail about "${words}" came to ${address} in this scenario. ${list.length ? `It got ${h.listed(list.map((m) => m.Subject))}.` : 'It got none.'}`,
    hint: 'The site sends its mail to the mail catcher of worldParameters.mailUrl; check the mail settings of the site (its SMTP server).',
  }));
});

/**
 * No mail came to an address (or an account of the registry) since the scenario began: the server answers every
 * reset the same way, and sends a mail only to an account that exists.
 *
 * Example #1: Then no email should be sent to "nobody@example.com"
 * Example #2: Then no email should be sent to "user"
 * Example #3: And no email should be sent to "nobody@example.com"
 * Example #4: Then no email should be sent to "nobody@example.com"
 *               And I should not be logged in
 * Example #5: But no email should be sent to "editor"
 */
Then(/^no email should be sent to "([^"]*)"$/, async function (who) {
  const address = h.addressOf(this, who);
  const list = await h.mailSince(this, address);
  if (list.length) throw h.fail(this, `A mail came to ${address} in this scenario: ${h.listed(list.map((m) => m.Subject))}.`, 'The server sends the reset mail only to an account it has.');
});

/**
 * Open the password reset link of the newest mail about the password reset to an account of the registry, as a
 * person does from their mailbox.
 *
 * Example #1: When I open the password reset link of the email to "user"
 * Example #2: When I open the password reset link of the email to "editor"
 * Example #3: When we open the password reset link of the email to "user"
 * Example #4: And I open the password reset link of the email to "user"
 * Example #5: When I open the password reset link of the email to "user"
 *               And I choose the new password "Webship-New-Pass-1"
 */
When(/^(?:I|we) open the password reset link of the email to "([^"]*)"$/, async function (who) {
  const handle = h.handleOf(this, who);
  const address = h.addressOf(this, who);
  const list = await h.eventually(this, () => h.mailSince(this, address), (l) => l.length > 0, async () => ({ message: `No mail came to ${address} in this scenario.`, hint: 'Ask for the link first ("When I ask for a password reset link for "…""). With its rate limits on, the server sends an account at most five reset mails in thirty minutes.' }));
  let link = null;
  for (const m of list) {
    const message = await h.mailMessage(this, m.ID);
    link = h.mailLinks(message).find((l) => /\/lostpassword\/reset\/form\//.test(l.href));
    if (link) break;
  }
  if (!link) throw h.fail(this, `No mail to ${address} has a password reset link.`, 'The reset mail has a link to /lostpassword/reset/form/….');
  this.__ncResetFor = handle;
  await h.open(this, link.href);
});

/**
 * Choose a new password on the page of the reset link ("New password", "Reset password"); the server takes it and
 * sends the browser to the login page. Later steps of the scenario log in with it; the registry's password is put
 * back after the scenario.
 *
 * Example #1: When I choose the new password "Webship-New-Pass-1"
 * Example #2: When we choose the new password "Webship-New-Pass-1"
 * Example #3: And I choose the new password "Another-New-Pass-2"
 * Example #4: When I choose the new password "Webship-New-Pass-1"
 *               Then I should be on the login page
 * Example #5: When I choose the new password "Webship-New-Pass-3"
 */
When(/^(?:I|we) choose the new password "([^"]*)"$/, async function (password) {
  const page = this.page;
  const field = page.getByRole('textbox', { name: 'New password', exact: true }).first();
  if (!(await field.isVisible().catch(() => false))) throw h.fail(this, `The page of the reset link has no "New password": ${await h.pageSummary(this)}.`, 'Open the link of the mail first ("When I open the password reset link of the email to "…"").');
  if (this.__ncResetFor) h.restorePasswordAfter(this, this.__ncResetFor);
  await field.fill(password);
  const res = await h.answered(this, 'POST .*\\/lostpassword\\/set\\/', () => page.getByRole('button', { name: 'Reset password', exact: true }).first().click(), { what: 'set the new password' });
  const answer = await res.json().catch(() => ({}));
  if (res.status() >= 300 || answer.status === 'error') throw h.fail(this, `The server did not take the new password: ${answer.msg || answer.message || res.status()}.`, 'The password must pass the server\'s password policy; a link is used once.');
  await h.eventually(this, () => session.onLoginPage(this), Boolean, async () => ({ message: `The site did not go back to the login page after the reset: ${await h.pageSummary(this)}.`, hint: 'A reset ends on the login page.' }));
  if (this.__ncResetFor) h.passwordChanged(this, this.__ncResetFor, password);
});
