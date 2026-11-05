import test from 'node:test';
import assert from 'node:assert/strict';
import { restoreTabOrder } from '../../../src/shared/pending-clean.js';

test('restored tabs go back to their places among the tabs that stayed', () => {
    assert.deepEqual(restoreTabOrder([1, 5], [1, 2, 3, 4, 5], [2, 3, 4]), [1, 2, 3, 4, 5]);
    assert.deepEqual(restoreTabOrder([], [1, 2, 3], [1, 2, 3]), [1, 2, 3]);
});

test('tabs that joined meanwhile go after the restored ones', () => {
    assert.deepEqual(restoreTabOrder([1, 9], [1, 2, 3], [2, 3]), [1, 2, 3, 9]);
});

test('a restored tab missing from the old order still comes back, and no tab appears twice', () => {
    assert.deepEqual(restoreTabOrder([1, 2], [1], [2, 3]), [1, 2, 3]);
    assert.deepEqual(restoreTabOrder([1], [1, 2], [2, 2]), [1, 2]);
});
