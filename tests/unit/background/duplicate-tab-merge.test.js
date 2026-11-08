import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    findDuplicateToClose,
    registerDuplicateTabMerge,
    DUPLICATE_TAB_ALARM
} from '../../../src/background/duplicate-tab-merge.js';

const now = 10_000_000;
const old = now - 121 * 60_000;
const recent = now - 30 * 60_000;
const makeTab = (id, extra = {}) => ({
    id,
    windowId: 1,
    url: 'https://example.test/a?x=1',
    lastAccessed: old,
    ...extra
});
const spaces = [
    { id: 'one', temporaryTabs: [1, 2, 3, 4, 5, 6, 7], spaceBookmarks: [], pinnedTabs: [] },
    { id: 'two', temporaryTabs: [8], spaceBookmarks: [], pinnedTabs: [] }
];
const choose = (tabs, extra = {}) =>
    findDuplicateToClose({
        tabs,
        spaces,
        protectedIds: new Set(),
        firstSeen: {},
        now,
        idleMinutes: 120,
        ...extra
    });

test('closes the least recently visited duplicate only after the configured time', () => {
    assert.equal(
        choose([makeTab(1, { lastAccessed: recent }), makeTab(2), makeTab(3, { lastAccessed: old - 100 })]),
        3
    );
    assert.equal(choose([makeTab(1, { lastAccessed: recent }), makeTab(2, { lastAccessed: recent })]), null);
    assert.equal(choose([makeTab(1)]), null);
});

test('matches exact URLs only within a window and a space', () => {
    assert.equal(
        choose([
            makeTab(1),
            makeTab(2, { url: 'https://example.test/a?x=2' }),
            makeTab(3, { windowId: 2 }),
            makeTab(8)
        ]),
        null
    );
    assert.equal(choose([makeTab(1), makeTab(2, { url: 'chrome://newtab/' })]), null);
});

test('preserves active, highlighted, playing, pinned, favorite, hidden and navigating tabs', () => {
    const tabs = [
        makeTab(1, { active: true }),
        makeTab(2, { highlighted: true }),
        makeTab(3, { audible: true }),
        makeTab(4, { pinned: true }),
        makeTab(5),
        makeTab(6),
        makeTab(7, { pendingUrl: 'https://other.test/' })
    ];
    assert.equal(choose(tabs, { protectedIds: new Set([5]), hidden: new Set([6]) }), null);
    assert.equal(choose([makeTab(1), makeTab(2)], { hidden: new Set([2]) }), null);
});

test('starts a fresh inactivity period for a tab without a known visit time', () => {
    const tabs = [makeTab(1, { active: true }), makeTab(2, { lastAccessed: 0 })];
    assert.equal(choose(tabs), null);
    assert.equal(choose(tabs, { firstSeen: { 2: recent } }), null);
    assert.equal(choose(tabs, { firstSeen: { 2: old } }), 2);
});

test('rechecks live tab state before closing and leaves a newly active tab open', async () => {
    const handlers = {};
    const event = name => ({
        addListener(fn) {
            handlers[name] = fn;
        }
    });
    const removed = [];
    const tabs = [makeTab(1, { active: true }), makeTab(2)];
    let queries = 0;
    const settings = { mergeDuplicateTabsEnabled: true, mergeDuplicateTabsIdleMinutes: 120 };
    const chromeApi = {
        alarms: { onAlarm: event('alarm'), get: async () => ({}), create: async () => {}, clear: async () => {} },
        storage: { onChanged: event('change'), session: { get: async () => ({}), set: async () => {} } },
        tabs: {
            query: async () => (++queries === 1 ? tabs : tabs.map(tab => ({ ...tab, active: true }))),
            remove: async id => removed.push(id)
        }
    };
    const store = { spaces, hidden: new Set(), run: async fn => fn() };
    globalThis.chrome = { storage: { local: { get: async () => ({}) } } };
    const { checkDuplicates } = registerDuplicateTabMerge({
        chromeApi,
        spaceStore: store,
        getSettings: async () => settings
    });
    await checkDuplicates();
    assert.deepEqual(removed, []);
    assert.ok(handlers.alarm && handlers.change);
    delete globalThis.chrome;
});

test('an enabled check removes old duplicates and leaves the newest copy in place', async () => {
    const event = () => ({ addListener() {} });
    let tabs = [
        makeTab(1, { lastAccessed: Date.now() - 130 * 60_000 }),
        makeTab(2, { lastAccessed: Date.now() - 140 * 60_000 }),
        makeTab(3, { lastAccessed: Date.now() - 150 * 60_000 })
    ];
    const removed = [];
    const session = {};
    const chromeApi = {
        alarms: { onAlarm: event(), get: async () => ({}), create: async () => {}, clear: async () => {} },
        storage: {
            onChanged: event(),
            session: {
                get: async () => structuredClone(session),
                set: async values => Object.assign(session, values)
            }
        },
        tabs: {
            query: async () => structuredClone(tabs),
            remove: async id => {
                removed.push(id);
                tabs = tabs.filter(tab => tab.id !== id);
            }
        }
    };
    const store = { spaces, hidden: new Set(), run: async fn => fn() };
    globalThis.chrome = { storage: { local: { get: async () => ({}) } } };
    const { checkDuplicates } = registerDuplicateTabMerge({
        chromeApi,
        spaceStore: store,
        getSettings: async () => ({ mergeDuplicateTabsEnabled: true, mergeDuplicateTabsIdleMinutes: 120 })
    });
    await checkDuplicates();
    assert.deepEqual(removed, [3, 2]);
    assert.deepEqual(
        tabs.map(tab => tab.id),
        [1]
    );
    delete globalThis.chrome;
});

test('the alarm is removed when the setting is disabled', async () => {
    let cleared;
    const event = () => ({ addListener() {} });
    const chromeApi = {
        alarms: {
            onAlarm: event(),
            clear: async name => {
                cleared = name;
            }
        },
        storage: { onChanged: event() }
    };
    const feature = registerDuplicateTabMerge({
        chromeApi,
        spaceStore: {},
        getSettings: async () => ({ mergeDuplicateTabsEnabled: false })
    });
    await feature.configureAlarm();
    assert.equal(cleared, DUPLICATE_TAB_ALARM);
});
