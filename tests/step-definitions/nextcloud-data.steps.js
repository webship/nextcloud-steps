'use strict';

// Test data, made through the server's own APIs as the account it belongs to (WebDAV and OCS, in sessions of their
// own): a file uploaded from the fixtures, a folder, a file shared with another account. What these steps make is
// removed after the scenario. A suite never makes or deletes an account.

const path = require('path');
const fs = require('fs');
const { Given } = require('@cucumber/cucumber');
const h = require('./nextcloud-helpers');

/** Make the folders of a path of an account's files that are not there yet (WebDAV MKCOL, one level at a time). */
async function ensureFolder(world, client, folder) {
  const parts = String(folder || '').split('/').filter(Boolean);
  for (let i = 1; i <= parts.length; i += 1) {
    const sub = parts.slice(0, i).join('/');
    const res = await client.dav('MKCOL', sub);
    if (![201, 405].includes(res.status())) throw h.fail(world, `The folder "${sub}" of ${client.account.username} could not be made: the server answered ${res.status()}.`, 'Check the account\'s quota and the name of the folder.');
  }
}

/** Upload a fixture into a folder of an account's files (WebDAV PUT); returns the path of the file. */
async function putFile(world, client, name, folder) {
  const file = h.fixture(world, name);
  const target = [...String(folder || '').split('/').filter(Boolean), path.basename(file)].join('/');
  const res = await client.dav('PUT', target, { data: fs.readFileSync(file) });
  if (![201, 204].includes(res.status())) throw h.fail(world, `"${target}" could not be uploaded for ${client.account.username}: the server answered ${res.status()}.`, 'Check the account\'s quota and the server\'s upload limits.');
  return target;
}

/**
 * Give an account of the registry a file of the fixtures, at the top of its files or in a folder (made when it is
 * not there), as test data. The file is removed after the scenario.
 *
 * Example #1: Given "user" has the file "meeting-notes.md"
 * Example #2: Given "user" has the file "team-photo.png" in the folder "Project files"
 * Example #3: Given "editor" has the file "annual-report.pdf"
 * Example #4: And "user" has the file "budget.txt" in the folder "Project files/Reports"
 * Example #5: Given "administrator" has the file "meeting-notes.md"
 */
Given(/^"([^"]*)" has the file "([^"]*)"(?: in the folder "([^"]*)")?$/, async function (handle, name, folder) {
  await h.trackFiles(this, handle);
  const client = await h.api(this, handle);
  if (folder) await ensureFolder(this, client, folder);
  await putFile(this, client, name, folder);
});

/**
 * Give an account of the registry a folder (by its path from the top; the folders above it are made too), as test
 * data. The folder is removed after the scenario.
 *
 * Example #1: Given "user" has the folder "Project files"
 * Example #2: Given "user" has the folder "Project files/Reports"
 * Example #3: Given "editor" has the folder "Archive"
 * Example #4: And "user" has the folder "Meeting minutes"
 * Example #5: Given "administrator" has the folder "Project files"
 */
Given(/^"([^"]*)" has the folder "([^"]*)"$/, async function (handle, folder) {
  await h.trackFiles(this, handle);
  const client = await h.api(this, handle);
  await ensureFolder(this, client, folder);
});

/**
 * As test data, an account of the registry has shared one of its files (by its path from the top; uploaded from the
 * fixtures when it does not have it) with another account of the registry, through the server's sharing API. The
 * file and the share are removed after the scenario.
 *
 * Example #1: Given "user" has shared the file "meeting-notes.md" with "editor"
 * Example #2: Given "user" has shared the file "Project files/team-photo.png" with "editor"
 * Example #3: Given "editor" has shared the file "annual-report.pdf" with "user"
 * Example #4: And "user" has shared the file "budget.txt" with "administrator"
 * Example #5: Given "administrator" has shared the file "meeting-notes.md" with "user"
 */
Given(/^"([^"]*)" has shared the file "([^"]*)" with "([^"]*)"$/, async function (handle, filePath, recipientHandle) {
  await h.trackFiles(this, handle);
  const client = await h.api(this, handle);
  const recipient = h.resolveUser(this, recipientHandle);
  const parts = String(filePath).split('/').filter(Boolean);
  const head = await client.dav('PROPFIND', parts.join('/'), { headers: { Depth: '0' } });
  let target = parts.join('/');
  if (head.status() === 404) {
    const folder = parts.slice(0, -1).join('/');
    if (folder) await ensureFolder(this, client, folder);
    target = await putFile(this, client, parts[parts.length - 1], folder);
  }
  const res = await client.ocs('POST', '/apps/files_sharing/api/v1/shares', { path: `/${target}`, shareType: 0, shareWith: recipient.username });
  if (!res.ok) throw h.fail(this, `"${target}" of ${client.account.username} could not be shared with ${recipient.username}: the server answered ${res.status} ${res.message}.`, 'Sharing with accounts is on in the server\'s sharing settings, and the account may share the file.');
});
