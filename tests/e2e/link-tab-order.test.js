/**
 * E2E tests for where a tab opened from a link lands in the tab list (issue 35).
 * A link opened from a tab in the list sits directly below it, several links stack in
 * opening order, and the "Show new tabs at the top" setting does not matter. A link opened
 * from a favourite goes to the top of the tab list. New tabs still obey the setting.
 */
import { createServer } from 'node:http';
import { launchBrowserWithExtension, openSidebar } from './helpers/extension-helper.js';
import { delay } from './helpers/test-utils.js';

const NAMES = ['t1', 't2', 't3', 'c1', 'c2', 'c3', 'blank', 'popup'];

describe('Link tab order', () => {
    let server;
    let origin;
    let browser;
    let extensionId;
    let sidebar;
    let pages;

    beforeAll(async () => {
        server = createServer((req, res) => {
            const name = req.url.split('?')[0].slice(1);
            res.setHeader('Content-Type', 'text/html');
            res.setHeader('Connection', 'close');
            const links = ['c1', 'c2', 'c3']
                .map(c => `<a id="${c}" href="/${c}">${c}</a>`)
                .concat(
                    '<a id="blank" href="/blank" target="_blank">blank</a>',
                    '<button id="popup" onclick="window.open(\'/popup\')">popup</button>'
                )
                .join(' ');
            res.end(`<title>${name}</title>${name === 't2' ? links : name}`);
        });
        await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
        origin = `http://127.0.0.1:${server.address().port}`;
    });

    afterAll(async () => {
        await new Promise(resolve => server.close(resolve));
    });

    afterEach(async () => {
        if (browser) await browser.close();
        browser = null;
    });

    // Opens t1, t2 and t3 in that order, with the setting as given, and a sidebar to read.
    async function start(invertTabOrder) {
        ({ browser, extensionId } = await launchBrowserWithExtension());
        pages = {};
        for (const name of ['t1', 't2', 't3']) {
            pages[name] = await browser.newPage();
            await pages[name].goto(`${origin}/${name}`, { waitUntil: 'domcontentloaded' });
        }
        sidebar = await openSidebar(browser, extensionId);
        await sidebar.evaluate(value => chrome.storage.sync.set({ invertTabOrder: value }), invertTabOrder);
        // Let the service worker pick the setting up before any tab is opened.
        await delay(500);
        await sidebar.reload({ waitUntil: 'domcontentloaded' });
        await delay(1000);
    }

    async function cmdClick(page, selector) {
        await page.bringToFront();
        await page.keyboard.down('Meta');
        await page.click(selector);
        await page.keyboard.up('Meta');
        await delay(400);
    }

    // The names of the tabs in the tab list, top to bottom, for the pages this test knows.
    function listed() {
        return sidebar.evaluate(async known => {
            const rows = document.querySelectorAll('[data-tab-type="temporary"] .tab[data-tab-id]');
            const names = [];
            for (const row of rows) {
                const tab = await chrome.tabs.get(Number(row.dataset.tabId));
                const url = tab.url || tab.pendingUrl || '';
                const name = url.startsWith('chrome://newtab') ? 'new' : url.slice(url.lastIndexOf('/') + 1);
                if (known.includes(name)) names.push(name);
            }
            return names;
        }, NAMES.concat('new'));
    }

    async function expectListed(expected) {
        let actual;
        for (let attempt = 0; attempt < 40; attempt++) {
            actual = await listed();
            if (JSON.stringify(actual) === JSON.stringify(expected)) break;
            await delay(250);
        }
        expect(actual).toEqual(expected);
    }

    // Chrome's own tab strip, left to right, for the pages this test knows.
    async function chromeOrder() {
        const tabs = await sidebar.evaluate(() => chrome.tabs.query({ currentWindow: true }));
        return tabs
            .map(tab => {
                const url = tab.url || tab.pendingUrl || '';
                return url.slice(url.lastIndexOf('/') + 1);
            })
            .filter(name => NAMES.includes(name));
    }

    test.each([
        ['on', true, ['t3', 't2', 'c1', 'c2', 'c3', 't1'], ['t1', 't2', 'c1', 'c2', 'c3', 't3']],
        ['off', false, ['t1', 't2', 'c1', 'c2', 'c3', 't3'], ['t1', 't2', 'c1', 'c2', 'c3', 't3']]
    ])(
        'links opened with Cmd+click stack below their tab in opening order, setting %s',
        async (label, invert, expectedList, expectedChrome) => {
            await start(invert);
            await cmdClick(pages.t2, '#c1');
            await cmdClick(pages.t2, '#c2');
            await cmdClick(pages.t2, '#c3');
            await expectListed(expectedList);
            expect(await chromeOrder()).toEqual(expectedChrome);
        },
        90000
    );

    test.each([
        ['on', true, ['t3', 't2', 'blank', 'popup', 't1']],
        ['off', false, ['t1', 't2', 'blank', 'popup', 't3']]
    ])(
        'a target=_blank link and window.open land below their tab, setting %s',
        async (label, invert, expected) => {
            await start(invert);
            await pages.t2.bringToFront();
            await pages.t2.click('#blank');
            await delay(600);
            await pages.t2.bringToFront();
            await pages.t2.click('#popup');
            await expectListed(expected);
        },
        90000
    );

    test.each([
        ['on', true, ['c1', 'c2', 'c3', 't3', 't1']],
        ['off', false, ['c1', 'c2', 'c3', 't1', 't3']]
    ])(
        'links opened from a favourite go to the top of the tab list in opening order, setting %s',
        async (label, invert, expected) => {
            await start(invert);
            await sidebar.evaluate(async () => {
                const [tab] = await chrome.tabs.query({ url: '*://127.0.0.1/t2' });
                await chrome.tabs.update(tab.id, { pinned: true });
            });
            await delay(500);
            await cmdClick(pages.t2, '#c1');
            await cmdClick(pages.t2, '#c2');
            await cmdClick(pages.t2, '#c3');
            await expectListed(expected);
        },
        90000
    );

    test.each([
        ['on', true, ['new', 't3', 't2', 't1']],
        ['off', false, ['t1', 't2', 't3', 'new']]
    ])(
        'new tabs ignore the opener and follow the setting, setting %s',
        async (label, invert, expected) => {
            await start(invert);
            // As the New Tab row does, and as Cmd+T can, with the current tab as an incidental opener.
            await sidebar.evaluate(async () => {
                const [opener] = await chrome.tabs.query({ url: '*://127.0.0.1/t2' });
                await chrome.tabs.create({ openerTabId: opener.id, active: false });
            });
            await expectListed(expected);
        },
        90000
    );
});
