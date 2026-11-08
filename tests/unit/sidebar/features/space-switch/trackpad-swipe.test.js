import test from 'node:test';
import assert from 'node:assert/strict';
import { createTrackpadSwipeHandler } from '../../../../../src/sidebar/features/space-switch/trackpad-swipe.js';

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const wheel = (deltaX, deltaY = 0) => ({
    deltaX,
    deltaY,
    prevented: false,
    preventDefault() {
        this.prevented = true;
    }
});

test('momentum stays in one gesture until horizontal events stop', async () => {
    const switches = [];
    const handle = createTrackpadSwipeHandler(delta => switches.push(delta), { idleMs: 80 });
    for (let i = 0; i < 5; i++) {
        const event = wheel(30);
        handle(event);
        assert.equal(event.prevented, true);
        await wait(30);
    }
    assert.deepEqual(switches, [1]);
    await wait(100);
    handle(wheel(-30));
    assert.deepEqual(switches, [1, -1]);
});

test('small horizontal events accumulate, while vertical scrolling is left alone', () => {
    const switches = [];
    const handle = createTrackpadSwipeHandler(delta => switches.push(delta), { idleMs: 20 });
    const vertical = wheel(2, 20);
    handle(vertical);
    assert.equal(vertical.prevented, false);
    const first = wheel(10);
    handle(first);
    handle(wheel(10));
    handle(wheel(10));
    assert.equal(first.prevented, true);
    assert.deepEqual(switches, [1]);
});
