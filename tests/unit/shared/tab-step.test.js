import test from 'node:test';
import assert from 'node:assert/strict';
import { tabsInDisplayOrder, adjacentTabId } from '../../../src/shared/tab-step.js';

const space = { spaceBookmarks: [1, 2], temporaryTabs: [3, 4, 5] };
const open = ids => new Set(ids);

test('with new tabs at the top, the other tabs are walked newest first, after the favorites', () => {
    const order = tabsInDisplayOrder(space, { invertTabOrder: true, openTabIds: open([1, 2, 3, 4, 5]) });
    assert.deepEqual(order, [1, 2, 5, 4, 3]);
});

test('with new tabs at the bottom, the other tabs keep their stored order', () => {
    const order = tabsInDisplayOrder(space, { invertTabOrder: false, openTabIds: open([1, 2, 3, 4, 5]) });
    assert.deepEqual(order, [1, 2, 3, 4, 5]);
});

test('tabs outside the window and tabs listed twice are left out', () => {
    const crowded = { spaceBookmarks: [1], temporaryTabs: [1, 3, 9] };
    assert.deepEqual(tabsInDisplayOrder(crowded, { invertTabOrder: false, openTabIds: open([1, 3]) }), [1, 3]);
});

test('a missing space has no tabs', () => {
    assert.deepEqual(tabsInDisplayOrder(undefined, { openTabIds: open([1]) }), []);
});

test('next and previous wrap at both ends', () => {
    const ordered = [1, 2, 5];
    assert.equal(adjacentTabId(ordered, 1, 'next'), 2);
    assert.equal(adjacentTabId(ordered, 5, 'next'), 1);
    assert.equal(adjacentTabId(ordered, 1, 'prev'), 5);
    assert.equal(adjacentTabId(ordered, 2, 'prev'), 1);
});

test('there is nowhere to go from a tab outside the list or when it is the only tab', () => {
    assert.equal(adjacentTabId([1, 2], 9, 'next'), null);
    assert.equal(adjacentTabId([1], 1, 'next'), null);
    assert.equal(adjacentTabId([], 1, 'prev'), null);
});
