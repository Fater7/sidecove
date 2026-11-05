import test from 'node:test';
import assert from 'node:assert/strict';
import { isNewTabPage, isUntouchedPage } from '../../../src/shared/new-tab-page.js';

test('Chrome new tab page addresses are recognised, other pages are not', () => {
    assert.equal(isNewTabPage('chrome://newtab/'), true);
    assert.equal(isNewTabPage('chrome://new-tab-page'), true);
    assert.equal(isNewTabPage('about:blank'), false);
    assert.equal(isNewTabPage(undefined), false);
});

test('a tab with no address yet, or only the new tab page, is untouched', () => {
    assert.equal(isUntouchedPage({ url: '' }), true);
    assert.equal(isUntouchedPage({ url: '', pendingUrl: 'chrome://newtab/' }), true);
    assert.equal(isUntouchedPage({ url: 'chrome://newtab/' }), true);
    assert.equal(isUntouchedPage({ url: '', pendingUrl: 'http://example.com/' }), false);
    assert.equal(isUntouchedPage({ url: 'http://example.com/' }), false);
});
