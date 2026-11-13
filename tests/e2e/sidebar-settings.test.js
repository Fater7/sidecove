import { launchBrowserWithExtension, openOptionsPage, openSidebar } from './helpers/extension-helper.js';

let browser, sidebar, options;

beforeAll(async () => {
    const result = await launchBrowserWithExtension();
    browser = result.browser;
    sidebar = await openSidebar(browser, result.extensionId);
    options = await openOptionsPage(browser, result.extensionId);
    await sidebar.waitForSelector('.space.active');
});

afterAll(async () => {
    await browser?.close();
});

test('search is hidden by default and follows the setting', async () => {
    expect(await sidebar.$eval('#tabSearch', element => getComputedStyle(element).display)).toBe('none');
    await options.waitForSelector('#showTabSearch');
    expect(await options.$eval('#showTabSearch', input => input.checked)).toBe(false);
    await options.$eval('#showTabSearch', input => input.click());
    await sidebar.waitForFunction(() => getComputedStyle(document.getElementById('tabSearch')).display !== 'none');
    await sidebar.$eval('#tabSearchInput', input => {
        input.value = 'example';
        input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await options.$eval('#showTabSearch', input => input.click());
    await sidebar.waitForFunction(() => getComputedStyle(document.getElementById('tabSearch')).display === 'none');
    expect(await sidebar.$eval('#tabSearchResults', element => element.hidden)).toBe(true);
    expect(await sidebar.$eval('#spacesList', element => getComputedStyle(element).display)).not.toBe('none');
    await options.reload();
    expect(await options.$eval('#showTabSearch', input => input.checked)).toBe(false);
});

test('archive and Clear are hidden by default and follow the setting', async () => {
    for (const selector of ['.space.active .sidebar-button', '.space.active .clean-tabs-btn']) {
        expect(await sidebar.$eval(selector, element => getComputedStyle(element).display)).toBe('none');
    }
    expect(await options.$eval('#archiveAndClearEnabled', input => input.checked)).toBe(false);
    await options.$eval('#archiveAndClearEnabled', input => input.click());
    await sidebar.waitForFunction(() => document.body.classList.contains('archive-and-clear-enabled'));
    for (const selector of ['.space.active .sidebar-button', '.space.active .clean-tabs-btn']) {
        expect(await sidebar.$eval(selector, element => getComputedStyle(element).display)).not.toBe('none');
    }
    await sidebar.$eval('.space.active .sidebar-button', button => button.click());
    expect(await sidebar.$eval('.space.active .archived-tabs-popup', popup => popup.classList.contains('visible'))).toBe(true);
    await options.$eval('#archiveAndClearEnabled', input => input.click());
    await sidebar.waitForFunction(() => !document.body.classList.contains('archive-and-clear-enabled'));
    expect(await sidebar.$eval('.space.active .archived-tabs-popup', popup => popup.classList.contains('visible'))).toBe(false);
    expect(await sidebar.$eval('.space.active .space-content', content => content.classList.contains('hidden'))).toBe(false);
});

test('duplicate merging is on by default and its interval can be changed', async () => {
    expect(await options.$eval('#mergeDuplicateTabsEnabled', input => input.checked)).toBe(true);
    expect(await options.$eval('#mergeDuplicateTabsIdleMinutes', input => input.value)).toBe('120');
    await options.$eval('#mergeDuplicateTabsEnabled', input => input.click());
    expect(await options.$eval('#mergeDuplicateTabsIdleMinutes', input => input.disabled)).toBe(true);
    await options.$eval('#mergeDuplicateTabsEnabled', input => input.click());
    expect(await options.$eval('#mergeDuplicateTabsIdleMinutes', input => input.disabled)).toBe(false);
    await options.$eval('#mergeDuplicateTabsIdleMinutes', input => {
        input.value = '90';
        input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await options.waitForFunction(async () => (await chrome.storage.sync.get('mergeDuplicateTabsIdleMinutes')).mergeDuplicateTabsIdleMinutes === 90);
    await options.reload();
    expect(await options.$eval('#mergeDuplicateTabsEnabled', input => input.checked)).toBe(true);
    expect(await options.$eval('#mergeDuplicateTabsIdleMinutes', input => input.value)).toBe('90');
    await options.$eval('#mergeDuplicateTabsEnabled', input => input.click());
});

test('folders expand and collapse without a hover arrow', async () => {
    const folderId = await sidebar.evaluate(async () => {
        const [root] = await chrome.bookmarks.search({ title: 'FaterSide' });
        const [space] = (await chrome.bookmarks.getChildren(root.id)).filter(node => !node.url);
        const folder = await chrome.bookmarks.create({ parentId: space.id, title: 'Folder' });
        await chrome.bookmarks.create({ parentId: folder.id, title: 'Example', url: 'https://example.com/' });
        return folder.id;
    });
    const row = `.folder[data-bookmark-id="${folderId}"]`;
    await sidebar.waitForSelector(row);
    expect(await sidebar.$eval(`${row} .folder-toggle`, button => getComputedStyle(button, '::before').content)).toBe(
        'none'
    );
    const wasCollapsed = await sidebar.$eval(row, folder => folder.classList.contains('collapsed'));
    await sidebar.$eval(`${row} .folder-header`, header => header.click());
    await sidebar.waitForFunction(
        (selector, previous) => document.querySelector(selector).classList.contains('collapsed') !== previous,
        {},
        row,
        wasCollapsed
    );
});

test('collapsing a folder also collapses every descendant and saves their states', async () => {
    const ids = await sidebar.evaluate(async () => {
        const [root] = await chrome.bookmarks.search({ title: 'FaterSide' });
        const [space] = (await chrome.bookmarks.getChildren(root.id)).filter(node => !node.url);
        const parent = await chrome.bookmarks.create({ parentId: space.id, title: 'Parent' });
        const child = await chrome.bookmarks.create({ parentId: parent.id, title: 'Child' });
        const grandchild = await chrome.bookmarks.create({ parentId: child.id, title: 'Grandchild' });
        const sibling = await chrome.bookmarks.create({ parentId: space.id, title: 'Sibling' });
        const ids = [parent.id, child.id, grandchild.id, sibling.id];
        await chrome.storage.local.set(Object.fromEntries(ids.map(id => [`folderCollapsed:${id}`, false])));
        return ids;
    });
    const [parent, child, grandchild, sibling] = ids.map(id => `.folder[data-bookmark-id="${id}"]`);
    await sidebar.reload();
    await sidebar.waitForSelector(parent);
    await sidebar.waitForSelector(grandchild);
    expect(await sidebar.$eval(grandchild, folder => folder.classList.contains('collapsed'))).toBe(false);
    await sidebar.$eval(`${parent} > .folder-header`, header => header.click());
    await sidebar.waitForFunction(async ids => {
        const values = await chrome.storage.local.get(ids.map(id => `folderCollapsed:${id}`));
        return ids.slice(0, 3).every(id => values[`folderCollapsed:${id}`] === true);
    }, {}, ids);
    await sidebar.$eval(`${parent} > .folder-header`, header => header.click());
    for (const selector of [child, grandchild]) {
        expect(await sidebar.$eval(selector, folder => folder.classList.contains('collapsed'))).toBe(true);
    }
    expect(await sidebar.$eval(sibling, folder => folder.classList.contains('collapsed'))).toBe(false);
    await sidebar.waitForFunction(async id => (await chrome.storage.local.get(`folderCollapsed:${id}`))[`folderCollapsed:${id}`] === false, {}, ids[0]);
    await sidebar.reload();
    await sidebar.waitForSelector(parent);
    expect(await sidebar.$eval(parent, folder => folder.classList.contains('collapsed'))).toBe(false);
    for (const selector of [child, grandchild]) {
        expect(await sidebar.$eval(selector, folder => folder.classList.contains('collapsed'))).toBe(true);
    }
    expect(await sidebar.$eval(sibling, folder => folder.classList.contains('collapsed'))).toBe(false);
});
