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
