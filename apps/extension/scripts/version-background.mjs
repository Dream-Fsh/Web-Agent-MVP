import { createHash } from 'node:crypto';
import { readFile, writeFile, copyFile } from 'node:fs/promises';

// Persistent Chrome profiles cache extension service workers by script URL.
// Changing that URL with the bundle contents ensures an updated build is loaded.
const directory = new URL('../dist/', import.meta.url);
const source = new URL('background/serviceWorker.js', directory);
const digest = createHash('sha256').update(await readFile(source)).digest('hex').slice(0, 16);
const worker = `background/serviceWorker.${digest}.js`;
await copyFile(source, new URL(worker, directory));
const manifestPath = new URL('manifest.json', directory);
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
manifest.background.service_worker = worker;
// Chrome must also re-read the manifest for an already registered extension.
// Use a content-derived legal four-part version for this unpacked development build.
manifest.version_name = `${manifest.version}+${digest}`;
manifest.version = `0.${parseInt(digest.slice(0, 4), 16)}.${parseInt(digest.slice(4, 8), 16)}.${parseInt(digest.slice(8, 12), 16)}`;
await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
