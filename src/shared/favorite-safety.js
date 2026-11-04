import { Utils } from './utils.js';
import { ROOT_FOLDER_TITLE } from './constants.js';

// URL matching is conservative extra protection, never bookmark identity.
export function isProtectedFavorite(tab, memberIds, bindings, urlKeys) {
    return (
        tab.pinned ||
        memberIds.has(tab.id) ||
        Boolean(bindings[tab.id]?.bookmarkId) ||
        urlKeys.has(Utils.getPinnedUrlKey(tab.url))
    );
}

// The pinned-URL keys of every bookmark in the Sidecove folder, the durable record of favourites.
// It throws when the bookmarks cannot be read, and each caller decides what that means.
export async function collectFavoriteUrlKeys(chromeApi) {
    const keys = new Set();
    const folder = (await chromeApi.bookmarks.search({ title: ROOT_FOLDER_TITLE })).find(node => !node.url);
    if (!folder) return keys;
    const [subTree] = await chromeApi.bookmarks.getSubTree(folder.id);
    const collect = node => {
        if (!node) return;
        if (node.url) keys.add(Utils.getPinnedUrlKey(node.url));
        if (node.children) node.children.forEach(collect);
    };
    collect(subTree);
    return keys;
}
