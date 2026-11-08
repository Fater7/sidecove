import { createServer } from 'node:http';
import { launchBrowserWithExtension, openSidebar, openOptionsPage } from './helpers/extension-helper.js';

// Switching to a space with no open tab in the window opens a New Tab in that space, so the
// page of the space you left is never left on screen. Leaving that New Tab empty closes it;
// a New Tab you used stays. Spaces: Home (one tab), Two (two tabs), Three and Four (none).
let server, base, browser, sidebar, options, windowId;
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const NEW_TAB = /^chrome:\/\/(newtab|new-tab-page)\/?$/;

async function until(read, done, message) {
    let value;
    for (let i = 0; i < 60; i++) {
        value = await read();
        if (done(value)) return value;
        await wait(100);
    }
    throw new Error(`${message}; last value: ${JSON.stringify(value)}`);
}

const addSpace = async (name, color) => {
    await sidebar.$eval('#addSpaceBtn', button => button.click());
    await sidebar.$eval(
        '#newSpaceName',
        (input, value) => {
            input.value = value;
            input.dispatchEvent(new Event('input', { bubbles: true }));
        },
        name
    );
    await sidebar.$eval(
        '#spaceColor',
        (select, value) => {
            select.value = value;
        },
        color
    );
    await sidebar.$eval('#createSpaceBtn', button => button.click());
    await sidebar.waitForFunction(
        name => document.querySelector('#spaceSwitcher button.active')?.textContent.includes(name),
        { polling: 100 },
        name
    );
};

const clickChip = async name => {
    await sidebar.evaluate(
        name =>
            [...document.querySelectorAll('#spaceSwitcher button[data-space-id]')]
                .find(button => button.textContent.includes(name))
                .click(),
        name
    );
    await sidebar.waitForFunction(
        name => document.querySelector('#spaceSwitcher button.active')?.textContent.includes(name),
        { polling: 100 },
        name
    );
};

// The shortcut path: the service worker asks the open panel of the window to switch.
const pressSlot = slot =>
    options.evaluate(
        (windowId, slot) => chrome.runtime.sendMessage({ command: 'switchSpace', windowId, request: { slot } }),
        windowId,
        slot
    );

const activeTab = () =>
    sidebar.evaluate(async windowId => {
        const [tab] = await chrome.tabs.query({ active: true, windowId });
        return { id: tab.id, url: tab.pendingUrl || tab.url };
    }, windowId);
const spaceOf = tabId =>
    sidebar.evaluate(async tabId => {
        const { spaces } = await chrome.runtime.sendMessage({ type: 'spaceStore', action: 'get' });
        return spaces.find(s => [...s.spaceBookmarks, ...s.temporaryTabs].includes(tabId))?.name ?? null;
    }, tabId);
const tabsOf = name =>
    sidebar.evaluate(async name => {
        const { spaces } = await chrome.runtime.sendMessage({ type: 'spaceStore', action: 'get' });
        const space = spaces.find(s => s.name === name);
        return [...space.spaceBookmarks, ...space.temporaryTabs];
    }, name);
const exists = id =>
    sidebar.evaluate(
        id =>
            chrome.tabs.get(id).then(
                () => true,
                () => false
            ),
        id
    );

async function openInSpace(name, path) {
    await clickChip(name);
    const id = await sidebar.evaluate(async url => (await chrome.tabs.create({ url, active: true })).id, base + path);
    await until(
        () => spaceOf(id),
        owner => owner === name,
        `tab ${path} did not join ${name}`
    );
    return id;
}

beforeAll(async () => {
    server = createServer((req, res) => {
        res.setHeader('Content-Type', 'text/html');
        res.end(`<title>${req.url.slice(1)}</title><p>A site</p>`);
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${server.address().port}/`;
    const result = await launchBrowserWithExtension();
    browser = result.browser;
    sidebar = await openSidebar(browser, result.extensionId);
    options = await openOptionsPage(browser, result.extensionId);
    windowId = await sidebar.evaluate(async () => (await chrome.windows.getCurrent()).id);
    await addSpace('Two', 'blue');
    await addSpace('Three', 'pink');
    await addSpace('Four', 'green');
}, 60000);

afterAll(async () => {
    await browser?.close();
    if (server) await new Promise(resolve => server.close(resolve));
});

describe('switching to a space with no open tab', () => {
    let twoLast, homeTab;
    beforeAll(async () => {
        homeTab = await openInSpace('Home', 'home-tab');
        await openInSpace('Two', 'two-a');
        twoLast = await openInSpace('Two', 'two-b');
    }, 60000);

    test.each([
        ['clicking its chip', name => clickChip(name), 'chip'],
        ['the keyboard shortcut', () => pressSlot(3), 'shortcut']
    ])('%s opens a New Tab in it, and leaving it empty closes it again', async (_, switchToThree) => {
        await clickChip('Two');
        await until(activeTab, tab => tab.id === twoLast, 'Two should show its last tab');
        const homeBefore = await tabsOf('Home');
        const twoBefore = await tabsOf('Two');

        await switchToThree('Three');
        const shown = await until(
            activeTab,
            tab => NEW_TAB.test(tab.url),
            'Three should show a New Tab, not the tab of Two'
        );
        expect(await spaceOf(shown.id)).toBe('Three');
        expect(await tabsOf('Three')).toEqual([shown.id]);
        expect(await tabsOf('Home')).toEqual(homeBefore);
        expect(await tabsOf('Two')).toEqual(twoBefore);

        await clickChip('Two');
        await until(
            () => exists(shown.id),
            present => !present,
            'the empty New Tab should close'
        );
        expect((await activeTab()).id).toBe(twoLast);
        expect(await tabsOf('Three')).toEqual([]);
        expect(await exists(homeTab)).toBe(true);
    });

    test('a New Tab you used stays, and the space shows it next time instead of opening another', async () => {
        await clickChip('Four');
        const shown = await until(activeTab, tab => NEW_TAB.test(tab.url), 'Four should show a New Tab');
        await sidebar.evaluate((id, url) => chrome.tabs.update(id, { url }), shown.id, `${base}used`);
        await until(activeTab, tab => tab.url.endsWith('/used'), 'the New Tab should load the site');

        await clickChip('Two');
        await until(activeTab, tab => tab.id === twoLast, 'Two should show its last tab');
        expect(await exists(shown.id)).toBe(true);

        await clickChip('Four');
        await until(activeTab, tab => tab.id === shown.id, 'Four should show its tab');
        expect(await tabsOf('Four')).toEqual([shown.id]);
    });

    test('switching twice in a row opens only one New Tab', async () => {
        await clickChip('Two');
        const before = await sidebar.evaluate(
            async windowId => (await chrome.tabs.query({ windowId })).length,
            windowId
        );
        await sidebar.evaluate(() => {
            const chip = [...document.querySelectorAll('#spaceSwitcher button[data-space-id]')].find(button =>
                button.textContent.includes('Three')
            );
            chip.click();
            chip.click();
        });
        await until(
            () => tabsOf('Three'),
            ids => ids.length === 1,
            'Three should get a New Tab'
        );
        await wait(1000);
        expect(await tabsOf('Three')).toHaveLength(1);
        const after = await sidebar.evaluate(
            async windowId => (await chrome.tabs.query({ windowId })).length,
            windowId
        );
        expect(after).toBe(before + 1);
    });

    test('a delayed activation from the previous space cannot undo a space switch', async () => {
        await clickChip('Two');
        await until(activeTab, tab => tab.id === twoLast, 'Two should show its last tab');
        await sidebar.evaluate(() => {
            const original = chrome.storage.sync.get.bind(chrome.storage.sync);
            window.delayedActivation = false;
            chrome.storage.sync.get = async keys => {
                if (keys === 'perSpacePinnedFavorites' && !window.delayedActivation) {
                    window.delayedActivation = true;
                    await new Promise(resolve => (window.releaseActivation = resolve));
                }
                return original(keys);
            };
        });
        await sidebar.evaluate(id => chrome.tabs.update(id, { active: true }), homeTab);
        await sidebar.waitForFunction(() => window.delayedActivation);
        await clickChip('Two');
        await until(activeTab, tab => tab.id === twoLast, 'Two should show its last tab');
        await sidebar.evaluate(() => window.releaseActivation());
        await wait(1000);
        expect(await sidebar.$eval('.space.active .space-name', input => input.value)).toBe('Two');
        expect((await activeTab()).id).toBe(twoLast);
    });

    test('one long horizontal wheel gesture switches only once', async () => {
        await clickChip('Home');
        await until(activeTab, tab => tab.id === homeTab, 'Home should show its last tab');
        const prevented = [];
        for (let i = 0; i < 6; i++) {
            prevented.push(
                await sidebar.evaluate(() => {
                    const event = new WheelEvent('wheel', { deltaX: 30, bubbles: true, cancelable: true });
                    document.getElementById('sidebar-container').dispatchEvent(event);
                    return event.defaultPrevented;
                })
            );
            await wait(120);
        }
        await wait(500);
        expect(await sidebar.$eval('.space.active .space-name', input => input.value)).toBe('Two');
        expect((await activeTab()).id).toBe(twoLast);
        expect(prevented).toEqual([true, true, true, true, true, true]);
    });
});
