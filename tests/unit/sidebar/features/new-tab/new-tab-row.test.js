import test from 'node:test';
import assert from 'node:assert/strict';
import { wireNewTabRow } from '../../../../../src/sidebar/features/new-tab/new-tab-row.js';

function fakeSpace() {
    const handlers = {};
    const button = { addEventListener: (type, handler) => (handlers[type] = handler) };
    const queries = [];
    return {
        handlers,
        queries,
        element: {
            querySelector: selector => {
                queries.push(selector);
                return button;
            }
        }
    };
}

test("clicking a space's New Tab row opens one blank tab", () => {
    const space = fakeSpace();
    const created = [];
    wireNewTabRow(space.element, { tabs: { create: props => created.push(props) } });

    assert.deepEqual(space.queries, ['.new-tab-btn']);
    assert.equal(created.length, 0);
    space.handlers.click();
    assert.deepEqual(created, [{}]);
});

test('each space wires its own row', () => {
    const [a, b] = [fakeSpace(), fakeSpace()];
    const created = [];
    const chromeApi = { tabs: { create: props => created.push(props) } };
    wireNewTabRow(a.element, chromeApi);
    wireNewTabRow(b.element, chromeApi);

    b.handlers.click();
    assert.equal(created.length, 1);
});
