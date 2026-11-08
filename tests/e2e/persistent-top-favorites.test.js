import { launchBrowserWithExtension, openSidebar } from './helpers/extension-helper.js';
import { createServer } from 'node:http';
import { dragOnto } from './helpers/drag.js';

let browser, page, server, url;

beforeAll(async () => {
    server = createServer((_request, response) => response.end('<title>Persistent favorite</title>'));
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    url = `http://127.0.0.1:${server.address().port}/favorite`;
    const result = await launchBrowserWithExtension();
    browser = result.browser;
    page = await openSidebar(browser, result.extensionId);
    page.on('pageerror', error => console.error('sidebar error:', error.message));
});

afterAll(async () => {
    await browser?.close();
    await new Promise(resolve => server.close(resolve));
});

test('a favorite survives closing and reopening its tab and can be explicitly removed', async () => {
    const bookmarkId = await page.evaluate(async url => {
        const [root] = (await chrome.bookmarks.search({ title: 'Sidecove' })).filter(node => !node.url);
        return (await chrome.bookmarks.create({ parentId: root.id, title: 'Persistent favorite', url })).id;
    }, url);
    const favorite = `#pinnedFavicons [data-bookmark-id="${bookmarkId}"]`;
    await page.waitForSelector(favorite);
    await page.$eval(favorite, el => el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 })));
    const tabId = await page
        .waitForFunction(
            async url => (await chrome.tabs.query({})).find(tab => tab.url === url)?.id,
            { timeout: 5000, polling: 100 },
            url
        )
        .then(handle => handle.jsonValue());
    await page.evaluate(id => chrome.tabs.remove(id), tabId);
    await page.waitForFunction(
        selector => {
            const el = document.querySelector(selector);
            return el && !el.dataset.tabId;
        },
        { polling: 100 },
        favorite
    );
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector(favorite);
    await page.$eval(favorite, el => el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 })));
    await page.waitForFunction(
        async url => (await chrome.tabs.query({})).some(tab => tab.url === url),
        { polling: 100 },
        url
    );
    await page.$eval(favorite, el => el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true })));
    await page.$eval('#favorite-context-menu .context-menu-item', el => el.click());
    await page.waitForFunction(
        selector => !document.querySelector(selector),
        { polling: 100, timeout: 5000 },
        favorite
    );
    expect(
        await page.evaluate(
            id =>
                chrome.bookmarks.get(id).then(
                    () => true,
                    () => false
                ),
            bookmarkId
        )
    ).toBe(false);
});

test('dragging a tab into favorites saves a bookmark without pinning the Chrome tab', async () => {
    const address = `${url}?drag`;
    const tabId = await page.evaluate(
        async address => (await chrome.tabs.create({ url: address, active: false })).id,
        address
    );
    const tab = `.space.active .tab[data-tab-id="${tabId}"]`;
    await page.waitForSelector(tab);
    await dragOnto(page, tab, '#pinnedFavicons');
    await page.waitForFunction(
        address =>
            [...document.querySelectorAll('#pinnedFavicons .pinned-favicon')].some(el => el.dataset.url === address),
        { polling: 100 },
        address
    );
    expect(await page.evaluate(id => chrome.tabs.get(id).then(tab => tab.pinned), tabId)).toBe(false);
    await page.evaluate(id => chrome.tabs.remove(id), tabId);
    expect(await page.$eval('#pinnedFavicons .pinned-favicon', el => el.dataset.url)).toBe(address);
});
