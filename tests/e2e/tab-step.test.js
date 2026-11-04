import { createServer } from 'node:http';
import { launchBrowserWithExtension, openSidebar } from './helpers/extension-helper.js';

// Reported on 1.1.0 (issue 5): "Navigates to next tab in space" went the wrong way through the
// unpinned tabs while "Show new tabs at the top" was on. Next and previous must follow the
// order the sidebar shows, whatever the two settings are.
let browser, page, server, base;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const rows = '.space.active .tab[data-tab-id]';

const shownOrder = () => page.$$eval(rows, els => els.map(el => Number(el.dataset.tabId)));
const activeTabId = () =>
    page.evaluate(
        async () => (await chrome.tabs.query({ active: true, windowId: (await chrome.windows.getCurrent()).id }))[0].id
    );

async function apply(settings) {
    await page.evaluate(settings => chrome.storage.sync.set(settings), settings);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector(rows);
    await sleep(800);
}

async function step(direction, expectedId) {
    const response = await page.evaluate(
        direction => chrome.runtime.sendMessage({ command: 'stepTabInSpace', direction }),
        direction
    );
    expect(response.success).toBe(true);
    await page.waitForFunction(
        async id => {
            const [tab] = await chrome.tabs.query({ active: true, windowId: (await chrome.windows.getCurrent()).id });
            return tab.id === id;
        },
        { polling: 100, timeout: 5000 },
        expectedId
    );
}

beforeAll(async () => {
    server = createServer((req, res) => {
        res.setHeader('Content-Type', 'text/html');
        res.end(`<title>${req.url}</title>`);
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${server.address().port}`;
    const result = await launchBrowserWithExtension();
    browser = result.browser;
    page = await openSidebar(browser, result.extensionId);
    page.on('pageerror', error => console.error('Sidebar error:', error.message));
    // Two favorites, opened by clicking them, then three plain tabs opened one after another.
    await page.evaluate(async base => {
        const { spaces } = await chrome.runtime.sendMessage({ type: 'spaceStore', action: 'get' });
        for (const name of ['fav-a', 'fav-b'])
            await chrome.bookmarks.create({
                parentId: spaces[0].bookmarkFolderId,
                title: name,
                url: `${base}/${name}`
            });
    }, base);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.space.active [data-tab-type="pinned"] .tab.bookmark-only');
    for (let i = 0; i < 2; i++) {
        await page.$eval('.space.active [data-tab-type="pinned"] .tab.bookmark-only', el => el.click());
        await page.waitForFunction(
            count =>
                document.querySelectorAll('.space.active [data-tab-type="pinned"] .tab[data-tab-id]').length >= count,
            { polling: 100 },
            i + 1
        );
    }
    for (const name of ['one', 'two', 'three']) {
        await page.evaluate(url => chrome.tabs.create({ url, active: false }), `${base}/${name}`);
        await sleep(300);
    }
    await page.waitForFunction(
        () => document.querySelectorAll('.space.active [data-tab-type="temporary"] .tab[data-tab-id]').length === 4,
        { polling: 100 }
    );
});

afterAll(async () => {
    await browser?.close();
    if (server) await new Promise(resolve => server.close(resolve));
});

describe.each([
    [true, false],
    [false, false],
    [true, true],
    [false, true]
])('new tabs at the top: %s, sync to tab groups: %s', (invertTabOrder, syncTabGroups) => {
    test('next and previous follow the order the sidebar shows, wrapping at both ends', async () => {
        await apply({ invertTabOrder, syncTabGroups });
        const shown = await shownOrder();
        // Two favorites above four plain tabs (the panel's own tab is one), listed either way up.
        expect(shown).toHaveLength(6);
        await page.evaluate(id => chrome.tabs.update(id, { active: true }), shown[0]);
        await page.waitForFunction(async id => (await chrome.tabs.get(id)).active, { polling: 100 }, shown[0]);
        expect(await activeTabId()).toBe(shown[0]);

        for (let i = 1; i <= shown.length; i++) await step('next', shown[i % shown.length]);
        for (let i = shown.length - 1; i >= 0; i--) await step('prev', shown[(i + shown.length) % shown.length]);
    });
});
