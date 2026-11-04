import { createServer } from 'node:http';
import { launchBrowserWithExtension, openSidebar } from './helpers/extension-helper.js';

// Reported by a user from Arc: closing a tab moved Sidecove to another space whenever Chrome
// picked a tab of that space to show next. As in Arc, a close keeps you in your space.
let server, base, browser, extensionId, page;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

const activeSpaceName = () => page.$eval('.space.active .space-name', input => input.value);
const spaceByName = name =>
    page.evaluate(
        async name =>
            (await chrome.runtime.sendMessage({ type: 'spaceStore', action: 'get' })).spaces.find(s => s.name === name),
        name
    );
const activeTabId = () =>
    page.evaluate(async () => {
        const { id: windowId } = await chrome.windows.getCurrent();
        return (await chrome.tabs.query({ windowId, active: true }))[0]?.id;
    });
const activateTab = tabId => page.evaluate(id => chrome.tabs.update(id, { active: true }), tabId);
const closeTab = tabId => page.evaluate(id => chrome.tabs.remove(id), tabId);
const urlOf = tabId => page.evaluate(async id => (await chrome.tabs.get(id)).url, tabId);

async function createSpaceInPage(name) {
    await page.$eval('#addSpaceBtn', button => button.click());
    await page.$eval(
        '#newSpaceName',
        (input, name) => {
            input.value = name;
            input.dispatchEvent(new Event('input', { bubbles: true }));
        },
        name
    );
    await page.$eval('#createSpaceBtn', button => button.click());
    await page.waitForFunction(
        name => document.querySelector('#spaceSwitcher button.active')?.textContent.includes(name),
        { polling: 100 },
        name
    );
}

async function showSpace(name) {
    await page.evaluate(name => {
        const chip = [...document.querySelectorAll('#spaceSwitcher button')].find(b => b.textContent.includes(name));
        chip.click();
    }, name);
    await page.waitForFunction(
        name => document.querySelector('.space.active .space-name').value === name,
        { polling: 100 },
        name
    );
    await sleep(300);
}

async function openTab(path, spaceName, openerTabId) {
    const space = await spaceByName(spaceName);
    const tabId = await page.evaluate(
        async ({ url, spaceId, openerTabId }) => {
            const tab = await chrome.tabs.create({ url, active: false, openerTabId });
            await chrome.runtime.sendMessage({ type: 'spaceStore', action: 'assign', tabId: tab.id, spaceId });
            return tab.id;
        },
        { url: `${base}/${path}`, spaceId: space.id, openerTabId }
    );
    return tabId;
}

// Space A holds the tabs under test. A tab of space B was visited last, then the user came
// back to A, so a close in A is the case where Chrome may show a tab of B next.
async function setUp(a, b, pathsInA, pathsInB = ['b-1', 'b-2']) {
    await createSpaceInPage(a);
    await createSpaceInPage(b);
    const tabsInB = [];
    for (const path of pathsInB) tabsInB.push(await openTab(`${a}-${path}`, b));
    const tabsInA = [];
    for (const path of pathsInA) tabsInA.push(await openTab(`${a}-${path}`, a));
    await activateTab(tabsInB.at(-1));
    await sleep(500);
    await showSpace(a);
    return { tabsInA, tabsInB };
}

beforeAll(async () => {
    server = createServer((req, res) => {
        res.setHeader('Content-Type', 'text/html');
        res.end(`<title>${req.url.slice(1) || 'root'} page</title><p>${req.url}</p>`);
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${server.address().port}`;
});

// A fresh browser per test: a close that moved to another space must not shape the next one.
beforeEach(async () => {
    ({ browser, extensionId } = await launchBrowserWithExtension());
    page = await openSidebar(browser, extensionId);
    await page.setViewport({ width: 360, height: 800 });
    page.on('pageerror', error => console.error('Sidebar error:', error.message));
});

afterEach(async () => {
    await browser?.close();
});

afterAll(async () => {
    if (server) await new Promise(resolve => server.close(resolve));
});

const displayedTabs = () =>
    page.$$eval('.space.active [data-tab-type="temporary"] .tab[data-tab-id]', rows =>
        rows.map(row => Number(row.dataset.tabId))
    );

describe('closing a tab keeps the space you are in', () => {
    // Chrome returns to the tab a closed tab was opened from, which can sit in another space.
    test('a tab opened from another space closes: stay, and show the next tab down the list', async () => {
        const { tabsInA, tabsInB } = await setUp('Alpha', 'Beta', ['one']);
        const two = await openTab('Alpha-two', 'Alpha', tabsInB[0]);
        const three = await openTab('Alpha-three', 'Alpha');
        await activateTab(two);
        await sleep(500);
        // New tabs join the top of the list.
        expect(await displayedTabs()).toEqual([three, two, tabsInA[0]]);

        // Close it from the sidebar, as a user does.
        await page.waitForSelector(`.tab[data-tab-id="${two}"] .tab-close`);
        await page.$eval(`.tab[data-tab-id="${two}"] .tab-close`, button => button.click());
        await sleep(1500);

        expect(await activeSpaceName()).toBe('Alpha');
        expect(await activeTabId()).toBe(tabsInA[0]);
        // Beta still remembers the tab the user last visited there, not the one Chrome picked.
        expect((await spaceByName('Beta')).lastTab).toBe(tabsInB.at(-1));
        // The service worker still has Alpha as this window's space (a new sidebar opens on it).
        const { activeSpaces } = await page.evaluate(() => chrome.storage.session.get('activeSpaces'));
        const { id: windowId } = await page.evaluate(() => chrome.windows.getCurrent());
        expect(activeSpaces[windowId]).toBe((await spaceByName('Alpha')).id);
    });

    test('a tab in the middle closes: show the next one down the list, whatever Chrome would pick', async () => {
        const { tabsInA } = await setUp('Iota', 'Kappa', ['one', 'two', 'three']);
        await activateTab(tabsInA[1]);
        await sleep(500);
        // Chrome would show the tab to its right, which the list draws above it.
        expect(await displayedTabs()).toEqual([tabsInA[2], tabsInA[1], tabsInA[0]]);

        await closeTab(tabsInA[1]);
        await sleep(1500);

        expect(await activeSpaceName()).toBe('Iota');
        expect(await activeTabId()).toBe(tabsInA[0]);
    });

    test('the last tab of the list closes: stay, and show the tab above it', async () => {
        const { tabsInB } = await setUp('Gamma', 'Delta', []);
        const one = await openTab('Gamma-one', 'Gamma', tabsInB[0]);
        const two = await openTab('Gamma-two', 'Gamma');
        await activateTab(one);
        await sleep(500);
        expect(await displayedTabs()).toEqual([two, one]);

        await closeTab(one);
        await sleep(1500);

        expect(await activeSpaceName()).toBe('Gamma');
        expect(await activeTabId()).toBe(two);
    });

    test('the only tab of the space closes: stay in the space with a new tab', async () => {
        const { tabsInA, tabsInB } = await setUp('Epsilon', 'Zeta', ['only']);
        await activateTab(tabsInA[0]);
        await sleep(500);

        await closeTab(tabsInA[0]);
        await sleep(2000);

        expect(await activeSpaceName()).toBe('Epsilon');
        const epsilon = await spaceByName('Epsilon');
        expect(epsilon.temporaryTabs).toHaveLength(1);
        expect(await activeTabId()).toBe(epsilon.temporaryTabs[0]);
        expect(await urlOf(epsilon.temporaryTabs[0])).toMatch(/newtab|new-tab-page|about:blank/);
        expect((await spaceByName('Zeta')).temporaryTabs).toEqual(expect.arrayContaining(tabsInB));
    });

    test('opening a tab of another space on purpose still switches to that space', async () => {
        const { tabsInB } = await setUp('Eta', 'Theta', ['one', 'two']);
        await activateTab(tabsInB[0]);
        await page.waitForFunction(() => document.querySelector('.space.active .space-name').value === 'Theta', {
            polling: 100
        });
        expect(await activeSpaceName()).toBe('Theta');
    });
});
