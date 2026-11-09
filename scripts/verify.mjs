import path from 'node:path';
import {collection} from '../src/library.mjs';
const target = process.argv[2] || process.env.DEWEY_LIBRARY_ROOT || '../dewey-library';
const docs = await collection(path.resolve(target));
if(!docs.length) {console.error('No installed collection found');process.exitCode=1;}
else console.log(`Verified ${docs.length} source files against manifest SHA-256 checksums.`);
