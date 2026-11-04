import test from 'node:test';
import assert from 'node:assert/strict';
import { setSpaceColorVars } from '../../../../../src/sidebar/features/color-overrides/space-color-vars.js';

test('the background variables refer to the space colour, so they follow the theme', () => {
    const properties = {};
    setSpaceColorVars({ style: { setProperty: (name, value) => (properties[name] = value) } }, 'purple');
    assert.deepEqual(properties, {
        '--space-bg-color': 'var(--chrome-purple-color, rgba(255, 255, 255, 0.1))',
        '--space-bg-color-dark': 'var(--chrome-purple-color-dark, rgba(255, 255, 255, 0.1))'
    });
});
