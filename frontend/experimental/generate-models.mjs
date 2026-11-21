import { mkdir, writeFile } from 'node:fs/promises';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { createIllustrationModel, disposeModel } from './scenes.js';

// GLTFExporter uses FileReader in browsers. These texture-free models only
// require Blob-to-ArrayBuffer conversion when exported under Node.js.
if (!globalThis.FileReader) {
  globalThis.FileReader = class {
    readAsArrayBuffer(blob) {
      blob.arrayBuffer().then(result => {
        this.result = result;
        this.onloadend?.();
      }).catch(error => this.onerror?.(error));
    }
  };
}
await mkdir(new URL('./models/', import.meta.url), { recursive: true });
for (const variant of ['landing', 'dashboard', 'groceries']) {
  const model = createIllustrationModel(variant);
  try {
    const data = await new GLTFExporter().parseAsync(model, { binary: true, onlyVisible: true });
    const destination = new URL(`./models/fridgellio-${variant}.glb`, import.meta.url);
    await writeFile(destination, Buffer.from(data));
    console.log(`${variant}: ${data.byteLength.toLocaleString()} bytes`);
  } finally {
    disposeModel(model);
  }
}
