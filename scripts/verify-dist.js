// Fails if anything in the built extension points at a file that is not in it: the manifest's
// paths, src/href in pages, url() in stylesheets, and module imports and extension paths in scripts.
// Usage: node scripts/verify-dist.js [dist-folder]
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const dist = path.resolve(process.argv[2] || 'dist');
// Paths Chrome serves itself rather than from the package.
const virtualPaths = ['/_favicon/'];
const external = /^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i;

function files(dir) {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
        const full = path.join(dir, entry.name);
        return entry.isDirectory() ? files(full) : [full];
    });
}

const icons = value => (typeof value === 'string' ? [value] : Object.values(value || {}));

function manifestPaths(manifest) {
    return [
        manifest.background?.service_worker,
        manifest.side_panel?.default_path,
        manifest.options_page,
        manifest.options_ui?.page,
        manifest.action?.default_popup,
        manifest.devtools_page,
        ...Object.values(manifest.chrome_url_overrides || {}),
        ...(manifest.sandbox?.pages || []),
        ...icons(manifest.icons),
        ...icons(manifest.action?.default_icon),
        ...(manifest.content_scripts || []).flatMap(script => [...(script.js || []), ...(script.css || [])]),
        // Patterns such as "assets/*" cannot be checked file by file.
        ...(manifest.web_accessible_resources || [])
            .flatMap(entry => entry.resources || [])
            .filter(r => !r.includes('*'))
    ].filter(Boolean);
}

// Module imports resolve against the script's own folder. Other extension paths in a script
// (getURL, assets, pages) resolve against the page that runs it, and every page is at the top
// of dist/.
function scriptPaths(source) {
    const modules = new Set();
    const pages = new Set();
    for (const match of source.matchAll(/(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s*)["'`](\.{1,2}\/[^"'`]+)["'`]/g)) {
        modules.add(match[1]);
    }
    for (const match of source.matchAll(/getURL\(\s*["'`]([^"'`]*)["'`]/g)) pages.add(match[1]);
    for (const match of source.matchAll(/["'`](\/?assets\/[^"'`?#]+|[\w-]+\.html)(?=[?#"'`])/g)) pages.add(match[1]);
    return { modules: [...modules], pages: [...pages] };
}

const scanned = /\.(?:html|css|js)$/;

export function findMissing(rootDir) {
    const root = path.resolve(rootDir);
    const missing = new Set();
    const check = (from, ref, base) => {
        const clean = ref.trim().split(/[?#]/)[0];
        if (!clean || external.test(ref.trim()) || virtualPaths.some(p => clean.startsWith(p))) return;
        const target = clean.startsWith('/') ? path.join(root, clean) : path.resolve(base, clean);
        const relative = path.relative(root, target);
        const inside = !relative.startsWith('..') && !path.isAbsolute(relative);
        if (!inside || !fs.existsSync(target) || fs.statSync(target).isDirectory()) {
            missing.add(`${path.relative(root, from)} -> ${ref}`);
        }
    };
    const manifestFile = path.join(root, 'manifest.json');
    for (const ref of manifestPaths(JSON.parse(fs.readFileSync(manifestFile, 'utf8')))) check(manifestFile, ref, root);
    for (const file of files(root).filter(name => scanned.test(name))) {
        const source = fs.readFileSync(file, 'utf8');
        if (file.endsWith('.js')) {
            const { modules, pages } = scriptPaths(source);
            for (const ref of modules) check(file, ref, path.dirname(file));
            for (const ref of pages) check(file, ref, root);
            continue;
        }
        if (file.endsWith('.html')) {
            for (const match of source.matchAll(/\s(?:src|href)=["']([^"']*)["']/g))
                check(file, match[1], path.dirname(file));
        }
        for (const match of source.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/g))
            check(file, match[1], path.dirname(file));
    }
    return [...missing];
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
    if (!fs.existsSync(path.join(dist, 'manifest.json'))) {
        console.error(`❌ ${dist} has no manifest.json. Run "npm run build" first.`);
        process.exit(1);
    }
    const missing = findMissing(dist);
    if (missing.length) {
        console.error(`❌ ${missing.length} reference(s) in ${path.basename(dist)}/ point to missing files:`);
        for (const line of missing) console.error(`   ${line}`);
        process.exit(1);
    }
    console.log(`✅ Every file reference in ${path.basename(dist)}/ resolves.`);
}
