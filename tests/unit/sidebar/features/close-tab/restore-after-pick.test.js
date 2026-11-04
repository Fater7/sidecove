import test from 'node:test';
import assert from 'node:assert/strict';
import { lastTabPatch, restoreAfterPick } from '../../../../../src/sidebar/features/close-tab/restore-after-pick.js';

const space = { id: 'B', name: 'Beta', temporaryTabs: [10, 11, 12], spaceBookmarks: [], lastTab: 11 };
const open = ids => id => ids.includes(id);

test('the tab the user last visited is put back over the one Chrome picked', () => {
    const patch = lastTabPatch(space, {
        visitedTabId: 12,
        savedTabId: 11,
        pickedTabId: 10,
        isOpen: open([10, 11, 12])
    });
    assert.equal(patch.before[0].lastTab, 10);
    assert.equal(patch.after[0].lastTab, 12);
});

test('the saved tab is used when no visit was seen, and only while it is open', () => {
    assert.equal(lastTabPatch(space, { savedTabId: 11, pickedTabId: 10, isOpen: open([10, 11]) }).after[0].lastTab, 11);
    assert.equal(lastTabPatch(space, { savedTabId: 11, pickedTabId: 10, isOpen: open([10]) }).after[0].lastTab, null);
});

test('nothing is put back when Chrome picked the tab last visited anyway', () => {
    assert.equal(
        lastTabPatch(space, { visitedTabId: 10, savedTabId: 11, pickedTabId: 10, isOpen: open([10, 11]) }),
        null
    );
});

test('the window keeps the shown space as its current one', async () => {
    const calls = [];
    await restoreAfterPick({
        spaceRequest: async (action, payload) => calls.push([action, payload]),
        space,
        visitedTabId: 12,
        openIds: new Set([10, 12]),
        pickedTabId: 10,
        windowId: 7,
        shownSpaceId: 'A'
    });
    assert.deepEqual(
        calls.map(([action]) => action),
        ['patch', 'activate']
    );
    assert.deepEqual(calls[1][1], { windowId: 7, spaceId: 'A' });
});
