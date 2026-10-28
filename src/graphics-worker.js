import {computeGraphics} from './graphics-engine.js';
self.onmessage=({data})=>{try{self.postMessage({ok:true,result:computeGraphics(data)});}catch(error){self.postMessage({ok:false,code:error.code||'GRAPHICS_FAILED',message:error.message});}};
