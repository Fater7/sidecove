import test from 'node:test';
import assert from 'node:assert/strict';
import {
    COLOR_NAMES,
    LIGHT_DEFAULTS,
    DARK_DEFAULTS,
    colorVariable,
    readColorOverrides,
    buildColorOverrides,
    colorVariableValues,
    applyColorVariables
} from '../../../src/shared/color-palette.js';

const luminance = hex => {
    const [r, g, b] = [1, 3, 5].map(i => {
        const channel = parseInt(hex.slice(i, i + 2), 16) / 255;
        return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a, b) => {
    const [lighter, darker] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (lighter + 0.05) / (darker + 0.05);
};

test('every palette colour has a light and a dark default', () => {
    assert.deepEqual(Object.keys(LIGHT_DEFAULTS), COLOR_NAMES);
    assert.deepEqual(Object.keys(DARK_DEFAULTS), COLOR_NAMES);
});

test('the built-in dark colours are the chosen dark surfaces', () => {
    assert.deepEqual(DARK_DEFAULTS, {
        grey: '#252d30',
        blue: '#002b4a',
        red: '#4f0a10',
        yellow: '#403100',
        green: '#003310',
        pink: '#54183e',
        purple: '#422159',
        cyan: '#013d44'
    });
});

test('every built-in dark colour keeps the light text readable at 10:1 or better', () => {
    for (const [name, hex] of Object.entries(DARK_DEFAULTS)) {
        assert.ok(contrast(hex, '#eceff1') >= 10, `${name} ${hex} is ${contrast(hex, '#eceff1').toFixed(2)}:1`);
    }
});

test('the light override variable keeps the name earlier versions used', () => {
    assert.equal(colorVariable('light', 'blue'), '--user-chrome-blue-color');
    assert.equal(colorVariable('dark', 'blue'), '--user-chrome-dark-blue-color');
});

test('overrides saved before dark values existed are read as the light values', () => {
    const saved = { colorOverrides: { blue: '#ff8800', pink: '#FFAABB' } };
    assert.deepEqual(readColorOverrides(saved), {
        light: { blue: '#ff8800', pink: '#ffaabb' },
        dark: {}
    });
    const values = colorVariableValues(saved);
    assert.equal(values['--user-chrome-blue-color'], '#ff8800');
    assert.equal(values['--user-chrome-pink-color'], '#ffaabb');
    for (const name of COLOR_NAMES) assert.equal(values[`--user-chrome-dark-${name}-color`], null);
});

test('settings with no overrides, or null ones, read as empty', () => {
    assert.deepEqual(readColorOverrides({}), { light: {}, dark: {} });
    assert.deepEqual(readColorOverrides({ colorOverrides: null, colorOverridesDark: null }), { light: {}, dark: {} });
    assert.deepEqual(readColorOverrides(undefined), { light: {}, dark: {} });
});

test('unknown colours and values that are not six-digit hex are ignored', () => {
    const { light, dark } = readColorOverrides({
        colorOverrides: { blue: 'red', teal: '#112233', green: '#123', pink: 42, grey: '#abcdef' },
        colorOverridesDark: { cyan: 'url(x)', red: '#00ff00' }
    });
    assert.deepEqual(light, { grey: '#abcdef' });
    assert.deepEqual(dark, { red: '#00ff00' });
});

test('light and dark overrides are independent', () => {
    const values = colorVariableValues({
        colorOverrides: { blue: '#ff8800' },
        colorOverridesDark: { blue: '#123456' }
    });
    assert.equal(values['--user-chrome-blue-color'], '#ff8800');
    assert.equal(values['--user-chrome-dark-blue-color'], '#123456');
    assert.equal(Object.keys(values).length, COLOR_NAMES.length * 2);
});

test('only values that differ from the default are saved, per mode', () => {
    assert.deepEqual(buildColorOverrides(LIGHT_DEFAULTS, DARK_DEFAULTS), {
        colorOverrides: null,
        colorOverridesDark: null
    });
    assert.deepEqual(
        buildColorOverrides({ ...LIGHT_DEFAULTS, blue: '#ff8800' }, { ...DARK_DEFAULTS, red: '#220000' }),
        { colorOverrides: { blue: '#ff8800' }, colorOverridesDark: { red: '#220000' } }
    );
});

test("one mode's default is a real override in the other mode", () => {
    const { colorOverrides, colorOverridesDark } = buildColorOverrides(
        { ...LIGHT_DEFAULTS, blue: DARK_DEFAULTS.blue },
        { ...DARK_DEFAULTS, blue: LIGHT_DEFAULTS.blue }
    );
    assert.deepEqual(colorOverrides, { blue: DARK_DEFAULTS.blue });
    assert.deepEqual(colorOverridesDark, { blue: LIGHT_DEFAULTS.blue });
});

test('saved overrides read back to the values that were picked', () => {
    const picked = { light: { ...LIGHT_DEFAULTS, grey: '#101010' }, dark: { ...DARK_DEFAULTS, cyan: '#334455' } };
    const saved = buildColorOverrides(picked.light, picked.dark);
    assert.deepEqual(readColorOverrides(saved), { light: { grey: '#101010' }, dark: { cyan: '#334455' } });
});

test('applyColorVariables sets overrides and clears the ones that went away', () => {
    const properties = new Map([['--user-chrome-red-color', '#111111']]);
    const root = {
        style: {
            setProperty: (name, value) => properties.set(name, value),
            removeProperty: name => properties.delete(name)
        }
    };
    applyColorVariables(root, { colorOverrides: { blue: '#ff8800' }, colorOverridesDark: { blue: '#123456' } });
    assert.deepEqual(
        [...properties],
        [
            ['--user-chrome-blue-color', '#ff8800'],
            ['--user-chrome-dark-blue-color', '#123456']
        ]
    );
});
