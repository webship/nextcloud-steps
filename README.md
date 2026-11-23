<p align="center"><img src="https://raw.githubusercontent.com/webship/nextcloud-steps/2.0.x/assets/logo.svg" alt="Nextcloud logo" width="96"></p>

# nextcloud-steps

[![Test](https://github.com/webship/nextcloud-steps/actions/workflows/test.yml/badge.svg)](https://github.com/webship/nextcloud-steps/actions/workflows/test.yml)

Cucumber step definitions for testing a Nextcloud file and collaboration server, with
[webship-js](https://webship.co/docs/webship-js/2.0.x), a BDD browser automation harness built on Playwright and
Cucumber-js.

A file server is several single-page apps under one header: Files, the dashboard, the activity stream, the
settings, the viewers. `@webship-js/nextcloud-steps` covers what its people do there:

- **the session**: logging in with the login form (or taking over the account's session from earlier in the run),
  the form's refusal, logging out, who the server says is logged in; the forgotten password, with its mail read
  from the mail catcher of the site, its link and a new password;
- **the header**: the apps menu and the app on screen, the user menu (an administrator's offers more), the online
  status, the server's error pages ("Access forbidden", "Page not found");
- **the dashboard**: its greeting, its widgets, a widget added or removed with "Customize", what a widget lists;
- **Files**: a folder opened, the views of the navigation (Favorites, Shared with you, Recent…), uploading, a new
  folder, renaming, moving and copying into a folder, deleting and restoring from the deleted files, favorites, the
  details sidebar and its tabs, and the messages that pop up after an action;
- **sharing**: a file shared with an account of the site (its permission chosen), a public link with a password and
  an expiration date, the link opened by a visitor in a browser of its own, the password page and its refusal;
- **the viewers**: a picture, a PDF (its pages and its text) and a text file in the text editor;
- **the unified search** of the header: a file or an app found, nothing found, a result opened;
- **notifications**: the menu, a notification dismissed, all of them dismissed;
- **the activity stream**: its filters, its newest activity;
- **the personal settings**: a field of the profile (saved by itself as it is typed), the password changed and
  refused, the theme;
- **the accounts page** of an administrator, read only or with its refusals: the list, an account's groups, the
  search, the administrators, a taken name refused, and an account without the right refused the page;
- **test data**: a file, a folder, a share or a notification given to an account through the server's own APIs;
  whatever a scenario adds or changes (files, folders, shares, notifications, a field of the profile, the theme,
  the status, the dashboard, a password) is taken back after it.

No step phrase names the platform: a scenario reads `When I share "meeting-notes.md" with "editor" as "View only"`
and `Then the shared file "team-photo.png" should be shown`.

CI builds a real site with [DDEV](https://ddev.com) on the runner (the server's release tarball, installed with its
own installer on the project's database, the accounts of [Test users](#test-users)), and runs the whole suite
against it twice on every push and pull request, then the assertions that must fail; see
[`.github/workflows/test.yml`](.github/workflows/test.yml).

## From nothing to a green run

What the machine needs: Docker, [DDEV](https://ddev.com), git, Python 3, and Node.js 24 or later with npm. The
server runs in the project's containers: no PHP on the machine, no public domain and no account anywhere. The
release tarball is about 240 MB and the site about 1 GB on disk.

**1. The site.** The pack's own build script (the one CI runs) makes a DDEV project with the server (Nextcloud
Server 35.0.3, from its release tarball, its SHA-256 sum checked), installs it with its own installer on the
project's database, sets it up for testing (see [A test site](#a-test-site)) and adds the accounts of
[Test users](#test-users). It takes a few minutes the first time.

```bash
git clone https://github.com/webship/nextcloud-steps.git
SITE_DIR="$PWD/nextcloud-site" nextcloud-steps/.github/scripts/build-ddev-site.sh
```

The site answers at `https://nextcloudsteps.ddev.site` and its mail catcher at `https://nextcloudsteps.ddev.site:8026`.
The accounts are `administrator`, `editor` and `user`, each with the password `dD.123123ddd`.

In the [Webship Workspace](https://github.com/webship/workspace), its Nextcloud plugin builds the same site instead,
in a sites folder of the workspace (`dev/` here, the one `--with-needs` adds to a new workspace; `test/`,
`sandboxes/` and `demos/` work the same):

```bash
bash core/scripts/plugins.sh --require nextcloud --with-needs
bash core/scripts/plugins.sh --activate nextcloud --with-needs
bash core/scripts/plugins.sh --install nextcloud
bash dev/cmd-nextcloud-project.sh ncsite --install --add-users
```

That site answers at `https://ncsite.ddev.site` (its mail at `:8026`). It is installed and set up the same way, by the
same site script, and its accounts are the plugin's: the same three, with the workspace's shared password
`dD.123123ddd`. The workspace's own account is the server's first administrator; the suite does not use it. The
plugin's README says how to manage the accounts with its occ tool (`cmd-tools-nextcloud-occ.sh ncsite --add-users`).

**2. A test project.**

```bash
mkdir nextcloud-tests && cd nextcloud-tests
npm init -y
npm install --save-dev webship-js @webship-js/nextcloud-steps
npx init-webship-js
```

`npx init-webship-js` writes `cucumber.js`, `playwright.config.ts`, the `tests/` folders with a first feature and the
`npm test` scripts, and installs Chromium. npm usually runs it already when it installs webship-js; a second run
changes nothing. Its first feature opens the site's home page (a visitor lands on the login page): it passes, and
can stay.

**3. `cucumber.js`.** Replace the file with the wiring of the pack: the step files of webship-js and of the pack,
the tags that keep the assertions that must fail out of a normal run, the address of the site and of its mail
catcher, the account the test-data steps use for what only an administrator may do, the browser messages that are
no error of a step, and the accounts (the JSON of [Test users](#test-users)). The first lines are the starter's own:
a feature named on the command line runs alone (step 5).

```javascript
// A feature file or a scenario (file:line) named on the command line runs alone:
// cucumber-js 12 would add it to the paths below, so `paths` is left empty then.
const OPTIONS_WITH_A_VALUE = new Set([
  '-c', '--config', '-f', '--format', '--format-options', '--i18n-keywords',
  '-i', '--import', '-l', '--loader', '--language', '--name', '--order',
  '-p', '--profile', '--parallel', '--plugin', '--plugin-options',
  '-r', '--require', '--require-module', '--retry', '--retry-tag-filter',
  '--shard', '-t', '--tags', '--world-parameters',
]);

function commandLinePaths() {
  if (!/cucumber(-js|\.js)?$/.test(String(process.argv[1] || ''))) return [];
  const args = process.argv.slice(2);
  const paths = [];
  for (let i = 0; i < args.length; i += 1) {
    if (args[i].startsWith('-')) {
      if (OPTIONS_WITH_A_VALUE.has(args[i])) i += 1;
    } else {
      paths.push(args[i]);
    }
  }
  return paths;
}

// The site; its mail catcher is where the test site lays it out.
const launchUrl = (process.env.LAUNCH_URL || 'https://nextcloudsteps.ddev.site').replace(/\/+$/, '');

module.exports = {
  default: {
    requireModule: ['tsx/cjs'],
    require: [
      'node_modules/webship-js/tests/step-definitions/**/*.js',
      'node_modules/@webship-js/nextcloud-steps/tests/step-definitions/**/*.js',
      'tests/step-definitions/**/*.js',
    ],
    paths: commandLinePaths().length ? [] : ['tests/features/**/*.feature'],
    // Work in progress and the assertions that must fail stay out of a normal run.
    tags: 'not @wip and not @must-fail',
    format: ['@cucumber/pretty-formatter', 'json:tests/reports/cucumber_report.json'],
    worldParameters: {
      launchUrl,
      // The mail catcher the site sends its mail to.
      mailUrl: `${launchUrl}:8026`,
      // The account the test-data steps use for what only an administrator may do (a handle of `users`).
      dataAdmin: 'administrator',
      // No error of a step: a request lost when the network changed, a listing the Files app cancels, the sharing
      // tab's list of actions, requests the apps make that answer 404 by design, the preview worker a public link's
      // page refuses.
      javascript: { mode: 'warn', levels: ['error'], ignore: 'net::ERR_NETWORK_CHANGED|signal is aborted without reason|external legacy actions|status of 404|preview-service-worker|SW registration failed', beforeScenario: false, afterScenario: true },
      minWaitTime: { page: 3000, before_scenario: 0, after_scenario: 0, before_step: 0, after_step: 0 },
      users: {
        administrator: { username: 'administrator', email: 'administrator@example.com', displayName: 'Administrator', password: 'dD.123123ddd' },
        editor: { username: 'editor', email: 'editor@example.com', displayName: 'Editor', password: 'dD.123123ddd' },
        user: { username: 'user', email: 'user@example.com', displayName: 'User', password: 'dD.123123ddd' },
      },
    },
  },
};
```

On the site from the Webship Workspace (step 1) the accounts are the same; its address goes in `LAUNCH_URL` (step
5), and the mail catcher follows it.

**4. A first feature**, `tests/features/first-run.feature`. The picture it uploads is one of the pack's own files;
the clean-up takes it away after the scenario.

```gherkin
Feature: First run
  Scenario: The user logs in with the login form
    Given I am not logged in
    When I log in as "user" with the login form
    Then I should be logged in as "user"
    And I should be in the "Dashboard" app

  Scenario: A picture is uploaded and opened in the viewer
    Given I am a logged in user with the "user" user
    When I go to the files
    And I upload the file "team-photo.png"
    And I open the file "team-photo.png"
    Then the viewer should show the image "team-photo.png"
```

**5. Run it.** Set `LAUNCH_URL` to the address of the site: `https://nextcloudsteps.ddev.site` for the build script's
site, `https://ncsite.ddev.site` for the Workspace's.

```bash
LAUNCH_URL=https://nextcloudsteps.ddev.site npm test
```

A green first run prints every step, then the summary (the scenarios above and the starter's, passed) and the HTML
report it wrote:

```
3 scenarios (3 passed)
11 steps (11 passed)
0m32.075s (executing steps: 0m31.878s)
🚀 Cucumber HTML report …/nextcloud-tests/tests/reports/cucumber_report.html generated successfully 👍
[webship-js] HTML report → …/nextcloud-tests/tests/reports/cucumber_report.html
```

One feature runs alone when the command line names it (a scenario too, with its line):

```bash
LAUNCH_URL=https://nextcloudsteps.ddev.site npx cucumber-js tests/features/first-run.feature
```

From there, copy the features of [`tests/features/`](tests/features/) (they also ship in the package, under
`node_modules/@webship-js/nextcloud-steps/tests/features/`, with the files they upload). Together they use every step
of the pack. They run as they are on the site of either way of step 1: what a scenario adds or changes is taken
back after it.

For your own site, point `launchUrl` at it, `mailUrl` at the mail catcher it sends to, `dataAdmin` at a handle of an
administrator, and `users` at the test accounts of the site (with their display names, as the site shows them). A
site that keeps its default settings has an app store, a first-run wizard and files for every new account: the
steps read the apps the same way, and the features expect accounts that start with no files of the names they use.

### What the suite tests

The features of this repository run every step of the pack against the test site, twice in a row in CI on every
change, then the assertions that must fail: a visitor sent to the login page; each account logging in with the form;
a wrong password and an unknown account refused with the same words; a session taken over and accounts switched
within a scenario; logging out; a reset link by mail, an address without an account answered the same way with no
mail, and a new password from the link that logs in; the apps menu, the user menus of an account and of an
administrator, the online status, an account refused the administration settings and an address the site does not
have; the dashboard's greeting, a widget added that lists a favorite, a widget removed; an upload, a folder made and
opened, a rename, a move and a copy into folders, a delete with its message and the restore from the deleted files, a
favorite in the favorites view, the details of a file with its activity; a share with an account as "View only"
found in "Shared with you", a share made as test data, a public link with a password and an expiration date opened by
a visitor, the wrong password refused and the right one; a picture, a PDF with its pages and its text, and a text
file in the viewers; a file and an app found by the unified search, nothing found, a result opened; a notification
shown and dismissed, all dismissed; an upload as the newest activity, the file changes, a share among the file
shares; a field of the profile saved, a wrong current password refused, a new password that logs in, the dark theme;
the accounts page with the accounts and their groups, its search, the administrators, a taken name refused, and an
account without the right refused the page.

Not tested: the server's other languages (the steps read the words of its English pages: "Log in", "Wrong login or
password.", "Create a new share link", "Save share", "Customize link", "Advanced settings", "Set password", "Set
expiration date", "Update share", "Restore", "Dismiss"), the app store and any app it offers (the test site has none),
the Office app and the other apps that need a server of their own, a completed account creation (a suite never makes
an account), two-factor authentication, external storage, the desktop and mobile clients, and the server's WebDAV and
OCS APIs as such (webship-js's own API steps cover them; the pack uses them only for test data and the clean-up).

## Requirements

- Node.js 24 or later
- A webship-js 2.0 test project (webship-js 2.0.16 or later)
- A Nextcloud server (35.x) with the accounts for the suite (an administrator among them, for the test-data steps)
  and a mail catcher for the forgotten password

## Install

```bash
npm install --save-dev @webship-js/nextcloud-steps
```

## How the steps find things and wait

- **By what a person reads.** A file by the name the list shows (with its extension), a button and a menu item by
  their words, a view, a tab and a section by the words of their entry, a field by its label, an account by a handle
  of the users registry. The server's stable hooks are the fallback: the list's rows
  (`tr.files-list__row[data-cy-files-list-row-name]`), their actions (`data-cy-files-list-row-action`), the sidebar
  (`#app-sidebar-vue`), the viewer (`#viewer`), the notifications menu (`#header-menu-notifications`), the accounts
  list (`tr[data-cy-user-row]`).
- **The server's own signals, no fixed sleeps.** Each app is a single-page app: it shows a loading icon while it asks
  the server for its content (a WebDAV PROPFIND for a folder, an OCS call for the activity, the accounts or the
  notifications). The steps wait for the icon to go and for the page's own requests to answer; an action waits for
  its own request (the WebDAV PUT, MKCOL, MOVE, COPY or DELETE, the share, the favorite) and for the list the app
  draws again. The activity stream keeps a "Loading more activities" icon at its foot while more can load: that one
  is no work in progress.
- **Long timers.** The apps keep timers that fire seconds later (the text editor's sync every five seconds, the
  notifications poll): webship-js's settle counts every pending timer as work in progress; the pack takes timers of
  five seconds or more out of that count.
- **The Sharing tab.** It is a custom element whose `shadowRoot` is the element itself, so a locator that pierces
  shadow roots (role, text or CSS) can run into it without end. The steps of the tab find what they click with XPath
  (which stays in the light tree) and read the tab with the page's own DOM.
- **The viewers.** A picture is ready when it is loaded (its natural width), a PDF when the PDF viewer's document is
  loaded and its pages counted, a text file when the text editor's toolbar is ready.
- **Who is logged in** is asked of the server itself (its OCS endpoint `cloud/user`, with the browser's cookies),
  without touching the page.
- **Mail** is read from the mail catcher's API (Mailpit): only the mail that came since the scenario began.
- **A cut request says so.** When the browser lost a request (a network change on the machine, another container
  starting), the step says the request was cut before the site answered, with a hint to run the scenario again (or to
  run the suite in the project's container), instead of blaming the scenario.
- **Failures say what was found.** `The file list does not show "no-such-file.txt". It shows "budget.txt"
  (/apps/files/files).`, `The browser is logged in as user, not as editor ("editor").`, with a hint on where to look.

## Accounts

The suite never creates or deletes an account. Accounts are configuration: list the ones the site has in
`worldParameters.users`, by a handle the scenarios use, each with its `username` (the server logs in with it, or with
the email), its `email`, its `displayName` (as the site shows it in shares and greetings) and its `password`.
`worldParameters.dataAdmin` names the handle of an administrator (in the admin group): the test-data steps use it for
what only an administrator may do (a notification for an account), and the clean-up for a password put back. Every
call of the test-data steps and of the clean-up goes through the server's APIs with the account's own password (HTTP
basic authentication), in sessions of their own: the browser's session is never touched.

An account that logged in once keeps its session for the rest of the run (`reuseSessions: false` turns it off); a
logout ends it. A password a scenario gives an account (a reset, a change) is used by the scenario's later steps, and
the registry's password comes back after it.

## Test users

The accounts this repository's suite logs in as, exactly as `cucumber.js` lists them in `worldParameters.users` (the
default values; the `<HANDLE>_USERNAME`, `<HANDLE>_EMAIL` and `<HANDLE>_PASSWORD` variables replace them). The build
script creates them; the Workspace's Nextcloud plugin creates the same three.

```json
{
  "administrator": { "username": "administrator", "email": "administrator@example.com", "displayName": "Administrator", "password": "dD.123123ddd" },
  "editor": { "username": "editor", "email": "editor@example.com", "displayName": "Editor", "password": "dD.123123ddd" },
  "user": { "username": "user", "email": "user@example.com", "displayName": "User", "password": "dD.123123ddd" }
}
```

`administrator` is in the admin group: the accounts page, and the test-data steps use it. `editor` and `user` are
accounts of their own, with no group: `user` has the files, the shares and the settings the scenarios change, and
`editor` is the account files are shared with. They are placeholder credentials of a throwaway test site, not of any
real one.

## Test data

- `Given "user" has the file "meeting-notes.md"` (`… in the folder "Project files"`), `Given "user" has the folder
  "Project files/Reports"`, `Given "user" has shared the file "team-photo.png" with "editor"`, `Given "user" has the
  notification "Quarterly review is due"` (`… saying "…"`): made through the server's own APIs (WebDAV and OCS), as
  the account itself, or as the data administrator for a notification.
- The files the pack ships for the scenarios to upload (`tests/fixtures/`, in the package): `meeting-notes.md` (a
  Markdown note), `budget.txt`, `team-photo.png` (a 320 × 200 picture) and `annual-report.pdf` (two pages; the first
  says "Annual report 2026"). A step looks for a file in the project's `tests/assets/` and `tests/fixtures/` first,
  then among the pack's.
- After each scenario the steps take back what it added or changed: the files and folders at the top of the account's
  files that were not there before it (with what is in them, their shares and favorites), the new entries of its
  deleted files, the new shares, the notifications it gave, a field of the profile, the theme, the status, the layout
  of the dashboard, a password. A document a failed scenario left open in the text editor keeps the editor's lock
  after the browser is gone; the clean-up takes that lock off as the file's owner, then deletes the file.
  `cleanUp: false` keeps them all. A run cut off in the middle can leave files behind: the build script with
  `ACCOUNTS_ONLY=1` (or the Workspace plugin's `cmd-tools-nextcloud-occ.sh <site> --empty-files`) takes the accounts'
  files away.

## A test site

[`.github/scripts/build-ddev-site.sh`](.github/scripts/build-ddev-site.sh) builds the site the suite of this
repository runs against:

- a DDEV project of type `php` served by Apache (the release's own rewrite rules give short addresses:
  `/apps/files`), PHP 8.4 with APCu on the command line too, the project's MariaDB, and the project's mail catcher
  (Mailpit), which the site sends its mail to;
- the server's release tarball from download.nextcloud.com at `NEXTCLOUD_VERSION` (35.0.3 by default, or a major line
  for its newest release), its SHA-256 sum checked against the one the server publishes, unpacked in `nextcloud/` (the
  docroot), with the data folder `data/` beside it, outside the docroot;
- the server installed with its own installer (`occ maintenance:install`) on the project's database, with an
  administrator for the build only (`BUILD_ADMIN`), then set up for testing: its address behind the router
  (`trusted_domains`, `overwrite.cli.url`, https), a local memory cache, no app store (only the apps the release
  bundles), no first-run wizard, new accounts with no files and no templates, no connection to the internet (no update
  check, no news, no lookup server), the mail to the mail catcher, background jobs by cron (a daemon of the web
  container runs `cron.php` every five minutes), and the throttling of failed logins and the rate limits off (every
  request reaches the server from the router's address, so the failed logins of one run would slow down every later
  login, and the server sends an account at most five password reset mails in thirty minutes);
- the accounts of [Test users](#test-users), with their passwords, emails, display names and groups;
- all of it written with [`site/nextcloud-site.sh`](site/nextcloud-site.sh), run by bash in the web container with
  the server's own `occ`: the same script the Webship Workspace's Nextcloud plugin runs. No password is on a command
  line of the host or in a file of the project.

Run again with `ACCOUNTS_ONLY=1` and the same `SITE_DIR`, the build script gives the accounts back their password,
email, display name and groups, and takes their files away.

## Steps

### `nextcloud-session.steps.js` (12)

- `Given I am a logged in user with the "user" user`
- `Given I am not logged in`
- `Given I am on the login page`
- `When I go to the login page`
- `When I log in as "user" with the login form`
- `When I log in with the username "user" and the password "Wrong-password-1"`
- `Then the login should be refused with "Wrong login or password."`
- `When I log out`
- `Then I should be logged in`
- `Then I should be logged in as "user"`
- `Then I should not be logged in`
- `Then I should be on the login page`

### `nextcloud-password.steps.js` (5)

- `When I ask for a password reset link for "user"`
- `Then an email about "password reset" should be sent to "user"`
- `Then no email should be sent to "nobody@example.com"`
- `When I open the password reset link of the email to "user"`
- `When I choose the new password "Webship-New-Pass-1"`

### `nextcloud-dashboard.steps.js` (13)

- `When I open the "Files" app`
- `Then I should be in the "Files" app`
- `Then the apps menu should list "Files"`
- `Then the user menu should offer "Accounts"`
- `When I choose "Settings" in the user menu`
- `When I set my status to "Away"`
- `Then my status should be "Away"`
- `Then I should see the error page "Access forbidden"`
- `When I go to the dashboard`
- `Then the dashboard should greet "User"`
- `Then the dashboard should show the "Recommended files" widget`
- `When I add the "Favorite files" widget to the dashboard`
- `Then the "Favorite files" widget should list "meeting-notes.md"`

### `nextcloud-files.steps.js` (23)

- `When I go to the files`
- `When I go to the folder "Project files"`
- `When I open the folder "Project files"`
- `When I open the "Favorites" files view`
- `When I go to the deleted files`
- `Then the file list should show "meeting-notes.md"`
- `Then the file list should be empty`
- `When I upload the file "meeting-notes.md"`
- `When I create the folder "Project files"`
- `When I rename "meeting-notes.md" to "minutes.md"`
- `When I move "meeting-notes.md" to the folder "Project files"`
- `When I copy "meeting-notes.md" to the folder "Project files"`
- `When I delete "meeting-notes.md"`
- `Then the deleted files should list "meeting-notes.md"`
- `When I restore "meeting-notes.md" from the deleted files`
- `When I add "meeting-notes.md" to the favorites`
- `Then "meeting-notes.md" should be marked as a favorite`
- `When I open the details of "meeting-notes.md"`
- `Then the details should show "meeting-notes.md"`
- `When I open the "Activity" tab of the details`
- `Then the details tab should show "You created meeting-notes.md"`
- `When I close the details`
- `Then a message "Delete file: done" should pop up`

### `nextcloud-sharing.steps.js` (11)

- `When I share "meeting-notes.md" with "editor"`
- `Then "meeting-notes.md" should be shared with "editor"`
- `When I create a public link for "team-photo.png"`
- `When I protect the public link of "team-photo.png" with the password "Webship-Share-2026"`
- `When I set the public link of "team-photo.png" to expire in 30 days`
- `Then the public link of "team-photo.png" should expire in 30 days`
- `When I open the public link of "team-photo.png" as a visitor`
- `Then I should be asked for the password of the share`
- `When I enter the share password "Webship-Share-2026"`
- `Then the share password should be refused`
- `Then the shared file "team-photo.png" should be shown`

### `nextcloud-viewer.steps.js` (7)

- `When I open the file "team-photo.png"`
- `Then the viewer should show the image "team-photo.png"`
- `Then the viewer should show the PDF "annual-report.pdf"`
- `Then the PDF should have 2 pages`
- `Then the PDF should show "Annual report 2026"`
- `Then the viewer should show the text "Meeting notes"`
- `When I close the viewer`

### `nextcloud-search.steps.js` (4)

- `When I search for "team" in the unified search`
- `Then the unified search should find "team-photo.png" in "Files"`
- `Then the unified search should find nothing`
- `When I open the search result "team-photo.png"`

### `nextcloud-notifications.steps.js` (6)

- `Given "user" has the notification "Quarterly review is due"`
- `When I open the notifications`
- `Then the notifications should show "Quarterly review is due"`
- `When I dismiss the notification "Quarterly review is due"`
- `When I dismiss all notifications`
- `Then I should have no notifications`

### `nextcloud-activity.steps.js` (4)

- `When I go to the activity stream`
- `When I filter the activity stream by "File changes"`
- `Then the newest activity should be "You created meeting-notes.md"`
- `Then the activity stream should show "You created meeting-notes.md"`

### `nextcloud-settings.steps.js` (8)

- `When I go to the personal settings`
- `When I open the "Security" section of the personal settings`
- `When I set my "Headline" to "Planning lead"`
- `Then my "Headline" should be "Planning lead"`
- `When I change my password to "Webship-Changed-2026"`
- `When I change my password with the wrong current password "Wrong-password-1"`
- `When I choose the "Dark theme" appearance`
- `Then the "Dark theme" appearance should be in use`

### `nextcloud-accounts.steps.js` (7)

- `When I go to the accounts page`
- `Then the account list should show "editor"`
- `Then the account "administrator" should be in the group "admin"`
- `When I search the accounts for "edit"`
- `When I open the "Admins" account list`
- `When I try to create the account "editor"`
- `Then the new account should be refused with "User already exists"`

### `nextcloud-data.steps.js` (3)

- `Given "user" has the file "meeting-notes.md"`
- `Given "user" has the folder "Project files"`
- `Given "user" has shared the file "meeting-notes.md" with "editor"`
Text, links, buttons, cookies and the accessibility checks are webship-js's own steps (`I should see "…"`,
`I press "…"`, `the page should pass an accessibility audit`); this pack adds what the file server's apps do.

## Phrases shared with other packs

The session phrases are the ones every platform pack has, so a feature reads the same on every system (one
`cucumber.js` profile per system; the platform packs are not meant to be loaded together). Loaded beside each of the
35 published packs, these phrases of this pack also match one of theirs:

| Phrase of this pack | Also in |
| --- | --- |
| `I am a logged in user with the "user" user` | codeigniter, discourse, django, django-cms, drupal-core, joomla, keycloak, laravel, mediawiki, moodle, nextjs, odoo, payload, strapi, symfony, typo3, wordpress |
| `I log out`, `I should be logged in`, `I should not be logged in` | codeigniter, discourse, django, django-cms, drupal-core, keycloak, laravel, mediawiki, moodle, nextjs, odoo, payload, strapi, symfony, typo3, wordpress |
| `I should be logged in as "user"` | backdrop-cms, codeigniter, discourse, django, keycloak, laravel, mediawiki, moodle, nextjs, odoo, payload, strapi, symfony, typo3 |
| `I log in as "user" with the login form` | codeigniter, discourse, django, keycloak, laravel, mediawiki, moodle, nextjs, payload, strapi, symfony |
| `I am not logged in` | discourse, django, django-cms, drupal-core, joomla, keycloak, odoo, payload, strapi, typo3, wordpress |
| `the login should be refused with "…"` | discourse, django, keycloak, mediawiki, payload, strapi |
| `I am on the login page` | django-cms, drupal-core, joomla, keycloak, odoo, wordpress |
| `no email should be sent to "…"` | codeigniter, keycloak, laravel, symfony, woocommerce |
| `I log in with the username "…" and the password "…"` | discourse, keycloak, moodle, symfony |
| `I should be on the login page` | discourse, keycloak, wordpress |
| `I open the search result "…"` | docusaurus, hubspot-cms, joomla |
| `I go to the login page` | django-cms, keycloak |
| `I ask for a password reset link for "…"` | keycloak, laravel |
| `the user menu should offer "…"` | laravel, symfony |
| `I choose the "…" appearance` | laravel |
| `I choose the new password "…"` | craft-cms |
| `I change my password to "…"` | django |
| `the "…" widget should list "…"` | filament |
| `I should see the error page "…"` | keycloak |
| `I open the "…" app`, `I should be in the "…" app`, `I choose "…" in the user menu` | odoo |
| `I open the details of "…"` | strapi |

None matches a webship-js step, and none matches a phrase of the component pack (Bootstrap), of the Diffy pack or of
the Jira pack, which can be loaded beside this one.

## Testing this package

```bash
npm ci
npm run test:examples    # every step's JSDoc examples match it and nothing else; every feature step resolves
npm run test:paths       # a feature named on the command line runs alone
npx cucumber-js --dry-run
SITE_DIR="$PWD/../nextcloud-site" .github/scripts/build-ddev-site.sh
npx cucumber-js          # the whole suite
npm run test:must-fail   # the assertions that must fail, each with its message and a hint
```

## How the steps were written

Every step was written from a round of manual testing of a real local site in the browser first: each page it touches
was opened as the account the step works as, its roles, labels and messages noted, and the signal it gives while it
loads or saves found (the loading icon of the list, the request of the action, the toolbar of the text editor, the
pages of the PDF viewer). The failures of the first runs went back to the browser before the step changed.

## License

MIT, see [LICENSE](LICENSE).

## Logo

The Nextcloud logo in this README comes from Simple Icons 16.37.0 (CC0-1.0), filled with the colour the set lists for
the brand. Simple Icons names the brand's trademark guidelines with it; it is used here only to name the platform these
steps work with. The Nextcloud name and logo are trademarks of their owner; this pack is not affiliated with or
endorsed by them.
