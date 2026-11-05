import test from 'node:test';
import assert from 'node:assert/strict';
import { createSpaceTabShower } from '../../../../../src/sidebar/features/space-switch/show-space-tab.js';

function setUp({ owned = [], active = 'three', hold = false } = {}) {
    const calls = [];
    let release;
    const shower = createSpaceTabShower({
        getOwnedTabs: async () => owned.map(id => ({ id })),
        getActiveSpaceId: () => active,
        windowId: () => 7,
        activateTab: async id => calls.push(['activate', id]),
        openNewTab: () => {
            calls.push(['open']);
            return hold ? new Promise(resolve => (release = resolve)) : Promise.resolve();
        }
    });
    return { shower, calls, release: () => release(), setActive: id => (active = id) };
}

test('shows the last tab of a space that has tabs', async () => {
    const { shower, calls } = setUp({ owned: [1, 2] });
    await shower.show({ id: 'three', lastTab: 1 }, { openIfEmpty: true });
    assert.deepEqual(calls, [['activate', 1]]);
});

test('opens one New Tab for an empty space, even when switched to twice', async () => {
    const { shower, calls, release } = setUp({ hold: true });
    const first = shower.show({ id: 'three' }, { openIfEmpty: true });
    await new Promise(resolve => setImmediate(resolve));
    const second = shower.show({ id: 'three' }, { openIfEmpty: true });
    await new Promise(resolve => setImmediate(resolve));
    release();
    await Promise.all([first, second]);
    assert.deepEqual(calls, [['open']]);
});

test('leaves the screen alone for an empty space unless asked to open a tab', async () => {
    const { shower, calls } = setUp();
    await shower.show({ id: 'three' });
    assert.deepEqual(calls, []);
});

test('does nothing when the user has moved on to another space', async () => {
    const { shower, calls } = setUp({ active: 'two' });
    await shower.show({ id: 'three' }, { openIfEmpty: true });
    assert.deepEqual(calls, []);
});

test('opens no New Tab once the window is closing', async () => {
    const { shower, calls } = setUp();
    shower.noteTabRemoved({ isWindowClosing: true, windowId: 8 });
    await shower.show({ id: 'three' }, { openIfEmpty: true });
    assert.deepEqual(calls, [['open']]);
    const closing = setUp();
    closing.shower.noteTabRemoved({ isWindowClosing: true, windowId: 7 });
    await closing.shower.show({ id: 'three' }, { openIfEmpty: true });
    assert.deepEqual(closing.calls, []);
});
