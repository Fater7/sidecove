import test from 'node:test';
import assert from 'node:assert/strict';
import { Utils } from '../../../src/shared/utils.js';
import { isNewTabPage, isUntouchedPage, shouldCloseEmptyNewTab } from '../../../src/background/empty-new-tab.js';

const emptyTab = { id: 5, url: 'chrome://newtab/', pinned: false };
const ask = (overrides = {}) =>
    shouldCloseEmptyNewTab({
        enabled: true,
        tab: emptyTab,
        untouched: true,
        windowTabCount: 3,
        protectedIds: new Set(),
        bindings: {},
        urlKeys: new Set(),
        ...overrides
    });

test('recognises Chrome’s new tab page and nothing else', () => {
    assert.equal(isNewTabPage('chrome://newtab/'), true);
    assert.equal(isNewTabPage('chrome://newtab'), true);
    assert.equal(isNewTabPage('chrome://new-tab-page/'), true);
    for (const other of [
        'about:blank',
        'https://example.com/',
        'chrome://settings/',
        'chrome://newtab/x',
        '',
        undefined
    ])
        assert.equal(isNewTabPage(other), false, String(other));
});

test('a tab still loading its new tab page is untouched, one heading elsewhere is not', () => {
    assert.equal(isUntouchedPage({ url: '', pendingUrl: 'chrome://newtab/' }), true);
    assert.equal(isUntouchedPage({ url: 'chrome://newtab/' }), true);
    assert.equal(isUntouchedPage({ url: 'chrome://newtab/', pendingUrl: 'https://example.com/' }), false);
    assert.equal(isUntouchedPage({ url: 'https://example.com/' }), false);
});

test('closes an empty new tab that was left', () => {
    assert.equal(ask(), true);
});

test('keeps it when the setting is off', () => {
    assert.equal(ask({ enabled: false }), false);
});

test('keeps a tab that did not start as an empty new tab or has been to a site', () => {
    assert.equal(ask({ untouched: false }), false);
});

test('keeps a tab that is now on, or heading to, another page', () => {
    assert.equal(ask({ tab: { ...emptyTab, url: 'https://example.com/' } }), false);
    assert.equal(ask({ tab: { ...emptyTab, pendingUrl: 'https://example.com/' } }), false);
    assert.equal(ask({ tab: { ...emptyTab, url: '' } }), false, 'the page has not loaded yet');
});

test('never closes the last tab of a window', () => {
    assert.equal(ask({ windowTabCount: 1 }), false);
    assert.equal(ask({ windowTabCount: 2 }), true);
});

test('never closes a pinned tab or a favourite', () => {
    assert.equal(ask({ tab: { ...emptyTab, pinned: true } }), false);
    assert.equal(ask({ protectedIds: new Set([5]) }), false, 'a favourite of a space');
    assert.equal(ask({ bindings: { 5: { bookmarkId: 'b1' } } }), false, 'a tab bound to a favourite bookmark');
    assert.equal(
        ask({ urlKeys: new Set([Utils.getPinnedUrlKey(emptyTab.url)]) }),
        false,
        'its address is a Sidecove bookmark'
    );
});
