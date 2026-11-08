import { createServer } from 'node:http';
import { launchBrowserWithExtension, openSidebar, getBackgroundServiceWorker } from './helpers/extension-helper.js';

let browser, sidebar, server, base;

beforeAll(async () => {
    server = createServer((_req, res) => {
        res.setHeader('Content-Type', 'text/html');
        res.end('<title>Duplicate test</title>');
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${server.address().port}/same`;
    const result = await launchBrowserWithExtension();
    browser = result.browser;
    sidebar = await openSidebar(browser, result.extensionId);
    await sidebar.waitForSelector('.space.active');
});

afterAll(async () => {
    await browser?.close();
    await new Promise(resolve => server?.close(resolve));
});

test('a scheduled check closes old exact duplicates within a space and keeps one', async () => {
    const ids = await sidebar.evaluate(async url => {
        const currentWindow = await chrome.windows.getCurrent();
        const { spaces } = await chrome.runtime.sendMessage({ type: 'spaceStore', action: 'get' });
        const tabs = [];
        for (let i = 0; i < 2; i++) {
            const tab = await chrome.tabs.create({ windowId: currentWindow.id, url, active: false });
            tabs.push(tab.id);
            await chrome.runtime.sendMessage({
                type: 'spaceStore',
                action: 'assign',
                tabId: tab.id,
                spaceId: spaces[0].id
            });
        }
        await chrome.storage.sync.set({ mergeDuplicateTabsEnabled: true, mergeDuplicateTabsIdleMinutes: 120 });
        await chrome.storage.session.set({
            duplicateTabsFirstSeen: Object.fromEntries(tabs.map(id => [id, Date.now()]))
        });
        return tabs;
    }, base);
    await sidebar.waitForFunction(
        async ids => {
            const tabs = await Promise.all(ids.map(id => chrome.tabs.get(id)));
            return tabs.every(tab => tab.status === 'complete' && !tab.pendingUrl);
        },
        { timeout: 15000 },
        ids
    );
    const worker = await getBackgroundServiceWorker(browser);
    // Advance only the isolated test worker's clock; Chrome's real tab activity stays unchanged.
    await worker.evaluate(() => {
        const realNow = Date.now;
        Date.now = () => realNow() + 121 * 60_000;
    });
    await sidebar.evaluate(() => chrome.alarms.create('mergeDuplicateTabs', { delayInMinutes: 0.5 }));
    await sidebar.waitForFunction(
        async ids => {
            const tabs = await chrome.tabs.query({});
            return tabs.filter(tab => ids.includes(tab.id)).length === 1;
        },
        { timeout: 45000, polling: 500 },
        ids
    );
}, 60000);
