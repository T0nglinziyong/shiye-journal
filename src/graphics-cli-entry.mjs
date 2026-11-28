import {computeGraphics} from './graphics-engine.js';
let input='';
process.stdin.setEncoding('utf8');process.stdin.on('data',chunk=>{input+=chunk;if(input.length>150000){process.stderr.write('GRAPHICS_LIMIT',()=>process.exit(1));process.stdin.pause();}});
// Paper owns a frame scheduler. This isolated one-shot process must close after
// flushing its response; otherwise a completed calculation can look timed out.
process.stdin.on('end',()=>{try{process.stdout.write(JSON.stringify(computeGraphics(JSON.parse(input))),()=>process.exit(0));}catch(error){process.stderr.write(JSON.stringify({code:error.code||'GRAPHICS_FAILED',message:error.message}),()=>process.exit(1));}});
