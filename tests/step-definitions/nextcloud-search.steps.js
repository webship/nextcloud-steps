'use strict';

// The unified search of the header ("Apps, files, messages, and more"): a term typed, the results of each provider
// under its heading (Files, Apps, Settings), no result, and a result opened. A step waits for the search requests
// of every provider and for the status that counts the results.

const { When, Then } = require('@cucumber/cucumber');
const h = require('./nextcloud-helpers');

/** The search box of the header. */
function searchBox(page) {
  return page.getByRole('combobox', { name: 'Apps, files, messages, and more' }).or(page.locator('header input[type="search"], header [role="search"] input')).first();
}

/** The status line of the results ("2 results", "No matching results"). */
async function resultStatus(page) {
  return h.clean(await page.locator('header [role="status"]').first().innerText({ timeout: 500 }).catch(() => ''));
}

/** The results by provider: { Files: ['a', 'b'], Apps: [...] }. */
async function results(page) {
  return page.evaluate(() => {
    const out = {};
    for (const box of document.querySelectorAll('header [role="listbox"]')) {
      // The listbox is named by its heading (aria-labelledby), as a screen reader reads it.
      const by = (box.getAttribute('aria-labelledby') || '').split(/\s+/).map((id) => document.getElementById(id)).filter(Boolean).map((e) => e.textContent.trim()).join(' ');
      const heading = box.previousElementSibling && /^H[1-6]$/.test(box.previousElementSibling.tagName) ? box.previousElementSibling.textContent.trim() : '';
      const name = box.getAttribute('aria-label') || by || heading;
      out[name] = [...box.querySelectorAll('[role="option"]')].map((o) => (o.querySelector('a') || o).innerText.replace(/\s+/g, ' ').trim());
    }
    return out;
  }).catch(() => ({}));
}

/**
 * Search for a term with the unified search of the header, as a person does: the box clicked, the term typed. The
 * step waits for every provider's search request and for the status line of the results.
 *
 * Example #1: When I search for "team" in the unified search
 * Example #2: When I search for "annual" in the unified search
 * Example #3: When we search for "meeting" in the unified search
 * Example #4: And I search for "budget" in the unified search
 * Example #5: When I search for "no such thing" in the unified search
 */
When(/^(?:I|we) search for "([^"]*)" in the unified search$/, async function (term) {
  const page = this.page;
  if (!h.onSite(this, page.url()) || /\/login/.test(h.currentPath(this))) await h.open(this, '/');
  const box = searchBox(page);
  if (!(await box.isVisible().catch(() => false))) throw h.fail(this, `The page has no unified search: ${await h.pageSummary(this)}.`, 'The unified search is in the header of every app page of a logged-in account.');
  await box.click();
  await box.fill('');
  const last = page.waitForResponse((r) => /\/ocs\/v2\.php\/search\/providers\/[^/]+\/search\?/.test(r.url()) && decodeURIComponent(r.url()).includes(`term=${term}`), { timeout: h.budget(this) }).catch(() => null);
  await box.fill(term);
  await last;
  await h.settled(this);
  await h.eventually(this, () => resultStatus(page), (s) => /result/i.test(s), async (s) => ({ message: `The unified search for "${term}" shows no status of its results${s ? ` ("${s}")` : ''}.`, hint: 'The results show under the box once every provider answered.' }));
});

/**
 * The unified search found a result under a provider's heading (Files, Apps, Settings) — or did not.
 *
 * Example #1: Then the unified search should find "team-photo.png" in "Files"
 * Example #2: Then the unified search should find "Teams" in "Apps"
 * Example #3: Then the unified search should not find "budget.txt" in "Files"
 * Example #4: And the unified search should find "annual-report.pdf" in "Files"
 * Example #5: Then the unified search should find "Security" in "Settings"
 */
Then(/^the unified search should( not)? find "([^"]*)" in "([^"]*)"$/, async function (not, name, provider) {
  const page = this.page;
  const has = (r) => (r[provider] || []).some((t) => h.same(t, name) || h.mentions(t, name));
  await h.eventually(this, () => results(page), (r) => (not ? !has(r) : has(r)), async (r) => ({
    message: not ? `The unified search found "${name}" in "${provider}".` : `The unified search did not find "${name}" in "${provider}". It shows ${Object.keys(r).length ? Object.entries(r).map(([k, v]) => `${k}: ${h.listed(v)}`).join('; ') : 'no result'}.`,
    hint: 'Search first ("When I search for "…" in the unified search"); a file is found by its name in the account\'s files.',
  }));
});

/**
 * The unified search found nothing ("No matching results").
 *
 * Example #1: Then the unified search should find nothing
 * Example #2: And the unified search should find nothing
 * Example #3: Then the unified search should find nothing
 *               And the unified search should not find "budget.txt" in "Files"
 * Example #4: But the unified search should find nothing
 * Example #5: Then the unified search should find nothing
 *               And the unified search should not find "budget.txt" in "Files"
 */
Then(/^the unified search should find nothing$/, async function () {
  const page = this.page;
  await h.eventually(this, () => resultStatus(page), (s) => /no matching results|no results/i.test(s), async (s) => ({ message: `The unified search found something: "${s}" (${Object.entries(await results(page)).map(([k, v]) => `${k}: ${h.listed(v)}`).join('; ')}).`, hint: 'Search for a term no file, app or setting has.' }));
});

/**
 * Open a result of the unified search by its words (a file opens in the Files app, in the viewer when it can).
 *
 * Example #1: When I open the search result "team-photo.png"
 * Example #2: When I open the search result "annual-report.pdf"
 * Example #3: When we open the search result "Teams"
 * Example #4: And I open the search result "meeting-notes.md"
 * Example #5: When I open the search result "Security"
 */
When(/^(?:I|we) open the search result "([^"]*)"$/, async function (name) {
  const page = this.page;
  const link = page.locator('header [role="listbox"] [role="option"] a').filter({ hasText: name }).first();
  if (!(await link.isVisible().catch(() => false))) {
    throw h.fail(this, `The unified search shows no result "${name}". It shows ${Object.entries(await results(page)).map(([k, v]) => `${k}: ${h.listed(v)}`).join('; ') || 'nothing'}.`, 'Search first ("When I search for "…" in the unified search").');
  }
  const before = page.url();
  await link.click();
  await h.eventually(this, async () => page.url(), (u) => u !== before, async () => ({ message: `The result "${name}" did not open.`, hint: 'A result is a link to the file, the app or the setting.' }));
  await h.settled(this);
});
