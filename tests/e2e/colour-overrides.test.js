import { launchBrowserWithExtension, openSidebar, openOptionsPage } from './helpers/extension-helper.js';

// A custom colour from Settings must show in the colour pickers, not only in the
// sidebar background (upstream issue #39).
let browser, extensionId;

beforeAll(async () => {
    ({ browser, extensionId } = await launchBrowserWithExtension());
});
afterAll(async () => {
    await browser?.close();
});

const swatchColours = page =>
    page.evaluate(() => ({
        create: getComputedStyle(document.querySelector('#createSpaceColorSwatch [data-color="blue"]')).backgroundColor,
        menu: getComputedStyle(document.querySelector('.space.active #spaceOptionColorSwatch [data-color="blue"]'))
            .backgroundColor,
        grey: getComputedStyle(document.querySelector('#createSpaceColorSwatch [data-color="grey"]')).backgroundColor
    }));

test('swatches keep their default colours and follow a colour override', async () => {
    const page = await openSidebar(browser, extensionId);
    expect(await swatchColours(page)).toEqual({
        create: 'rgb(96, 165, 250)',
        menu: 'rgb(96, 165, 250)',
        grey: 'rgb(156, 163, 175)'
    });

    await page.evaluate(() => chrome.storage.sync.set({ colorOverrides: { blue: '#ff8800' } }));
    await page.waitForFunction(
        () =>
            getComputedStyle(document.querySelector('#createSpaceColorSwatch [data-color="blue"]')).backgroundColor ===
            'rgb(255, 136, 0)',
        { polling: 100 }
    );
    expect(await swatchColours(page)).toEqual({
        create: 'rgb(255, 136, 0)',
        menu: 'rgb(255, 136, 0)',
        grey: 'rgb(156, 163, 175)'
    });

    await page.reload();
    await page.waitForSelector('.space.active #spaceOptionColorSwatch');
    expect((await swatchColours(page)).menu).toBe('rgb(255, 136, 0)');
});

// Issue #14: each colour has a light and a dark value, and the sidebar uses the one for
// the system theme. A colour without a dark value keeps the built-in dark default.
const DARK_DEFAULT_BLUE = 'rgb(0, 43, 74)';
const setScheme = (page, value) => page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value }]);
const blueSwatch = page =>
    page.evaluate(
        () => getComputedStyle(document.querySelector('#createSpaceColorSwatch [data-color="blue"]')).backgroundColor
    );
// The colour --chrome-blue-color resolves to under the page's current colour scheme.
const resolveBlue = () => {
    const probe = document.createElement('div');
    probe.style.backgroundColor = getComputedStyle(document.documentElement).getPropertyValue('--chrome-blue-color');
    document.body.append(probe);
    const resolved = getComputedStyle(probe).backgroundColor;
    probe.remove();
    return resolved;
};
const waitForBlue = (page, expected) =>
    page.waitForFunction(`(${resolveBlue})() === ${JSON.stringify(expected)}`, { polling: 100 });

test('a light override does not reach dark mode, and a dark override does not reach light mode', async () => {
    const page = await openSidebar(browser, extensionId);
    try {
        await page.evaluate(() => chrome.storage.sync.set({ colorOverrides: { blue: '#ff8800' } }));
        await setScheme(page, 'light');
        await waitForBlue(page, 'rgb(255, 136, 0)');
        expect(await blueSwatch(page)).toBe('rgb(255, 136, 0)');

        // Only a light value is set, so dark mode keeps the built-in dark colour.
        await setScheme(page, 'dark');
        await waitForBlue(page, DARK_DEFAULT_BLUE);

        await page.evaluate(() => chrome.storage.sync.set({ colorOverridesDark: { blue: '#123456' } }));
        await waitForBlue(page, 'rgb(18, 52, 86)');
        expect(await blueSwatch(page)).toBe('rgb(18, 52, 86)');

        await setScheme(page, 'light');
        await waitForBlue(page, 'rgb(255, 136, 0)');
        expect(await blueSwatch(page)).toBe('rgb(255, 136, 0)');
    } finally {
        await setScheme(page, 'light');
        await page.evaluate(() => chrome.storage.sync.set({ colorOverrides: null, colorOverridesDark: null }));
    }
});

test('the built-in dark colours are the dark surfaces tinted with each space colour', async () => {
    const page = await openSidebar(browser, extensionId);
    try {
        await setScheme(page, 'dark');
        const colours = await page.evaluate(() => {
            const probe = document.createElement('div');
            document.body.append(probe);
            const read = name => {
                probe.style.backgroundColor = getComputedStyle(document.documentElement).getPropertyValue(
                    `--chrome-${name}-color`
                );
                return getComputedStyle(probe).backgroundColor;
            };
            const result = Object.fromEntries(
                ['grey', 'blue', 'red', 'yellow', 'green', 'pink', 'purple', 'cyan'].map(name => [name, read(name)])
            );
            probe.remove();
            return result;
        });
        expect(colours).toEqual({
            grey: 'rgb(37, 45, 48)',
            blue: 'rgb(0, 43, 74)',
            red: 'rgb(79, 10, 16)',
            yellow: 'rgb(64, 49, 0)',
            green: 'rgb(0, 51, 16)',
            pink: 'rgb(84, 24, 62)',
            purple: 'rgb(66, 33, 89)',
            cyan: 'rgb(1, 61, 68)'
        });
    } finally {
        await setScheme(page, 'light');
    }
});

test('Settings shows a Light and a Dark picker for each colour, each with its own Reset', async () => {
    const page = await openOptionsPage(browser, extensionId);
    try {
        await page.evaluate(() => chrome.storage.sync.set({ colorOverrides: null, colorOverridesDark: null }));
        await page.reload();
        await page.waitForSelector('#colorBlueDark');
        expect(
            await page.evaluate(() => ({
                pickers: document.querySelectorAll('.color-picker').length,
                lightResets: document.querySelectorAll('.color-reset-btn[data-mode="light"]').length,
                darkResets: document.querySelectorAll('.color-reset-btn[data-mode="dark"]').length,
                darkBlue: document.getElementById('colorBlueDark').value
            }))
        ).toEqual({ pickers: 16, lightResets: 8, darkResets: 8, darkBlue: '#002b4a' });

        const pick = (id, value) =>
            page.evaluate(
                (id, value) => {
                    const picker = document.getElementById(id);
                    picker.value = value;
                    picker.dispatchEvent(new Event('input', { bubbles: true }));
                },
                id,
                value
            );
        const stored = () => page.evaluate(() => chrome.storage.sync.get(['colorOverrides', 'colorOverridesDark']));
        const waitForStored = expected =>
            page.waitForFunction(
                async expected => {
                    const stored = await chrome.storage.sync.get(['colorOverrides', 'colorOverridesDark']);
                    return JSON.stringify(stored) === JSON.stringify(expected);
                },
                { polling: 100 },
                expected
            );

        await pick('colorBlue', '#ff8800');
        await pick('colorBlueDark', '#123456');
        await waitForStored({ colorOverrides: { blue: '#ff8800' }, colorOverridesDark: { blue: '#123456' } });

        // Resetting the dark picker leaves the light value alone.
        await page.click('.color-reset-btn[data-color="blue"][data-mode="dark"]');
        await waitForStored({ colorOverrides: { blue: '#ff8800' }, colorOverridesDark: null });
        expect(await page.evaluate(() => document.getElementById('colorBlueDark').value)).toBe('#002b4a');

        await page.click('.color-reset-btn[data-color="blue"][data-mode="light"]');
        await waitForStored({ colorOverrides: null, colorOverridesDark: null });
        expect(await stored()).toEqual({ colorOverrides: null, colorOverridesDark: null });
    } finally {
        await page.evaluate(() => chrome.storage.sync.set({ colorOverrides: null, colorOverridesDark: null }));
        await page.close();
    }
});
