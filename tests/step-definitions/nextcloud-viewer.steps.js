'use strict';

// The viewer a file opens in: a picture, a PDF (its pages and its text, in the PDF viewer's own frame), and a text
// file in the text editor. A step waits for the viewer's own signals: the picture loaded, the PDF's pages counted,
// the editor's toolbar ready.

const { When, Then } = require('@cucumber/cucumber');
const h = require('./nextcloud-helpers');
const files = require('./nextcloud-files.steps');

/** The viewer on screen. */
function viewer(page) {
  return page.locator('#viewer').first();
}

/** The name the viewer shows (its heading). */
async function viewerName(page) {
  return h.clean(await viewer(page).locator('h2').first().innerText({ timeout: 500 }).catch(() => ''));
}

/** The viewer is open on a file, or a failure naming what is on screen. */
async function expectViewer(world, name) {
  await h.eventually(world, () => viewerName(world.page), (t) => h.same(t, name), async (t) => ({
    message: t ? `The viewer shows "${t}", not "${name}".` : `No viewer is open on "${name}": ${await h.pageSummary(world)}.`,
    hint: 'A file opens in the viewer when its name is clicked in the list ("When I open the file "…"").',
  }), h.budget(world) * 2);
}

/** The frame of the PDF viewer inside the viewer, once it is there. */
async function pdfFrame(world) {
  return h.eventually(world, async () => world.page.frames().find((f) => /\/apps\/files_pdfviewer\//.test(f.url())) || null, Boolean, async () => ({
    message: `The viewer shows no PDF: ${await h.pageSummary(world)}.`,
    hint: 'A PDF opens in the PDF viewer of the server, in a frame of the viewer.',
  }), h.budget(world) * 2);
}

/** The PDF viewer's own state: { pages, text } once the document is loaded. */
async function pdfState(frame) {
  return frame.evaluate(() => {
    const app = window.PDFViewerApplication;
    const pages = app && app.pdfDocument ? app.pagesCount : 0;
    const text = [...document.querySelectorAll('.textLayer')].map((t) => t.textContent).join(' ');
    return { pages, text };
  }).catch(() => ({ pages: 0, text: '' }));
}

/**
 * Open a file of the list in the viewer, as a person does: its name, clicked. The step waits for the viewer and
 * for what it shows: a picture loaded, a PDF's pages counted, the text editor ready.
 *
 * Example #1: When I open the file "team-photo.png"
 * Example #2: When I open the file "annual-report.pdf"
 * Example #3: When I open the file "meeting-notes.md"
 * Example #4: When we open the file "budget.txt"
 * Example #5: And I open the file "team-photo.png"
 */
When(/^(?:I|we) open the file "([^"]*)"$/, async function (name) {
  const row = await files.needRow(this, name);
  await row.locator('[data-cy-files-list-row-name-link]').first().click();
  await expectViewer(this, name);
  const page = this.page;
  const box = viewer(page);
  const kind = await h.eventually(this, async () => {
    if (await box.locator('img').first().isVisible().catch(() => false)) return 'image';
    if (await box.locator('iframe[src*="files_pdfviewer"]').first().count().catch(() => 0)) return 'pdf';
    if (await box.locator('.ProseMirror, [data-text-el="editor-container"]').first().isVisible().catch(() => false)) return 'text';
    if (await box.locator('video, audio').first().count().catch(() => 0)) return 'media';
    return '';
  }, Boolean, async () => ({ message: `The viewer of "${name}" shows nothing it can read.`, hint: 'The viewer opens pictures, PDFs, text, audio and video.' }), h.budget(this) * 2);
  if (kind === 'image') {
    await h.eventually(this, () => box.locator('img').first().evaluate((img) => img.complete && img.naturalWidth > 0).catch(() => false), Boolean, async () => ({ message: `The picture of "${name}" did not load in the viewer.`, hint: 'The viewer loads a preview of the picture from the server (/core/preview).' }));
  } else if (kind === 'pdf') {
    const frame = await pdfFrame(this);
    await h.eventually(this, () => pdfState(frame), (s) => s.pages > 0, async () => ({ message: `The PDF "${name}" did not load in the PDF viewer.`, hint: 'The PDF viewer loads the file from the server (WebDAV) and counts its pages.' }), h.budget(this) * 2);
  } else if (kind === 'text') {
    await h.eventually(this, () => box.locator('.text-menubar--ready, .ProseMirror[contenteditable]').first().isVisible().catch(() => false), Boolean, async () => ({ message: `The text editor of "${name}" did not get ready.`, hint: 'The text editor opens a session on the server for the file first.' }), h.budget(this) * 2);
  }
  await h.ready(this);
});

/**
 * The viewer shows a picture: the viewer is open on the file, with the picture loaded (its alternative text is the
 * file's name).
 *
 * Example #1: Then the viewer should show the image "team-photo.png"
 * Example #2: And the viewer should show the image "team-photo.png"
 * Example #3: Then the viewer should show the image "team.png"
 * Example #4: Then the viewer should show the image "team-photo.png"
 *               When I close the viewer
 * Example #5: Then the viewer should show the image "photo.jpg"
 */
Then(/^the viewer should show the image "([^"]*)"$/, async function (name) {
  await expectViewer(this, name);
  const img = viewer(this.page).locator(`img[alt=${h.cssString(name)}]`).or(viewer(this.page).locator('img')).first();
  await h.eventually(this, () => img.evaluate((i) => i.complete && i.naturalWidth > 0).catch(() => false), Boolean, async () => ({ message: `The viewer of "${name}" shows no loaded picture.`, hint: 'The viewer shows pictures (PNG, JPEG, GIF, WebP); other files open in other viewers.' }));
});

/**
 * The viewer shows a PDF: the viewer is open on the file, with the PDF viewer's document loaded.
 *
 * Example #1: Then the viewer should show the PDF "annual-report.pdf"
 * Example #2: And the viewer should show the PDF "annual-report.pdf"
 * Example #3: Then the viewer should show the PDF "report.pdf"
 * Example #4: Then the viewer should show the PDF "annual-report.pdf"
 *               And the PDF should have 2 pages
 * Example #5: Then the viewer should show the PDF "manual.pdf"
 */
Then(/^the viewer should show the PDF "([^"]*)"$/, async function (name) {
  await expectViewer(this, name);
  const frame = await pdfFrame(this);
  await h.eventually(this, () => pdfState(frame), (s) => s.pages > 0, async () => ({ message: `The PDF viewer shows no document for "${name}".`, hint: 'The PDF viewer loads the file from the server; a file that is no PDF does not open in it.' }));
});

/**
 * The PDF in the viewer has a number of pages, as the PDF viewer counts them.
 *
 * Example #1: Then the PDF should have 2 pages
 * Example #2: Then the PDF should have 1 page
 * Example #3: And the PDF should have 2 pages
 * Example #4: Then the PDF should have 2 pages
 *               And the PDF should show "Annual report 2026"
 * Example #5: Then the PDF should have 12 pages
 */
Then(/^the PDF should have (\d+) pages?$/, async function (count) {
  const frame = await pdfFrame(this);
  await h.eventually(this, () => pdfState(frame), (s) => s.pages === Number(count), async (s) => ({ message: `The PDF has ${s.pages} page(s), not ${count}.`, hint: 'The PDF viewer counts the pages of the document it loaded.' }));
});

/**
 * The PDF in the viewer shows a text (the words given, in the text of its rendered pages).
 *
 * Example #1: Then the PDF should show "Annual report 2026"
 * Example #2: Then the PDF should show "Annual report"
 * Example #3: And the PDF should show "Annual report 2026"
 * Example #4: Then the PDF should show "Annual report 2026"
 *               When I close the viewer
 * Example #5: Then the PDF should show "the figures"
 */
Then(/^the PDF should show "([^"]*)"$/, async function (text) {
  const frame = await pdfFrame(this);
  await h.eventually(this, () => pdfState(frame), (s) => h.mentions(s.text, text), async (s) => ({ message: `The PDF does not show "${text}". Its rendered text is "${h.clean(s.text).slice(0, 200)}".`, hint: 'The PDF viewer renders the text of the pages in view; a scanned page has no text.' }));
});

/**
 * The text editor in the viewer shows a text (the words given, as a part of the document).
 *
 * Example #1: Then the viewer should show the text "Meeting notes"
 * Example #2: Then the viewer should show the text "Budget 2027"
 * Example #3: And the viewer should show the text "Send the minutes"
 * Example #4: Then the viewer should show the text "Meeting notes"
 *               When I close the viewer
 * Example #5: Then the viewer should show the text "Travel: 1200"
 */
Then(/^the viewer should show the text "([^"]*)"$/, async function (text) {
  const editor = viewer(this.page).locator('.ProseMirror').first();
  await h.eventually(this, async () => h.clean(await editor.innerText({ timeout: 500 }).catch(() => '')), (t) => h.mentions(t, text), async (t) => ({ message: t ? `The text in the viewer does not have "${text}". It begins "${t.slice(0, 200)}".` : `No text editor is open in the viewer: ${await h.pageSummary(this)}.`, hint: 'Text files (.md, .txt) open in the text editor of the viewer.' }));
});

/**
 * Close the viewer with its "Close" button; the list is on screen again.
 *
 * Example #1: When I close the viewer
 * Example #2: When we close the viewer
 * Example #3: And I close the viewer
 * Example #4: When I close the viewer
 *               Then the file list should show "team-photo.png"
 * Example #5: Then I close the viewer
 */
When(/^(?:I|we) close the viewer$/, async function () {
  const box = viewer(this.page);
  if (!(await box.isVisible().catch(() => false))) throw h.fail(this, 'No viewer is open.', 'Open a file first ("When I open the file "…"").');
  await box.getByRole('button', { name: 'Close', exact: true }).first().click();
  await box.waitFor({ state: 'detached', timeout: h.budget(this) }).catch(() => {});
  await h.ready(this);
});
