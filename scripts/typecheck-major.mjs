// Check all shipped JavaScript with the project's existing non-strict JS mode.
// The test tool lives in scratch; it is never a runtime/build dependency.
import {spawnSync} from 'node:child_process';
import {readdir} from 'node:fs/promises';
import {resolve} from 'node:path';
const source=(await readdir('src')).filter(file=>file.endsWith('.js')).map(file=>'src/'+file);
const result=spawnSync(process.execPath,[resolve('test/scratch/node_modules/typescript/bin/tsc'),'--allowJs','--checkJs','--noEmit','--strict','false','--target','ES2022','--lib','ES2022,DOM','src/types.d.ts',...source],{stdio:'inherit'});
if(result.error)throw result.error;
if(result.status)process.exit(result.status);
console.log('Typechecked all '+source.length+' runtime scripts and shared declarations.');
