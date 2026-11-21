'use strict';

// The personal settings of an account: their sections, a field of "Profile & contact" (saved by itself as it is
// typed), the password change of "Security" and its refusal, and the theme of "Appearance and accessibility". What a
// scenario changes (a field, the password, the theme) is put back after it.

const { When, Then } = require('@cucumber/cucumber');
const h = require('./nextcloud-helpers');

/** The keys of the account properties of "Profile & contact", by the label of their field. */
const PROPERTIES = {
  'full name': 'displayname', pronouns: 'pronouns', location: 'address', headline: 'headline', about: 'biography',
  organisation: 'organisation', organization: 'organisation', role: 'role', 'phone number': 'phone', website: 'website',
  'fediverse (e.g. mastodon)': 'fediverse', bluesky: 'bluesky', 'x (formerly twitter)': 'twitter', 'primary email address': 'email',
};

/**
 * Go to the personal settings of the account ("Profile & contact").
 *
 * Example #1: When I go to the personal settings
 * Example #2: When we go to the personal settings
 * Example #3: And I go to the personal settings
 * Example #4: When I go to the personal settings
 *               And I set my "Headline" to "Planning lead"
 * Example #5: When I go to the personal settings
 *               And I open the "Security" section of the personal settings
 */
When(/^(?:I|we) go to the personal settings$/, async function () {
  await h.open(this, '/settings/user');
  if (!(await this.page.locator('#app-navigation-vue, nav').first().isVisible().catch(() => false))) throw h.fail(this, `The personal settings did not open: ${await h.pageSummary(this)}.`, 'Log in first: the personal settings belong to an account.');
});

/**
 * Open a section of the personal settings by the words of its entry in the navigation: Profile & contact, Language
 * & locale, Security, Notifications, Appearance and accessibility, Sharing, Availability, Privacy.
 *
 * Example #1: When I open the "Security" section of the personal settings
 * Example #2: When I open the "Appearance and accessibility" section of the personal settings
 * Example #3: When I open the "Profile & contact" section of the personal settings
 * Example #4: When we open the "Sharing" section of the personal settings
 * Example #5: And I open the "Notifications" section of the personal settings
 */
When(/^(?:I|we) open the "([^"]*)" section of the personal settings$/, async function (section) {
  const page = this.page;
  if (!/^\/settings\/user/.test(h.currentPath(this))) await h.open(this, '/settings/user');
  const nav = page.locator('#app-navigation-vue').first();
  const link = nav.getByRole('link', { name: section, exact: true }).first();
  if (!(await link.isVisible().catch(() => false))) {
    const offered = await nav.getByRole('link').allInnerTexts().catch(() => []);
    throw h.fail(this, `The personal settings have no section "${section}". They list ${h.listed(offered)}.`, 'Name a section by the words of its entry in the navigation.');
  }
  await h.navigating(this, () => link.click());
});

/** A field of the settings page by its label. */
function settingsField(page, label) {
  return page.getByRole('textbox', { name: label, exact: true }).first();
}

/**
 * Set a field of "Profile & contact" (Full name, Headline, Organisation, Role, Location, Phone number, Website…), as
 * a person does: the field changed; the page saves it by itself a moment later, and the step waits for the server
 * and for the field's check mark. The value the account had is put back after the scenario.
 *
 * Example #1: When I set my "Headline" to "Planning lead"
 * Example #2: When I set my "Organisation" to "Webship"
 * Example #3: When I set my "Role" to "Coordinator"
 * Example #4: When I set my "Location" to "Amman"
 * Example #5: When we set my "Full name" to "User Webship"
 */
When(/^(?:I|we) set my "([^"]*)" to "([^"]*)"$/, async function (label, value) {
  const page = this.page;
  const handle = h.currentHandle(this, 'Changing the profile');
  if (!/^\/settings\/user(?:\/profile-contact)?$/.test(h.currentPath(this).replace(/\?.*$/, ''))) await h.open(this, '/settings/user');
  const field = settingsField(page, label);
  if (!(await field.isVisible().catch(() => false))) {
    const offered = await page.locator('main input[type="text"], main input[type="email"], main input[type="tel"], main input[type="url"], main textarea').evaluateAll((fs) => fs.map((f) => (f.labels && f.labels[0] ? f.labels[0].innerText.trim() : f.id)));
    throw h.fail(this, `The profile has no field "${label}". It has ${h.listed(offered)}.`, 'Name a field of "Profile & contact" by its label.');
  }
  const key = PROPERTIES[h.normal(label)];
  if (key && h.cleansUp(this)) {
    const client = await h.api(this, handle);
    const before = await field.inputValue();
    h.afterScenario(this, `profile:${handle}:${key}`, async () => {
      const res = await client.ocs('PUT', `/cloud/users/${encodeURIComponent(client.account.username)}`, { key, value: before });
      if (!res.ok) throw new Error(`the ${label} of ${client.account.username} could not be put back: ${res.status} ${res.message}`);
    });
  }
  await h.answered(this, 'PUT .*\\/ocs\\/v2\\.php\\/cloud\\/users\\/', () => field.fill(value), { what: `save the ${label}` });
  // The field's own box (class "input-field", not its inner wrapper) takes the --success or --error mark.
  const wrapper = field.locator('xpath=ancestor::*[contains(concat(" ", normalize-space(@class), " "), " input-field ")][1]');
  await h.eventually(this, async () => (await wrapper.getAttribute('class').catch(() => '')) || '', (c) => /--success/.test(c) || /--error/.test(c), async () => ({ message: `The ${label} shows no sign that it was saved.`, hint: 'A field of the profile shows a check mark once the server saved it.' }));
  if (/--error/.test((await wrapper.getAttribute('class').catch(() => '')) || '')) {
    const said = h.clean(await wrapper.innerText().catch(() => ''));
    throw h.fail(this, `The server refused the ${label} "${value}"${said ? `: "${said}"` : ''}.`, 'The field shows the server\'s refusal under it.');
  }
});

/**
 * A field of "Profile & contact" holds a value (as the page shows it after a reload: what the server saved).
 *
 * Example #1: Then my "Headline" should be "Planning lead"
 * Example #2: Then my "Organisation" should be "Webship"
 * Example #3: Then my "Full name" should be "User"
 * Example #4: And my "Role" should be "Coordinator"
 * Example #5: Then my "Primary email address" should be "user@example.com"
 */
Then(/^my "([^"]*)" should be "([^"]*)"$/, async function (label, value) {
  await h.open(this, '/settings/user');
  const field = settingsField(this.page, label);
  if (!(await field.isVisible().catch(() => false))) throw h.fail(this, `The profile has no field "${label}".`, 'Name a field of "Profile & contact" by its label.');
  await h.eventually(this, () => field.inputValue(), (v) => v === value, async (v) => ({ message: `The ${label} is "${v}", not "${value}".`, hint: 'The value comes from the server when the page loads.' }));
});

/** Fill in the password form of "Security" and send it; returns the server's answer. */
async function changePassword(world, current, next) {
  const page = world.page;
  if (!/^\/settings\/user\/security/.test(h.currentPath(world))) await h.open(world, '/settings/user/security');
  const now = page.getByRole('textbox', { name: 'Current password', exact: true }).first();
  if (!(await now.isVisible().catch(() => false))) throw h.fail(world, `The password form is not on the page: ${await h.pageSummary(world)}.`, 'It is in the "Security" section of the personal settings.');
  await now.fill(current);
  await page.getByRole('textbox', { name: 'New password', exact: true }).first().fill(next);
  const button = page.getByRole('button', { name: 'Change password', exact: true }).first();
  const res = await h.answered(world, 'POST .*\\/settings\\/personal\\/changepassword', () => button.click(), { what: 'change the password' });
  return res.json().catch(() => ({}));
}

/**
 * Change the account's password in "Security", with its current password: the step types the password the account
 * has, then the new one. Later steps of the scenario log in with the new password; the registry's password is put
 * back after the scenario.
 *
 * Example #1: When I change my password to "Webship-Changed-2026"
 * Example #2: When we change my password to "Webship-Changed-2026"
 * Example #3: And I change my password to "Another-Changed-2026"
 * Example #4: When I change my password to "Webship-Changed-2026"
 *               And I log out
 * Example #5: When I change my password to "Webship-Changed-2027"
 */
When(/^(?:I|we) change my password to "([^"]*)"$/, async function (password) {
  const handle = h.currentHandle(this, 'Changing the password');
  const account = h.resolveUser(this, handle);
  h.restorePasswordAfter(this, handle);
  const answer = await changePassword(this, account.password, password);
  if (answer.status !== 'success') throw h.fail(this, `The password was not changed: the server says "${(answer.data && answer.data.message) || JSON.stringify(answer).slice(0, 120)}".`, 'The new password must pass the server\'s password policy (length, common passwords).');
  h.passwordChanged(this, handle, password);
});

/**
 * Try to change the account's password in "Security" with a current password that is wrong: for the refusal (the
 * message "Wrong password" pops up; the password stays as it was).
 *
 * Example #1: When I change my password with the wrong current password "Wrong-password-1"
 * Example #2: When we change my password with the wrong current password "Wrong-password-1"
 * Example #3: And I change my password with the wrong current password "Not-my-password-2"
 * Example #4: When I change my password with the wrong current password "Wrong-password-1"
 *               Then a message "Wrong password" should pop up
 * Example #5: When I change my password with the wrong current password "Wrong-password-3"
 */
When(/^(?:I|we) change my password with the wrong current password "([^"]*)"$/, async function (wrong) {
  const handle = h.currentHandle(this, 'Changing the password');
  h.restorePasswordAfter(this, handle);
  const answer = await changePassword(this, wrong, h.newPassword());
  if (answer.status === 'success') throw h.fail(this, `The server changed the password with the current password "${wrong}".`, 'Check that the wrong password is not the account\'s password.');
});

/** The themes of "Appearance and accessibility": the item of a theme by its heading. */
function themeItem(page, theme) {
  return page.locator('li').filter({ has: page.getByRole('heading', { name: theme, exact: true }) }).first();
}

/**
 * Choose a theme in "Appearance and accessibility" (System default theme, Light theme, Dark theme, High contrast
 * mode, Dark theme with high contrast mode); the step waits for the server and for the page to take it. The theme
 * the account had is put back after the scenario.
 *
 * Example #1: When I choose the "Dark theme" appearance
 * Example #2: When I choose the "Light theme" appearance
 * Example #3: When I choose the "High contrast mode" appearance
 * Example #4: When we choose the "System default theme" appearance
 * Example #5: And I choose the "Dark theme with high contrast mode" appearance
 */
When(/^(?:I|we) choose the "([^"]*)" appearance$/, async function (theme) {
  const page = this.page;
  const handle = h.currentHandle(this, 'Changing the appearance');
  if (!/^\/settings\/user\/theming/.test(h.currentPath(this))) await h.open(this, '/settings/user/theming');
  const item = themeItem(page, theme);
  if (!(await item.isVisible().catch(() => false))) {
    const offered = await page.getByRole('list', { name: 'Themes' }).getByRole('heading').allInnerTexts().catch(() => []);
    throw h.fail(this, `There is no theme "${theme}". The themes are ${h.listed(offered)}.`, 'Name a theme by its heading in "Appearance and accessibility".');
  }
  if (h.cleansUp(this)) {
    const before = await page.getByRole('list', { name: 'Themes' }).locator('input[type="radio"]:checked').first().getAttribute('value').catch(() => 'default');
    const client = await h.api(this, handle);
    h.afterScenario(this, `theme:${handle}`, async () => { await client.ocs('PUT', `/apps/theming/api/v1/theme/${encodeURIComponent(before || 'default')}/enable`); });
  }
  const radio = item.locator('input[type="radio"]').first();
  if (await radio.isChecked().catch(() => false)) return;
  await h.answered(this, 'PUT .*\\/apps\\/theming\\/api\\/v1\\/theme\\/[^/]+\\/enable', () => item.locator('.checkbox-radio-switch__content, label').first().click(), { what: 'choose the theme' });
});

/**
 * The theme named is the one in use: its choice is ticked, and the page wears it (the body's themes).
 *
 * Example #1: Then the "Dark theme" appearance should be in use
 * Example #2: Then the "System default theme" appearance should be in use
 * Example #3: And the "Light theme" appearance should be in use
 * Example #4: Then the "Dark theme" appearance should be in use
 *               When I choose the "System default theme" appearance
 * Example #5: Then the "High contrast mode" appearance should be in use
 */
Then(/^the "([^"]*)" appearance should be in use$/, async function (theme) {
  const page = this.page;
  if (!/^\/settings\/user\/theming/.test(h.currentPath(this))) await h.open(this, '/settings/user/theming');
  const item = themeItem(page, theme);
  if (!(await item.isVisible().catch(() => false))) throw h.fail(this, `There is no theme "${theme}".`, 'Name a theme by its heading in "Appearance and accessibility".');
  const radio = item.locator('input[type="radio"]').first();
  const value = await radio.getAttribute('value');
  await h.eventually(this, async () => ({ checked: await radio.isChecked().catch(() => false), worn: await page.evaluate(() => document.body.dataset.themes || '') }), (s) => s.checked && s.worn.split(',').includes(value), async (s) => ({ message: `The "${theme}" appearance is not in use: it is ${s.checked ? '' : 'not '}ticked, and the page wears "${s.worn}".`, hint: 'Choose it first ("When I choose the "…" appearance").' }));
});
