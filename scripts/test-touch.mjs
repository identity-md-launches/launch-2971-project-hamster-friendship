// Retain the established command while testing the new direct-touch behavior.
import './test-direct-touch.mjs';
import {mkdir,copyFile} from 'node:fs/promises';
await mkdir('test/scratch/touch',{recursive:true});
await copyFile('test/scratch/personal-best/movement-results.json','test/scratch/touch/engine-results.json');
