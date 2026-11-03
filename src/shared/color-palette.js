// The eight space colours and the user's overrides for them (Settings → Colors).
// Each colour has a light-mode and a dark-mode value. `colorOverrides` has always held
// the light values; `colorOverridesDark` holds the dark ones, so settings saved before
// dark values existed keep working unchanged.

export const COLOR_NAMES = ['grey', 'blue', 'red', 'yellow', 'green', 'pink', 'purple', 'cyan'];

// Must match the defaults in styles.css, which is what the sidebar actually paints.
export const LIGHT_DEFAULTS = {
    grey: '#cccccc',
    blue: '#8bb3f3',
    red: '#ff9e97',
    yellow: '#ffe29f',
    green: '#8bda99',
    pink: '#fbaad7',
    purple: '#d6a6ff',
    cyan: '#a5e2ea'
};

// Dark surfaces tinted with each space's colour: the same hue, lightness inside
// Material's dark surface range, every one at least 10:1 against the #eceff1 text.
export const DARK_DEFAULTS = {
    grey: '#252d30',
    blue: '#002b4a',
    red: '#4f0a10',
    yellow: '#403100',
    green: '#003310',
    pink: '#54183e',
    purple: '#422159',
    cyan: '#013d44'
};

const HEX_COLOR = /^#[0-9a-f]{6}$/i;

// The CSS variable the stylesheet reads for a colour's override in a mode. The light
// name is the one earlier versions used.
export function colorVariable(mode, colorName) {
    return mode === 'dark' ? `--user-chrome-dark-${colorName}-color` : `--user-chrome-${colorName}-color`;
}

function validOverrides(stored) {
    const valid = {};
    if (!stored || typeof stored !== 'object') return valid;
    for (const colorName of COLOR_NAMES) {
        const value = stored[colorName];
        if (typeof value === 'string' && HEX_COLOR.test(value)) valid[colorName] = value.toLowerCase();
    }
    return valid;
}

// Reads the overrides out of saved settings as { light, dark }. Settings saved before
// dark values existed have only `colorOverrides`, which are the light values.
export function readColorOverrides(settings) {
    return {
        light: validOverrides(settings?.colorOverrides),
        dark: validOverrides(settings?.colorOverridesDark)
    };
}

// What to save for the picker values: only colours that differ from the default are
// kept, and a mode with none saves null.
export function buildColorOverrides(pickedLight, pickedDark) {
    const differing = (picked, defaults) => {
        const overrides = {};
        for (const [colorName, value] of Object.entries(validOverrides(picked))) {
            if (value !== defaults[colorName]) overrides[colorName] = value;
        }
        return Object.keys(overrides).length > 0 ? overrides : null;
    };
    return {
        colorOverrides: differing(pickedLight, LIGHT_DEFAULTS),
        colorOverridesDark: differing(pickedDark, DARK_DEFAULTS)
    };
}

// The value (or null for none) of each override variable, for both modes. The
// stylesheet picks the light or dark one with prefers-color-scheme.
export function colorVariableValues(settings) {
    const { light, dark } = readColorOverrides(settings);
    const values = {};
    for (const colorName of COLOR_NAMES) {
        values[colorVariable('light', colorName)] = light[colorName] ?? null;
        values[colorVariable('dark', colorName)] = dark[colorName] ?? null;
    }
    return values;
}

// Sets every override variable on root, and removes the ones with no override.
export function applyColorVariables(root, settings) {
    for (const [name, value] of Object.entries(colorVariableValues(settings))) {
        if (value) root.style.setProperty(name, value);
        else root.style.removeProperty(name);
    }
}
