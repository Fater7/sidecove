import { test } from 'node:test';
import assert from 'node:assert/strict';
import { placeLinkTab } from '../../../src/shared/link-tab-placement.js';

// Stored lists are in Chrome order. The side panel draws them reversed when inverted.
const onScreen = (ids, inverted) => (inverted ? [...ids].reverse() : ids);

test('a link opened from a tab in the list lands directly below it on screen, setting on', () => {
    const stored = placeLinkTab([1, 2, 3, 4], 3, 9, [], true);
    assert.deepEqual(onScreen(stored, true), [4, 3, 9, 2, 1]);
});

test('a link opened from a tab in the list lands directly below it on screen, setting off', () => {
    const stored = placeLinkTab([1, 2, 3, 4], 2, 9, [], false);
    assert.deepEqual(onScreen(stored, false), [1, 2, 9, 3, 4]);
});

test('several links stack below their tab in opening order, setting on', () => {
    let stored = [1, 2, 3];
    const siblings = [];
    for (const id of [10, 11, 12]) {
        stored = placeLinkTab(stored, 2, id, siblings, true);
        siblings.push(id);
    }
    assert.deepEqual(onScreen(stored, true), [3, 2, 10, 11, 12, 1]);
});

test('several links stack below their tab in opening order, setting off', () => {
    let stored = [1, 2, 3];
    const siblings = [];
    for (const id of [10, 11, 12]) {
        stored = placeLinkTab(stored, 2, id, siblings, false);
        siblings.push(id);
    }
    assert.deepEqual(onScreen(stored, false), [1, 2, 10, 11, 12, 3]);
});

test('a link goes below its tab even when another tab has links of its own', () => {
    // 5 opened 20 from tab 4; 2 now opens 10. Each stays under its own opener.
    const stored = placeLinkTab([1, 2, 4, 20, 5], 2, 10, [], false);
    assert.deepEqual(stored, [1, 2, 10, 4, 20, 5]);
});

test('only the run of siblings directly below the opener is skipped', () => {
    // Link 10 was dragged away from its opener, so the next link goes straight below the opener.
    const stored = placeLinkTab([1, 2, 3, 10], 2, 11, [10], false);
    assert.deepEqual(stored, [1, 2, 11, 3, 10]);
});

test('an opener outside the list puts links at the top of the list, setting on', () => {
    const first = placeLinkTab([1, 2, 3], 99, 10, [], true);
    assert.deepEqual(onScreen(first, true), [10, 3, 2, 1]);
    const second = placeLinkTab(first, 99, 11, [10], true);
    assert.deepEqual(onScreen(second, true), [10, 11, 3, 2, 1]);
});

test('an opener outside the list puts links at the top of the list, setting off', () => {
    const first = placeLinkTab([1, 2, 3], 99, 10, [], false);
    assert.deepEqual(onScreen(first, false), [10, 1, 2, 3]);
    const second = placeLinkTab(first, 99, 11, [10], false);
    assert.deepEqual(onScreen(second, false), [10, 11, 1, 2, 3]);
});

test('the list given is not changed', () => {
    const ids = [1, 2, 3];
    placeLinkTab(ids, 2, 9, [], true);
    assert.deepEqual(ids, [1, 2, 3]);
});
