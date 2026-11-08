import { LocalStorage } from '../../../shared/localstorage.js';

const OWNERS = 'favoriteBookmarkOwners';
let queue = Promise.resolve();

function serialize(action) {
    const result = queue.then(action);
    queue = result.catch(() => {});
    return result;
}

async function rootAndFavorites() {
    const root = await LocalStorage.getOrCreateSidecoveFolder();
    return { root, favorites: (await chrome.bookmarks.getChildren(root.id)).filter(node => node.url) };
}

export async function readFavoriteBookmarks() {
    const { favorites } = await rootAndFavorites();
    const { [OWNERS]: owners = {} } = await chrome.storage.local.get(OWNERS);
    return { favorites, owners };
}

async function addFavorite(root, favorites, owners, tab, ownerId) {
    const url = tab.url || tab.pendingUrl;
    if (!url || /^(chrome|chrome-extension|about):/.test(url)) return null;
    let favorite = favorites.find(item => item.url === url);
    if (!favorite) {
        favorite = await chrome.bookmarks.create({ parentId: root.id, title: tab.title || url, url });
        favorites.push(favorite);
    }
    if (ownerId && !owners[favorite.id]) owners[favorite.id] = ownerId;
    return favorite;
}

export function saveFavorite(tab, ownerId) {
    return serialize(async () => {
        const { root, favorites } = await rootAndFavorites();
        const { [OWNERS]: owners = {} } = await chrome.storage.local.get(OWNERS);
        const favorite = await addFavorite(root, favorites, owners, tab, ownerId);
        await chrome.storage.local.set({ [OWNERS]: owners });
        return favorite;
    });
}

export function removeFavorite(id) {
    return serialize(async () => {
        const { [OWNERS]: owners = {} } = await chrome.storage.local.get(OWNERS);
        await chrome.bookmarks.remove(id);
        delete owners[id];
        await chrome.storage.local.set({ [OWNERS]: owners });
    });
}

export function assignFavoriteOwner(id, ownerId) {
    return serialize(async () => {
        const { [OWNERS]: owners = {} } = await chrome.storage.local.get(OWNERS);
        owners[id] = ownerId;
        await chrome.storage.local.set({ [OWNERS]: owners });
    });
}

export function reorderFavorites(ids) {
    return serialize(async () => {
        const { root } = await rootAndFavorites();
        const children = await chrome.bookmarks.getChildren(root.id);
        let index = children.filter(node => !node.url).length;
        for (const id of ids) await chrome.bookmarks.move(id, { parentId: root.id, index: index++ });
    });
}
