import { test } from 'node:test';
import assert from 'node:assert/strict';
import { placeLinkTab } from '../../../src/shared/link-tab-placement.js';

// Stored lists are in Chrome order. The side panel draws them reversed when inverted.
const onScreen = (ids, inverted) => (inverted ? [...ids].reverse() : ids);
const none = () => new Map();

// Opens each of `children` from `opener` in turn, the way successive link clicks would.
function openLinks(stored, opener, children, inverted, openers = new Map()) {
    for (const id of children) {
        stored = placeLinkTab(stored, opener, id, openers, inverted);
        openers.set(id, opener);
    }
    return stored;
}

test('a link opened from a tab in the list lands directly below it on screen, setting on', () => {
    const stored = placeLinkTab([1, 2, 3, 4], 3, 9, none(), true);
    assert.deepEqual(onScreen(stored, true), [4, 3, 9, 2, 1]);
});

test('a link opened from a tab in the list lands directly below it on screen, setting off', () => {
    const stored = placeLinkTab([1, 2, 3, 4], 2, 9, none(), false);
    assert.deepEqual(onScreen(stored, false), [1, 2, 9, 3, 4]);
});

test('several links stack below their tab in opening order, setting on', () => {
    const stored = openLinks([1, 2, 3], 2, [10, 11, 12], true);
    assert.deepEqual(onScreen(stored, true), [3, 2, 10, 11, 12, 1]);
});

test('several links stack below their tab in opening order, setting off', () => {
    const stored = openLinks([1, 2, 3], 2, [10, 11, 12], false);
    assert.deepEqual(onScreen(stored, false), [1, 2, 10, 11, 12, 3]);
});

test('a link goes below its tab even when another tab has links of its own', () => {
    const openers = new Map([[20, 4]]);
    const stored = placeLinkTab([1, 2, 4, 20, 5], 2, 10, openers, false);
    assert.deepEqual(stored, [1, 2, 10, 4, 20, 5]);
});

test('a link opened from a link keeps its place, and the next link from the first tab goes after both', () => {
    // 2 opens 10, 10 opens 11 (below 10), then 2 opens 12: 2, 10, 11, 12.
    const openers = new Map();
    let stored = openLinks([1, 2, 3], 2, [10], false, openers);
    stored = openLinks(stored, 10, [11], false, openers);
    stored = openLinks(stored, 2, [12], false, openers);
    assert.deepEqual(stored, [1, 2, 10, 11, 12, 3]);
});

test('only the run of links directly below the opener is skipped', () => {
    // Link 10 was dragged away from its opener, so the next link goes straight below the opener.
    const stored = placeLinkTab([1, 2, 3, 10], 2, 11, new Map([[10, 2]]), false);
    assert.deepEqual(stored, [1, 2, 11, 3, 10]);
});

test('an opener outside the list puts links at the top of the list, setting on', () => {
    const stored = openLinks([1, 2, 3], 99, [10, 11], true);
    assert.deepEqual(onScreen(stored, true), [10, 11, 3, 2, 1]);
});

test('an opener outside the list puts links at the top of the list, setting off', () => {
    const stored = openLinks([1, 2, 3], 99, [10, 11], false);
    assert.deepEqual(onScreen(stored, false), [10, 11, 1, 2, 3]);
});

test('a loop in the opener map does not hang', () => {
    const stored = placeLinkTab(
        [1, 2, 3],
        2,
        9,
        new Map([
            [3, 4],
            [4, 3]
        ]),
        false
    );
    assert.deepEqual(stored, [1, 2, 9, 3]);
});

test('the list given is not changed', () => {
    const ids = [1, 2, 3];
    placeLinkTab(ids, 2, 9, none(), true);
    assert.deepEqual(ids, [1, 2, 3]);
});
