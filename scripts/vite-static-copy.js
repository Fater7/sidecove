import fs from 'fs-extra';
import path from 'path';

const STATIC_FILES = ['manifest.json', 'LICENSE', 'README.md', 'THIRD_PARTY_NOTICES.md'];

/**
 * Copies the files Vite does not process into the build: the manifest and the legal
 * texts. Images and the font come from public/ through Vite's own publicDir copy.
 */
export function staticCopy() {
  let publicDir;
  return {
    name: 'sidecove-static-copy',
    configResolved(config) {
      publicDir = config.publicDir;
    },
    // Rollup's watch mode only sees files in the module graph, so npm run dev would not
    // rebuild when one of these changes, or when a file in public/ is added or changed.
    buildStart() {
      if (!this.meta.watchMode) return;
      for (const file of STATIC_FILES) this.addWatchFile(path.resolve(file));
      if (publicDir) this.addWatchFile(publicDir);
    },
    // Vite drops each HTML page's empty chunk but keeps its source map; drop those too.
    generateBundle: {
      order: 'post',
      handler(options, bundle) {
        for (const file of Object.keys(bundle)) {
          if (file.endsWith('.js.map') && !bundle[file.slice(0, -'.map'.length)]) delete bundle[file];
        }
      }
    },
    // options.dir is the output folder Vite actually used, including a --outDir override.
    writeBundle: async options => {
      for (const file of STATIC_FILES) {
        await fs.copy(file, `${options.dir}/${file}`);
      }

      console.log(`✅ Main extension files built to ${options.dir}/`);
      console.log(`🎉 Sidecove extension build complete!`);
    }
  };
}
