import test from 'node:test';
import assert from 'node:assert/strict';
import { createCloseFocus, pickTabAfterClose } from '../../../../../src/sidebar/features/close-tab/close-focus.js';

const always = () => true;

test('the next tab down the list is chosen, skipping tabs that are not open', () => {
    assert.equal(pickTabAfterClose([1, 2, 3, 4], 2, always), 3);
    assert.equal(
        pickTabAfterClose([1, 2, 3, 4], 2, id => id !== 3),
        4
    );
});

test('the tab above is chosen when the closed tab was last', () => {
    assert.equal(pickTabAfterClose([1, 2, 3], 3, always), 2);
    assert.equal(
        pickTabAfterClose([1, 2, 3], 3, id => id !== 2),
        1
    );
});

test('nothing is chosen when no other tab is open, or the closed tab is not in the list', () => {
    assert.equal(
        pickTabAfterClose([5], 5, id => id !== 5),
        undefined
    );
    assert.equal(pickTabAfterClose([1, 2], 9, always), undefined);
});

// Space A is shown and holds tabs 1, 2, 3 (top to bottom); space B holds 10.
function setUp({ open = [1, 2, 3, 10], activeSpaceId = 'A' } = {}) {
    const calls = [];
    const owners = { 1: 'A', 2: 'A', 3: 'A', 10: 'B' };
    const focus = createCloseFocus({
        getActiveSpaceId: () => activeSpaceId,
        ownerOf: id => owners[id],
        displayedOrder: spaceId =>
            Object.keys(owners)
                .map(Number)
                .filter(id => owners[id] === spaceId),
        openTabIds: async () => open,
        activateTab: async id => calls.push(['activate', id]),
        openNewTab: async () => calls.push(['new tab']),
        restoreLastTab: async (spaceId, tabId) => calls.push(['restore', spaceId, tabId])
    });
    return { focus, calls, owners };
}

test('a close that made Chrome pick a tab of another space keeps the current space', async () => {
    const { focus, calls } = setUp({ open: [1, 3, 10] });
    // The activation event arrives before the close is handled.
    const stayed = await focus.stayAfterClose({ previousTabId: 2, activatedTabId: 10, activatedSpaceId: 'B' });
    assert.equal(stayed, true);
    assert.deepEqual(calls, [
        ['activate', 3],
        ['restore', 'B', 10]
    ]);
});

test('the close handled first gives the same result, with the order the list had before the close', async () => {
    const { focus, calls, owners } = setUp({ open: [1, 2, 10] });
    focus.noteRemoval(3);
    delete owners[3]; // the sidebar drops the closed tab from its list
    const stayed = await focus.stayAfterClose({ previousTabId: 3, activatedTabId: 10, activatedSpaceId: 'B' });
    assert.equal(stayed, true);
    assert.deepEqual(calls[0], ['activate', 2]);
});

test('closing the only tab of the space opens a New Tab there', async () => {
    const { focus, calls, owners } = setUp({ open: [10] });
    delete owners[2];
    delete owners[3];
    owners[1] = 'A';
    const stayed = await focus.stayAfterClose({ previousTabId: 1, activatedTabId: 10, activatedSpaceId: 'B' });
    assert.equal(stayed, true);
    assert.deepEqual(calls, [['new tab'], ['restore', 'B', 10]]);
});

test('a tab of another space opened on purpose still switches to that space', async () => {
    const { focus, calls } = setUp({ open: [1, 2, 3, 10] });
    // The tab that was active is still open.
    assert.equal(await focus.stayAfterClose({ previousTabId: 2, activatedTabId: 10, activatedSpaceId: 'B' }), false);
    assert.deepEqual(calls, []);
});

test('nothing changes when the activated tab is in the current space, or the previous tab was elsewhere', async () => {
    const { focus, calls } = setUp({ open: [1, 3, 10] });
    assert.equal(await focus.stayAfterClose({ previousTabId: 2, activatedTabId: 3, activatedSpaceId: 'A' }), false);
    // The closed tab belonged to space B, which was not the one shown.
    assert.equal(await focus.stayAfterClose({ previousTabId: 10, activatedTabId: 1, activatedSpaceId: 'A' }), false);
    assert.equal(await focus.stayAfterClose({ previousTabId: null, activatedTabId: 10, activatedSpaceId: 'B' }), false);
    assert.deepEqual(calls, []);
});

test("if the chosen tab cannot be shown, the usual switch to Chrome's pick goes ahead", async () => {
    const failing = createCloseFocus({
        getActiveSpaceId: () => 'A',
        ownerOf: id => ({ 2: 'A', 3: 'A', 10: 'B' })[id],
        displayedOrder: () => [2, 3],
        openTabIds: async () => [3, 10],
        activateTab: async () => {
            throw new Error('No tab with id');
        },
        openNewTab: async () => {},
        restoreLastTab: async () => assert.fail('nothing was undone, so nothing is restored')
    });
    assert.equal(await failing.stayAfterClose({ previousTabId: 2, activatedTabId: 10, activatedSpaceId: 'B' }), false);
});
