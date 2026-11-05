import { test } from 'node:test';
import assert from 'node:assert/strict';
import { placeLinkTab } from '../../../src/shared/link-tab-placement.js';

// Stored lists are in Chrome order. The side panel draws them reversed when inverted.
const onScreen = (ids, inverted) => (inverted ? [...ids].reverse() : ids);

// Opens each of `children` from `opener` in turn, the way successive link clicks would while
// the user stays on the opener: each one is placed after the last link from that opener.
function openLinks(stored, opener, children, inverted, tails = new Map()) {
    for (const id of children) {
        stored = placeLinkTab(stored, opener, id, tails.get(opener), inverted);
        tails.set(opener, id);
    }
    return stored;
}

test('a link opened from a tab in the list lands directly below it on screen, setting on', () => {
    const stored = placeLinkTab([1, 2, 3, 4], 3, 9, undefined, true);
    assert.deepEqual(onScreen(stored, true), [4, 3, 9, 2, 1]);
});

test('a link opened from a tab in the list lands directly below it on screen, setting off', () => {
    const stored = placeLinkTab([1, 2, 3, 4], 2, 9, undefined, false);
    assert.deepEqual(onScreen(stored, false), [1, 2, 9, 3, 4]);
});

test('three links in a row from one tab stack beneath it in opening order, setting on', () => {
    const stored = openLinks([1, 2, 3], 2, [10, 11, 12], true);
    assert.deepEqual(onScreen(stored, true), [3, 2, 10, 11, 12, 1]);
});

test('three links in a row from one tab stack beneath it in opening order, setting off', () => {
    const stored = openLinks([1, 2, 3], 2, [10, 11, 12], false);
    assert.deepEqual(onScreen(stored, false), [1, 2, 10, 11, 12, 3]);
});

test('after the tab is switched back to, the next link goes directly beneath it', () => {
    for (const inverted of [true, false]) {
        const tails = new Map();
        let stored = openLinks([1, 2, 3], 2, [10, 11], inverted, tails);
        // Switching away and back forgets the links opened so far.
        tails.delete(2);
        stored = openLinks(stored, 2, [12], inverted, tails);
        assert.deepEqual(onScreen(stored, inverted), inverted ? [3, 2, 12, 10, 11, 1] : [1, 2, 12, 10, 11, 3]);
    }
});

test('links from two tabs stay with their own tab, whichever is returned to', () => {
    // Links 10, 11 from tab 2; then links 20, 21 from tab 3; back on tab 2 a new link goes under 2.
    const tails = new Map();
    let stored = openLinks([1, 2, 3], 2, [10, 11], false, tails);
    stored = openLinks(stored, 3, [20, 21], false, tails);
    tails.delete(2);
    stored = openLinks(stored, 2, [12], false, tails);
    assert.deepEqual(stored, [1, 2, 12, 10, 11, 3, 20, 21]);
});

test('a link opened from a link goes directly below that link', () => {
    const tails = new Map();
    let stored = openLinks([1, 2, 3], 2, [10], false, tails);
    stored = openLinks(stored, 10, [11], false, tails);
    // The store moves the group's last link to 11, so the next link from tab 2 follows it.
    tails.set(2, 11);
    stored = openLinks(stored, 2, [12], false, tails);
    assert.deepEqual(stored, [1, 2, 10, 11, 12, 3]);
});

test('a last link that left the list is replaced by the opener as the place to start', () => {
    const stored = placeLinkTab([1, 2, 3], 2, 11, 10, false);
    assert.deepEqual(stored, [1, 2, 11, 3]);
});

test('an opener outside the list puts links at the top of the list in opening order, setting on', () => {
    const stored = openLinks([1, 2, 3], 99, [10, 11], true);
    assert.deepEqual(onScreen(stored, true), [10, 11, 3, 2, 1]);
});

test('an opener outside the list puts links at the top of the list in opening order, setting off', () => {
    const stored = openLinks([1, 2, 3], 99, [10, 11], false);
    assert.deepEqual(onScreen(stored, false), [10, 11, 1, 2, 3]);
});

test('the list given is not changed', () => {
    const ids = [1, 2, 3];
    placeLinkTab(ids, 2, 9, undefined, true);
    assert.deepEqual(ids, [1, 2, 3]);
});
