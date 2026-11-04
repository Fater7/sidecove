import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ownerOf, updateNativePinSection, spaceForActivation } from '../../../src/shared/space-membership.js';

test('native pin section changes retain ownership and leave ordinary favorites alone', () => {
    const space = { id: 'work', spaceBookmarks: [1], temporaryTabs: [], pinnedTabs: [] };
    updateNativePinSection(space, { id: 1, pinned: false });
    assert.deepEqual(space.spaceBookmarks, [1]);
    updateNativePinSection(space, { id: 1, pinned: true });
    assert.deepEqual(space.spaceBookmarks, []);
    assert.deepEqual(space.pinnedTabs, [1]);
    assert.equal(ownerOf([space], 1), space);
    updateNativePinSection(space, { id: 1, pinned: false });
    assert.deepEqual(space.pinnedTabs, []);
    assert.deepEqual(space.temporaryTabs, [1]);
});

test('shared native pins do not switch spaces, while per-space pins and ordinary tabs do', () => {
    const space = { id: 'work', spaceBookmarks: [1], temporaryTabs: [2], pinnedTabs: [3] };
    assert.equal(spaceForActivation([space], 3), undefined);
    assert.equal(spaceForActivation([space], 3, true), space);
    assert.equal(spaceForActivation([space], 1), space);
    assert.equal(spaceForActivation([space], 2), space);
});
