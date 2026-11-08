import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    readFavoriteBookmarks,
    removeFavorite,
    saveFavorite
} from '../../../../../src/sidebar/features/pinned-favorites/favorite-bookmarks.js';

test('favorites are stored as bookmarks independently of tabs', async () => {
    const storage = {};
    const children = [{ id: 'space', title: 'Hello' }];
    let nextId = 1;
    globalThis.chrome = {
        bookmarks: {
            search: async () => [{ id: 'root', title: 'Sidecove' }],
            getChildren: async () => children.slice(),
            create: async item => {
                const node = { ...item, id: String(nextId++) };
                children.push(node);
                return node;
            },
            remove: async id =>
                children.splice(
                    children.findIndex(node => node.id === id),
                    1
                )
        },
        storage: {
            local: {
                get: async keys =>
                    Object.fromEntries((Array.isArray(keys) ? keys : [keys]).map(key => [key, storage[key]])),
                set: async values => Object.assign(storage, values)
            }
        }
    };

    await saveFavorite({ title: 'Example', url: 'https://example.com/' }, 'space');
    let { favorites, owners } = await readFavoriteBookmarks();
    assert.equal(favorites.length, 1);
    assert.equal(favorites[0].url, 'https://example.com/');
    assert.equal(owners[favorites[0].id], 'space');
    await saveFavorite({ title: 'Example', url: 'https://example.com/' }, 'space');
    assert.equal((await readFavoriteBookmarks()).favorites.length, 1);
    await removeFavorite(favorites[0].id);
    ({ favorites, owners } = await readFavoriteBookmarks());
    assert.deepEqual(favorites, []);
    assert.deepEqual(owners, {});
    delete globalThis.chrome;
});
