'use strict';

// The activity stream: its page, a filter of its navigation (By you, File changes, File shares, Favorites…), the
// newest activity and any activity of the list. The page asks the server for its activities (its own API) and
// draws them by day.

const { When, Then } = require('@cucumber/cucumber');
const h = require('./nextcloud-helpers');

/** The activities the page lists, newest first, as a person reads them ("You created meeting-notes.md"). */
async function activities(page) {
  return page.locator('li.activity-entry').evaluateAll((items) => items.map((i) => ((i.querySelector('.activity-entry__content__subject') || i).innerText || '').replace(/\s+/g, ' ').trim())).catch(() => []);
}

/** Wait until the activity page has drawn its list (or its empty note) after its request. */
async function activityReady(world) {
  await h.ready(world);
  const drawn = () => world.page.evaluate(() => [...document.querySelectorAll('main li.activity-entry, #app-content-vue li.activity-entry, main [role="note"], #app-content-vue .empty-content')].some((e) => e.getClientRects().length)).catch(() => false);
  await h.eventually(world, drawn, Boolean, async () => ({
    message: `The activity stream did not show its list: ${await h.pageSummary(world)}.`,
    hint: 'The activity page asks the server for the activities of the filter, then lists them by day.',
  }));
}

/**
 * Go to the activity stream (all activities).
 *
 * Example #1: When I go to the activity stream
 * Example #2: When we go to the activity stream
 * Example #3: And I go to the activity stream
 * Example #4: When I go to the activity stream
 *               Then the newest activity should be "You created meeting-notes.md"
 * Example #5: When I go to the activity stream
 *               Then the newest activity should be "You created meeting-notes.md"
 */
When(/^(?:I|we) go to the activity stream$/, async function () {
  await h.open(this, '/apps/activity/');
  await activityReady(this);
});

/**
 * Show the activities of one filter of the activity navigation, by its words: All activities, By you, By others,
 * Favorites, File changes, File shares, Security and the others it lists.
 *
 * Example #1: When I filter the activity stream by "File changes"
 * Example #2: When I filter the activity stream by "By you"
 * Example #3: When I filter the activity stream by "File shares"
 * Example #4: When we filter the activity stream by "Favorites"
 * Example #5: And I filter the activity stream by "All activities"
 */
When(/^(?:I|we) filter the activity stream by "([^"]*)"$/, async function (filter) {
  const page = this.page;
  if (!/\/apps\/activity/.test(h.currentPath(this))) await h.open(this, '/apps/activity/');
  const nav = page.getByRole('navigation', { name: 'Activity' }).first();
  const link = nav.getByRole('link', { name: filter, exact: true }).first();
  if (!(await link.isVisible().catch(() => false))) {
    const offered = await nav.getByRole('link').allInnerTexts().catch(() => []);
    throw h.fail(this, `The activity navigation has no filter "${filter}". It lists ${h.listed(offered)}.`, 'Name a filter by the words of its entry in the navigation.');
  }
  await h.answered(this, 'GET .*\\/apps\\/activity\\/api\\/v2\\/activity\\/', () => link.click(), { what: 'list the activities of the filter' });
  await activityReady(this);
});

/**
 * The newest activity of the stream on screen reads as given (the words a person reads, as the whole subject):
 * "You created meeting-notes.md", "You shared team-photo.png with Editor".
 *
 * Example #1: Then the newest activity should be "You created meeting-notes.md"
 * Example #2: Then the newest activity should be "You shared team-photo.png with Editor"
 * Example #3: And the newest activity should be "You deleted budget.txt"
 * Example #4: Then the newest activity should be "You renamed meeting-notes.md to minutes.md"
 * Example #5: Then the newest activity should be "You restored budget.txt"
 */
Then(/^the newest activity should be "([^"]*)"$/, async function (text) {
  await h.eventually(this, () => activities(this.page), (list) => list.length && h.same(list[0], text), async (list) => ({
    message: list.length ? `The newest activity is "${list[0]}", not "${text}".` : 'The activity stream lists no activity.',
    hint: 'The stream lists the newest first; an activity of the scenario is there once the action that made it was answered.',
  }));
});

/**
 * The activity stream on screen lists an activity (the words given, as a part of its subject) — or does not.
 *
 * Example #1: Then the activity stream should show "You created meeting-notes.md"
 * Example #2: Then the activity stream should show "with Editor"
 * Example #3: Then the activity stream should not show "You deleted meeting-notes.md"
 * Example #4: And the activity stream should show "You restored"
 * Example #5: But the activity stream should not show "shared"
 */
Then(/^the activity stream should( not)? show "([^"]*)"$/, async function (not, text) {
  const has = (list) => list.some((a) => h.mentions(a, text));
  await h.eventually(this, () => activities(this.page), (list) => (not ? !has(list) : has(list)), async (list) => ({
    message: not ? `The activity stream shows "${text}".` : `The activity stream does not show "${text}". Its newest are ${h.listed(list.slice(0, 6))}.`,
    hint: 'The stream lists the activities of the filter on screen, the newest first.',
  }));
});
