import test from 'node:test';
import assert from 'node:assert/strict';
import { chooseTabForSpace, createNewTabOpener } from '../../../src/shared/space-tab-choice.js';

const tabs = ids => ids.map(id => ({ id }));

test('a space with open tabs shows its last tab', () => {
    assert.deepEqual(chooseTabForSpace({ ownedTabs: tabs([4, 5, 6]), lastTabId: 5 }), { action: 'show', tabId: 5 });
});

test('a space whose last tab is gone shows its final tab', () => {
    assert.deepEqual(chooseTabForSpace({ ownedTabs: tabs([4, 5, 6]), lastTabId: 9 }), { action: 'show', tabId: 6 });
    assert.deepEqual(chooseTabForSpace({ ownedTabs: tabs([4]), lastTabId: undefined }), { action: 'show', tabId: 4 });
});

test('a space with no open tab gets a New Tab', () => {
    assert.deepEqual(chooseTabForSpace({ ownedTabs: [], lastTabId: 5 }), { action: 'open' });
});

test('no second New Tab while one is on its way, and none in a closing window', () => {
    assert.deepEqual(chooseTabForSpace({ ownedTabs: [], newTabPending: true }), { action: 'none' });
    assert.deepEqual(chooseTabForSpace({ ownedTabs: [], windowClosing: true }), { action: 'none' });
});

test('a space that has a tab still shows it while the window closes', () => {
    assert.deepEqual(chooseTabForSpace({ ownedTabs: tabs([4]), lastTabId: 4, windowClosing: true }), {
        action: 'show',
        tabId: 4
    });
});

test('the opener runs one New Tab per space until it finishes', async () => {
    const opener = createNewTabOpener();
    let created = 0;
    let finish;
    const create = () => {
        created++;
        return new Promise(resolve => (finish = resolve));
    };
    const first = opener.open('three', create);
    const second = opener.open('three', create);
    assert.equal(opener.isPending('three'), true);
    assert.equal(opener.isPending('two'), false);
    assert.equal(created, 1);
    finish();
    await Promise.all([first, second]);
    assert.equal(opener.isPending('three'), false);
    opener.open('three', create);
    assert.equal(created, 2);
});

test('the opener forgets a New Tab that failed to open', async () => {
    const opener = createNewTabOpener();
    await assert.rejects(
        opener.open('three', async () => {
            throw new Error('window closed');
        }),
        /window closed/
    );
    assert.equal(opener.isPending('three'), false);
});
