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
