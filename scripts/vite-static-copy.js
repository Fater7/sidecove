import fs from 'fs-extra';

/**
 * Copies the files Vite does not process into the build: the manifest and the legal
 * texts. Images and the font come from public/ through Vite's own publicDir copy.
 */
export function staticCopy() {
  return {
    name: 'sidecove-static-copy',
    // options.dir is the output folder Vite actually used, including a --outDir override.
    writeBundle: async options => {
      for (const file of ['manifest.json', 'LICENSE', 'README.md', 'THIRD_PARTY_NOTICES.md']) {
        await fs.copy(file, `${options.dir}/${file}`);
      }

      console.log(`✅ Main extension files built to ${options.dir}/`);
      console.log(`🎉 Sidecove extension build complete!`);
    }
  };
}
