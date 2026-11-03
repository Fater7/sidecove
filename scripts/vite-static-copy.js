import fs from 'fs-extra';
import path from 'path';

const STATIC_FILES = ['manifest.json', 'LICENSE', 'README.md', 'THIRD_PARTY_NOTICES.md'];

/**
 * Copies the files Vite does not process into the build: the manifest and the legal
 * texts. Images and the font come from public/ through Vite's own publicDir copy.
 */
export function staticCopy() {
  return {
    name: 'sidecove-static-copy',
    // Rollup's watch mode only sees files in the module graph, so npm run dev would not
    // rebuild when one of these or a file in public/ changes.
    buildStart() {
      const publicFiles = fs.readdirSync('public', { recursive: true }).map(file => path.join('public', file));
      for (const file of [...STATIC_FILES, ...publicFiles]) {
        if (fs.statSync(file).isFile()) this.addWatchFile(path.resolve(file));
      }
    },
    // options.dir is the output folder Vite actually used, including a --outDir override.
    writeBundle: async (options, bundle) => {
      for (const file of STATIC_FILES) {
        await fs.copy(file, `${options.dir}/${file}`);
      }
      // Vite drops each HTML page's empty chunk but writes its source map; remove those.
      for (const file of Object.keys(bundle)) {
        if (file.endsWith('.js.map') && !bundle[file.slice(0, -'.map'.length)]) {
          await fs.remove(`${options.dir}/${file}`);
        }
      }

      console.log(`✅ Main extension files built to ${options.dir}/`);
      console.log(`🎉 Sidecove extension build complete!`);
    }
  };
}
