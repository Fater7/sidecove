import test from 'node:test';
import assert from 'node:assert/strict';
import {
    applyColorOverrides,
    colorOverridesChanged
} from '../../../../../src/sidebar/features/color-overrides/apply-color-overrides.js';

const fakeElement = () => {
    const properties = new Map();
    return {
        properties,
        style: {
            setProperty: (name, value) => properties.set(name, value),
            removeProperty: name => properties.delete(name)
        }
    };
};

test('either override key changing counts as a colour change', () => {
    assert.equal(colorOverridesChanged({ colorOverrides: {} }), true);
    assert.equal(colorOverridesChanged({ colorOverridesDark: {} }), true);
    assert.equal(colorOverridesChanged({ invertTabOrder: {} }), false);
});

test('applies both modes and points the sidebar at the active space colour', async () => {
    const root = fakeElement();
    const container = fakeElement();
    await applyColorOverrides({
        getSettings: async () => ({ colorOverrides: { blue: '#ff8800' }, colorOverridesDark: { blue: '#123456' } }),
        root,
        container,
        activeSpace: () => ({ color: 'blue' }),
        logger: { error: () => assert.fail('no error expected') }
    });
    assert.equal(root.properties.get('--user-chrome-blue-color'), '#ff8800');
    assert.equal(root.properties.get('--user-chrome-dark-blue-color'), '#123456');
    assert.match(container.properties.get('--space-bg-color'), /--chrome-blue-color/);
});

test('with no active space only the overrides are applied', async () => {
    const root = fakeElement();
    const container = fakeElement();
    await applyColorOverrides({
        getSettings: async () => ({ colorOverrides: { red: '#aa0000' } }),
        root,
        container,
        activeSpace: () => undefined,
        logger: { error: () => assert.fail('no error expected') }
    });
    assert.equal(root.properties.get('--user-chrome-red-color'), '#aa0000');
    assert.equal(container.properties.size, 0);
});

test('a failure to read settings is logged, not thrown', async () => {
    const errors = [];
    await applyColorOverrides({
        getSettings: async () => {
            throw new Error('storage unavailable');
        },
        root: fakeElement(),
        container: fakeElement(),
        activeSpace: () => undefined,
        logger: { error: (...args) => errors.push(args) }
    });
    assert.equal(errors.length, 1);
});
