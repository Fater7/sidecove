import { launchBrowserWithExtension, openSidebar, openOptionsPage } from './helpers/extension-helper.js';
import { dragOnto } from './helpers/drag.js';

let browser, page, options, first, second, favoriteA, favoriteB;
const waitForFavorites = ids =>
    page.waitForFunction(
        ids => {
            const visible = [...document.querySelectorAll('#pinnedFavicons .pinned-favicon')].map(
                el => el.dataset.bookmarkId
            );
            return JSON.stringify(visible) === JSON.stringify(ids);
        },
        { polling: 100 },
        ids
    );
const switchTo = async id => {
    await page.evaluate(id => document.querySelector(`#spaceSwitcher button[data-space-id="${id}"]`).click(), id);
    await page.waitForSelector(`.space.active[data-space-id="${id}"]`);
};

beforeAll(async () => {
    const result = await launchBrowserWithExtension();
    browser = result.browser;
    page = await openSidebar(browser, result.extensionId);
    options = await openOptionsPage(browser, result.extensionId);
    ({ first, second, favoriteA, favoriteB } = await page.evaluate(async () => {
        const getSpaces = async () => (await chrome.runtime.sendMessage({ type: 'spaceStore', action: 'get' })).spaces;
        const [space] = await getSpaces();
        const [folder] = await chrome.bookmarks.get(space.bookmarkFolderId);
        const otherFolder = await chrome.bookmarks.create({ parentId: folder.parentId, title: 'Other favorites' });
        const other = (await getSpaces()).find(item => item.bookmarkFolderId === otherFolder.id);
        const a = await chrome.bookmarks.create({
            parentId: folder.parentId,
            title: 'A',
            url: 'https://example.com/a'
        });
        const b = await chrome.bookmarks.create({
            parentId: folder.parentId,
            title: 'B',
            url: 'https://example.com/b'
        });
        await chrome.storage.local.set({ favoriteBookmarkOwners: { [a.id]: folder.id, [b.id]: otherFolder.id } });
        return { first: space.id, second: other.id, favoriteA: a.id, favoriteB: b.id };
    }));
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#spaceSwitcher button');
});

afterAll(async () => {
    await browser?.close();
});

test('favorites are shared by default and can be restricted to their space', async () => {
    await switchTo(first);
    await waitForFavorites([favoriteA, favoriteB]);
    await options.$eval('#perSpacePinnedFavorites', input => input.click());
    await waitForFavorites([favoriteA]);
    await switchTo(second);
    await waitForFavorites([favoriteB]);
    await options.$eval('#perSpacePinnedFavorites', input => input.click());
    await waitForFavorites([favoriteA, favoriteB]);
});

test('a closed favorite can be assigned to another space', async () => {
    await options.$eval('#perSpacePinnedFavorites', input => input.click());
    await switchTo(first);
    await waitForFavorites([favoriteA]);
    await dragOnto(
        page,
        `#pinnedFavicons [data-bookmark-id="${favoriteA}"]`,
        `#spaceSwitcher button[data-space-id="${second}"]`
    );
    await waitForFavorites([]);
    await switchTo(second);
    await waitForFavorites([favoriteA, favoriteB]);
});
