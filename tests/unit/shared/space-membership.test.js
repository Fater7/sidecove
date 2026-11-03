import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ownerOf, updateNativePinSection } from '../../../src/shared/space-membership.js';

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
