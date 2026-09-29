import {evaluateSlimSAM} from './slimsam-engine.js';
// Serialise photos to bound memory; retain the same model between imports.
let queue=Promise.resolve();
self.onmessage=({data})=>{queue=queue.catch(()=>{}).then(async()=>{
  const {id,pixels,width,height,boxes,foregroundPoints}=data;
  try{const result=await evaluateSlimSAM(pixels,width,height,boxes,progress=>self.postMessage({id,progress:{status:progress.status,file:progress.file,progress:progress.progress,completed:progress.completed,total:progress.total}}),foregroundPoints);
    self.postMessage({id,result},result.filter(Boolean).map(r=>r.alpha.buffer));
  }catch(e){self.postMessage({id,error:e.message});}
});};
