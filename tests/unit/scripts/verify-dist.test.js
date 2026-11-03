import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { findMissing } from '../../../scripts/verify-dist.js';

function build(files) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-dist-'));
    for (const [name, content] of Object.entries(files)) {
        fs.mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
        fs.writeFileSync(path.join(root, name), content);
    }
    return root;
}

const manifest = JSON.stringify({
    background: { service_worker: 'background.js' },
    side_panel: { default_path: 'sidebar.html' },
    icons: { 128: 'assets/icon.png' }
});

test('a build whose references all resolve passes', () => {
    const root = build({
        'manifest.json': manifest,
        'background.js': 'chrome.runtime.getURL("offscreen.html"); chrome.tabs.create({url:"sidebar.html"})',
        'offscreen.html': '<script type="module" src="/assets/offscreen-abc.js"></script>',
        'assets/offscreen-abc.js': 'new URL(chrome.runtime.getURL("/_favicon/"))',
        'sidebar.html':
            '<link rel="stylesheet" href="/styles.css"><a href="https://example.com">x</a><a href="#top">top</a>',
        'styles.css': '@font-face { src: url("/assets/font.ttf") } .x { background: url(data:image/png;base64,AAAA) }',
        'assets/font.ttf': '',
        'assets/icon.png': ''
    });
    assert.deepEqual(findMissing(root), []);
});

test('missing files are reported from the manifest, pages, stylesheets and scripts', () => {
    const root = build({
        'manifest.json': JSON.stringify({
            background: { service_worker: 'background.js' },
            options_page: 'options.html',
            icons: { 128: 'assets/icon.png' }
        }),
        'background.js': 'img.src = "assets/default_icon.png"; chrome.tabs.create({url:"welcome.html?replay=1"})',
        'sidebar.html': '<script src="onboarding-script.js"></script>',
        'styles.css': "@font-face { src: url('assets/font.ttf') }"
    });
    assert.deepEqual(findMissing(root).sort(), [
        'background.js -> assets/default_icon.png',
        'background.js -> welcome.html',
        'manifest.json -> assets/icon.png',
        'manifest.json -> options.html',
        'sidebar.html -> onboarding-script.js',
        'styles.css -> assets/font.ttf'
    ]);
});

test('module imports resolve against the importing chunk, and each missing path is reported once', () => {
    const root = build({
        'manifest.json': JSON.stringify({
            background: { service_worker: 'background.js' },
            action: { default_icon: 'assets/icon.png' }
        }),
        'assets/icon.png': '',
        'background.js':
            'import{a}from"./assets/state-abc.js";import"./assets/gone.js";chrome.runtime.getURL("gone.html");chrome.tabs.create({url:"gone.html"})',
        'assets/state-abc.js': 'import{b}from"./shared-def.js";export const a=import("./lazy-ghi.js")',
        'assets/shared-def.js': 'export const b=1'
    });
    assert.deepEqual(findMissing(root).sort(), [
        'assets/state-abc.js -> ./lazy-ghi.js',
        'background.js -> ./assets/gone.js',
        'background.js -> gone.html'
    ]);
});

test('a relative root works, and a path that escapes it is reported', () => {
    const root = build({ 'manifest.json': '{}', 'page.html': '<img src="../outside.png">' });
    fs.writeFileSync(path.join(path.dirname(root), 'outside.png'), '');
    const relative = path.relative(process.cwd(), root);
    assert.deepEqual(findMissing(relative), ['page.html -> ../outside.png']);
});
