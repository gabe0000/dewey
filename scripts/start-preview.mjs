import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {collection} from '../src/library.mjs';
import {createApp} from '../src/server.mjs';

export function previewConfig(env = process.env) {
  const source = env.DEWEY_LIBRARY_ROOT;
  const index = env.DEWEY_INDEX;
  if (!source || !index || !path.isAbsolute(source) || !path.isAbsolute(index)) {
    throw Error('Set DEWEY_LIBRARY_ROOT and DEWEY_INDEX to absolute paths for your existing library and disposable cache. No fallback directories are used by preview.');
  }
  const port = Number(env.PORT || 8080);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw Error('PORT must be between 1 and 65535.');
  if (path.resolve(source) === path.resolve(index)) throw Error('Library and cache must be separate directories.');
  const household=env.DEWEY_HOUSEHOLD_ROOT;
  if(household){
    if(!path.isAbsolute(household))throw Error('Household storage must be an absolute path');
    for(const root of [source,index])for(const [a,b] of [[root,household],[household,root]]){const rel=path.relative(a,b);if(!rel||(!rel.startsWith('..')&&!path.isAbsolute(rel)))throw Error('Household storage must be separate from originals and index');}
  }
  return {source,index,port,setup:false,...(household?{household}:{})};
}

export async function startPreview(env = process.env) {
  const config = previewConfig(env);
  if (!(await collection(config.source)).length) throw Error('No installed collection at DEWEY_LIBRARY_ROOT. Check the path; preview will not install or move your library.');
  const server = await createApp(config);
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(config.port, '127.0.0.1', resolve);
  });
  console.log(`Dewey preview: http://127.0.0.1:${config.port}\nLibrary: ${config.source}\nCache: ${config.index}\nSetup disabled. Keep this terminal open; Ctrl-C stops the preview.`);
  return server;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const server = await startPreview();
    for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => server.close());
  } catch (error) {
    console.error(`Dewey could not start: ${error.message}`);
    process.exitCode = 1;
  }
}
