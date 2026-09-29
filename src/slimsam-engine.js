// Apache-2.0 SlimSAM runs entirely in the visiting browser's worker.
import {SamModel,AutoProcessor,RawImage,env} from '@huggingface/transformers';
import {selectMaterialMask} from './segmentation-mask-policy.js';
const modelID='Xenova/slimsam-77-uniform',revision='5850ab45f587c112167512ffef949107115e26a0';
let engine;
export async function evaluateSlimSAM(pixels,width,height,boxes,onProgress=()=>{},foregroundPoints=[]){
  env.allowLocalModels=false;env.backends.onnx.wasm.numThreads=1;
  engine??=Promise.all([SamModel.from_pretrained(modelID,{revision,device:'wasm',dtype:'fp32',progress_callback:onProgress}),AutoProcessor.from_pretrained(modelID,{revision})]).catch(e=>{engine=null;throw e;});
  const [model,processor]=await engine;
  onProgress({status:'inference'});
  const image=new RawImage(pixels,width,height,4);
  // This Hugging Face export uses positive/negative point labels, unlike the
  // Meta ONNX box-corner convention. Use an object centre and outside points.
  const plane=width*height,results=[];let embeddings;
  // Four objects at a time bound upscaled-mask memory on tablets. Encode the
  // photograph once, then reuse embeddings for every prompt batch.
  for(let start=0;start<boxes.length;start+=4){
    const batch=boxes.slice(start,start+4),seeds=batch.map(([l,t,r,b],i)=>foregroundPoints[start+i]?.length?foregroundPoints[start+i]:[[(l+r)/2,(t+b)/2]]),maxPoints=Math.max(...seeds.map(s=>s.length))+2;
    const points=batch.map(([l,t,r,b],i)=>[...seeds[i],[Math.max(0,l-8),Math.max(0,t-8)],[Math.min(width-1,r+8),Math.min(height-1,b+8)],...Array.from({length:maxPoints-seeds[i].length-2},()=>[0,0])]);
    const labels=seeds.map(s=>[...s.map(()=>1),0,0,...Array(maxPoints-s.length-2).fill(-1)]);
    const inputs=await processor(image,{input_points:[points],input_labels:[labels]});
    embeddings??=await model.get_image_embeddings(inputs);
    const output=await model({...inputs,...embeddings}),[masks]=await processor.post_process_masks(output.pred_masks,inputs.original_sizes,inputs.reshaped_input_sizes),channels=output.iou_scores.dims.at(-1);
    for(let n=0;n<batch.length;n++)results.push(selectMaterialMask(masks.data.subarray(n*channels*plane,(n+1)*channels*plane),output.iou_scores.data.subarray(n*channels,(n+1)*channels),width,height,batch[n]));
    onProgress({status:'inference',completed:Math.min(start+4,boxes.length),total:boxes.length});
  }
  return results;
}
