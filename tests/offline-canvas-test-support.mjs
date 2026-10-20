import {symlink} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve,dirname,join} from 'node:path';
import {createCanvas} from 'canvas';

const swatch=createCanvas(2,2);swatch.getContext('2d').fillRect(0,0,2,2);
export const tinyPNG=new Uint8Array(swatch.toBuffer('image/png'));

export async function linkTestCanvas(directory){
  const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
  await symlink(join(root,'node_modules'),join(directory,'node_modules'),'dir');
}
