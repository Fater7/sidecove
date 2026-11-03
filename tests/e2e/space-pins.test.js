import { launchBrowserWithExtension, openSidebar } from './helpers/extension-helper.js';

let browser, page, first, second, pinA, pinB;
const visiblePins = () =>
    page.$$eval('#pinnedFavicons .pinned-favicon', els => els.map(el => Number(el.dataset.tabId)));
const waitForPins = ids =>
    page.waitForFunction(
        ids => {
            const visible = [...document.querySelectorAll('#pinnedFavicons .pinned-favicon')].map(el =>
                Number(el.dataset.tabId)
            );
            return JSON.stringify(visible) === JSON.stringify(ids);
        },
        { polling: 100 },
        ids
    );
const switchTo = async id => {
    await page.evaluate(id => document.querySelector(`#spaceSwitcher button[data-space-id="${id}"]`).click(), id);
    await page.waitForSelector(`.space.active[data-space-id="${id}"]`);
    // Allow Chrome's activation event from the selected space's last tab to settle.
    await new Promise(resolve => setTimeout(resolve, 300));
};

beforeAll(async () => {
    const result = await launchBrowserWithExtension();
    browser = result.browser;
    page = await openSidebar(browser, result.extensionId);
    ({ first, second, pinA, pinB } = await page.evaluate(async () => {
        const request = async (action, args = {}) => {
            const response = await chrome.runtime.sendMessage({ type: 'spaceStore', action, ...args });
            if (!response.success) throw new Error(response.error);
            return response.spaces;
        };
        const spaces = await request('get');
        const [folder] = await chrome.bookmarks.get(spaces[0].bookmarkFolderId);
        await chrome.bookmarks.create({ parentId: folder.parentId, title: 'Other pins' });
        const next = await request('get');
        const first = spaces[0].id;
        const second = next.find(space => space.name === 'Other pins').id;
        const { id: windowId } = await chrome.windows.getCurrent();
        await request('activate', { windowId, spaceId: first });
        const a = await chrome.tabs.create({ url: 'https://example.com/#pin-a', pinned: true, active: false });
        await request('get');
        await request('activate', { windowId, spaceId: second });
        const b = await chrome.tabs.create({ url: 'https://example.org/#pin-b', pinned: true, active: false });
        await request('get');
        return { first, second, pinA: a.id, pinB: b.id };
    }));
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#spaceSwitcher button');
});
afterAll(async () => {
    await browser?.close();
});

test('the top bar follows the selected space and keeps its pins after panel reload', async () => {
    await switchTo(first);
    await waitForPins([pinA]);
    expect(await visiblePins()).toEqual([pinA]);
    await switchTo(second);
    await waitForPins([pinB]);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await waitForPins([pinB]);
    // Activating another space's pin in Chrome also selects its owning space.
    await page.evaluate(id => chrome.tabs.update(id, { active: true }), pinA);
    await waitForPins([pinA]);
    await page.waitForSelector(`.space.active[data-space-id="${first}"]`);
});

test('unpinning removes the icon and returns the tab to its space', async () => {
    await page.evaluate(id => chrome.tabs.update(id, { pinned: false }), pinA);
    await waitForPins([]);
    await page.waitForSelector(`.space.active .tab[data-tab-id="${pinA}"]`);
    await switchTo(second);
    await waitForPins([pinB]);
    await page.evaluate(id => chrome.tabs.remove(id), pinB);
    await waitForPins([]);
});
