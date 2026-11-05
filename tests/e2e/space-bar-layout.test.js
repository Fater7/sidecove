import { launchBrowserWithExtension, openSidebar } from './helpers/extension-helper.js';

// The icons-only space bar at the bottom of the sidebar: a few spaces sit together in the
// middle, as in Arc, and a full bar scrolls from its first dot.
let browser, extensionId, page;

beforeAll(async () => {
    ({ browser, extensionId } = await launchBrowserWithExtension());
    page = await openSidebar(browser, extensionId);
    // The side panel's real width.
    await page.setViewport({ width: 360, height: 800 });
    page.on('pageerror', error => console.error('Sidebar error:', error.message));
});

afterAll(async () => {
    await browser?.close();
});

async function addSpace(name) {
    await page.$eval('#addSpaceBtn', button => button.click());
    await page.$eval(
        '#newSpaceName',
        (input, value) => {
            input.value = value;
            input.dispatchEvent(new Event('input', { bubbles: true }));
        },
        name
    );
    await page.$eval('#createSpaceBtn', button => button.click());
    await page.waitForFunction(
        value => document.querySelector('.space.active .space-name')?.value === value,
        { polling: 100 },
        name
    );
}

// Where the dots and the bar are, in page coordinates, with the bar scrolled to `scrollLeft`
// (a number, or 'end').
function measureBar(scrollLeft = 0) {
    return page.evaluate(async scrollLeft => {
        const bar = document.getElementById('spaceSwitcher');
        // Scroll twice, a moment apart: the first jump can be followed by Chrome settling the
        // bar on its previous position. The more-before / more-after classes follow the scroll.
        for (let pass = 0; pass < 2; pass++) {
            bar.scrollLeft = scrollLeft === 'end' ? bar.scrollWidth : scrollLeft;
            await new Promise(resolve => setTimeout(resolve, 250));
        }
        const box = element => {
            const { left, right } = element.getBoundingClientRect();
            return { left, right };
        };
        return {
            bar: box(bar),
            container: box(bar.parentElement),
            dots: [...bar.querySelectorAll('button')].map(box),
            iconsOnly: bar.classList.contains('icons-only'),
            moreBefore: bar.classList.contains('more-before'),
            moreAfter: bar.classList.contains('more-after'),
            overflows: bar.scrollWidth > bar.clientWidth,
            scrollLeft: bar.scrollLeft
        };
    }, scrollLeft);
}

test('two spaces sit side by side in the middle of the bar, not at its two ends', async () => {
    await page.bringToFront();
    await addSpace('Dots two');
    await page.waitForFunction(() => document.querySelectorAll('#spaceSwitcher button').length === 2);

    const bar = await measureBar();
    expect(bar.iconsOnly).toBe(true);
    expect(bar.overflows).toBe(false);
    const [first, second] = bar.dots;
    // Side by side with the bar's small fixed gap.
    expect(second.left - first.right).toBeCloseTo(2, 0);
    // Centred in the sidebar's width, not in the space left of the add-space button.
    const dotsMiddle = (first.left + second.right) / 2;
    const barMiddle = (bar.container.left + bar.container.right) / 2;
    expect(Math.abs(dotsMiddle - barMiddle)).toBeLessThanOrEqual(1);
});

test('a full bar still starts at its first dot and scrolls to its last', async () => {
    await page.bringToFront();
    for (let n = 3; n <= 16; n++) {
        if ((await measureBar()).overflows) break;
        await addSpace(`Dots ${n}`);
    }

    const start = await measureBar(0);
    expect(start.overflows).toBe(true);
    // The first dot is not cut off: the bar starts at it, inside its 8px of padding.
    expect(start.scrollLeft).toBe(0);
    expect(start.dots[0].left - start.bar.left).toBeCloseTo(8, 0);
    expect(start.moreAfter).toBe(true);
    expect(start.moreBefore).toBe(false);

    const end = await measureBar('end');
    expect(end.scrollLeft).toBeGreaterThan(0);
    // The last dot clears the add-space button that floats over the end of the bar.
    expect(end.dots.at(-1).right).toBeLessThanOrEqual(end.bar.right - 48 + 1);
    expect(end.moreBefore).toBe(true);
    expect(end.moreAfter).toBe(false);

    // Back at the start, the first dot is again where it was.
    const back = await measureBar(0);
    expect(back.dots[0].left - back.bar.left).toBeCloseTo(8, 0);
});
