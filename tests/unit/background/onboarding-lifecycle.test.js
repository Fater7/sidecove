import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openOnboardingIfDue } from '../../../src/background/onboarding-lifecycle.js';

function background(completed = false, onboardingVersion = undefined, version = '5.1.0') {
    const opened = [];
    globalThis.chrome = {
        runtime: { getManifest: () => ({ version }) },
        storage: { sync: { get: async () => ({ onboardingCompleted: completed, onboardingVersion }) } },
        tabs: { create: async tab => opened.push(tab) }
    };
    return { installed: [openOnboardingIfDue], opened };
}

test('a fresh install opens the onboarding guide once', async () => {
    const app = background();
    await Promise.all(app.installed.map(listener => listener({ reason: 'install' })));
    assert.equal(app.opened.length, 1);
    assert.equal(app.opened[0].url, 'installation-onboarding.html');
    assert.equal(app.opened[0].active, true);
});

test('uncompleted updates and completed installs do not use the same version gate', async () => {
    for (const [reason, completed, expected] of [
        ['update', false, 1],
        ['install', true, 0]
    ]) {
        const app = background(completed);
        await Promise.all(app.installed.map(listener => listener({ reason })));
        assert.equal(app.opened.length, expected);
    }
});

test('a completed install sees the onboarding once when this extension version changes', async () => {
    const updated = background(true, '5.0.0');
    await Promise.all(updated.installed.map(listener => listener({ reason: 'update', previousVersion: '5.0.0' })));
    assert.equal(updated.opened.length, 1);

    const current = background(true, '5.1.0');
    await Promise.all(current.installed.map(listener => listener({ reason: 'update', previousVersion: '5.0.0' })));
    assert.equal(current.opened.length, 0);
});
