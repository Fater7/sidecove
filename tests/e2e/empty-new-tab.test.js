import { createServer } from 'node:http';
import { launchBrowserWithExtension, openSidebar, openOptionsPage } from './helpers/extension-helper.js';

// A new tab left empty closes when you switch to another tab. Typing an address and pressing
// Enter is the same as navigating, which tabs.update does here; the browser's own address bar
// cannot be driven from a test.
let server, siteUrl, browser, extensionId, page, otherId;
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const KEEP_MS = 1500;

const evaluate = (fn, ...args) => page.evaluate(fn, ...args);
const exists = id =>
    evaluate(
        id =>
            chrome.tabs.get(id).then(
                () => true,
                () => false
            ),
        id
    );
const activeId = () => evaluate(async () => (await chrome.tabs.query({ active: true, currentWindow: true }))[0].id);
const switchTo = id => evaluate(id => chrome.tabs.update(id, { active: true }), id);
async function waitClosed(id) {
    for (let i = 0; i < 50; i++) {
        if (!(await exists(id))) return true;
        await wait(100);
    }
    return false;
}
// Opens a tab the way Cmd+T does and waits until Chrome shows its new tab page.
async function openEmptyTab() {
    const id = await evaluate(async () => (await chrome.tabs.create({})).id);
    await page.waitForFunction(
        async id => /^chrome:\/\/(newtab|new-tab-page)\/?$/.test((await chrome.tabs.get(id)).url),
        { polling: 100 },
        id
    );
    return id;
}
const setSetting = value => evaluate(value => chrome.storage.sync.set({ closeEmptyNewTabs: value }), value);

beforeAll(async () => {
    server = createServer((req, res) => {
        res.setHeader('Content-Type', 'text/html');
        res.end('<title>Site</title><p>A site</p>');
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    siteUrl = `http://127.0.0.1:${server.address().port}/`;
    const result = await launchBrowserWithExtension();
    browser = result.browser;
    extensionId = result.extensionId;
    page = await openSidebar(browser, extensionId);
    otherId = await evaluate(async url => (await chrome.tabs.create({ url, active: false })).id, siteUrl);
});
afterAll(async () => {
    await browser?.close();
    if (server) await new Promise(resolve => server.close(resolve));
});
beforeEach(async () => {
    await setSetting(true);
    await switchTo(otherId);
});

test('closes by itself when you switch away without typing, and leaves you on the tab you chose', async () => {
    const empty = await openEmptyTab();
    await switchTo(otherId);

    expect(await waitClosed(empty)).toBe(true);
    expect(await activeId()).toBe(otherId);
});

test('the "+ New Tab" row works the same way', async () => {
    await page.bringToFront();
    const before = await evaluate(async () => (await chrome.tabs.query({})).map(t => t.id));
    await page.waitForSelector('.space.active .new-tab-btn');
    await page.$eval('.space.active .new-tab-btn', button => button.click());
    await page.waitForFunction(
        async before =>
            (await chrome.tabs.query({})).some(t => !before.includes(t.id) && /^chrome:\/\/new/.test(t.url)),
        { polling: 100 },
        before
    );
    const empty = await evaluate(
        async before => (await chrome.tabs.query({})).find(t => !before.includes(t.id)).id,
        before
    );
    await switchTo(otherId);

    expect(await waitClosed(empty)).toBe(true);
    expect(await activeId()).toBe(otherId);
});

test('stays open when the tab has gone to a site', async () => {
    const tab = await openEmptyTab();
    await evaluate((id, url) => chrome.tabs.update(id, { url }), tab, siteUrl);
    await page.waitForFunction(async id => (await chrome.tabs.get(id)).url.startsWith('http'), { polling: 100 }, tab);
    await switchTo(otherId);

    await wait(KEEP_MS);
    expect(await exists(tab)).toBe(true);
});

test('stays open when it is shown the new tab page again after visiting a site', async () => {
    const tab = await openEmptyTab();
    await evaluate((id, url) => chrome.tabs.update(id, { url }), tab, siteUrl);
    await page.waitForFunction(async id => (await chrome.tabs.get(id)).url.startsWith('http'), { polling: 100 }, tab);
    await evaluate(id => chrome.tabs.update(id, { url: 'chrome://newtab/' }), tab);
    await page.waitForFunction(
        async id => /^chrome:\/\/(newtab|new-tab-page)\/?$/.test((await chrome.tabs.get(id)).url),
        { polling: 100 },
        tab
    );
    await switchTo(otherId);

    await wait(KEEP_MS);
    expect(await exists(tab)).toBe(true);
});

test('stays open when it is a pinned tab', async () => {
    const tab = await openEmptyTab();
    await evaluate(id => chrome.tabs.update(id, { pinned: true }), tab);
    await switchTo(otherId);

    await wait(KEEP_MS);
    expect(await exists(tab)).toBe(true);
});

test('stays open when it is a favourite of a space', async () => {
    const tab = await openEmptyTab();
    await evaluate(async id => {
        const { spaces } = await chrome.runtime.sendMessage({ type: 'spaceStore', action: 'get' });
        await chrome.runtime.sendMessage({
            type: 'spaceStore',
            action: 'assign',
            tabId: id,
            spaceId: spaces[0].id,
            pinned: true
        });
    }, tab);
    await switchTo(otherId);

    await wait(KEEP_MS);
    expect(await exists(tab)).toBe(true);
});

test('never closes the last tab of a window', async () => {
    // A window of two tabs: the empty tab is active, and the other tab goes away just as you
    // switch to it, which leaves the empty tab alone in its window.
    const { emptyId, siteId } = await evaluate(async url => {
        const win = await chrome.windows.create({ url: 'chrome://newtab/', focused: true });
        const site = await chrome.tabs.create({ windowId: win.id, url, active: false });
        return { emptyId: win.tabs[0].id, siteId: site.id };
    }, siteUrl);
    await evaluate(async id => {
        await chrome.tabs.update(id, { active: true });
        await chrome.tabs.remove(id);
    }, siteId);

    await wait(KEEP_MS);
    expect(await exists(emptyId)).toBe(true);
});

test('stays open when the setting is turned off in Settings', async () => {
    const options = await openOptionsPage(browser, extensionId);
    const toggle = '#closeEmptyNewTabs';
    await options.waitForSelector(toggle);
    expect(await options.$eval(toggle, el => el.checked)).toBe(true);
    await options.evaluate(selector => document.querySelector(selector).click(), toggle);
    await options.waitForFunction(
        async () => (await chrome.storage.sync.get('closeEmptyNewTabs')).closeEmptyNewTabs === false,
        { polling: 100 }
    );
    await options.close();
    await page.bringToFront();

    const tab = await openEmptyTab();
    await switchTo(otherId);

    await wait(KEEP_MS);
    expect(await exists(tab)).toBe(true);
});
