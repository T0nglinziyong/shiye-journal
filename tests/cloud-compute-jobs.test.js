import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {createCanvas,loadImage} from 'canvas';

const userID='2111845279800434690';
const sourceID='11111111-1111-4111-8111-111111111111';
const jobID='22222222-2222-4222-8222-222222222222';

async function moduleUnderTest(){
  const result=await build({entryPoints:['src/cloud-compute-jobs.js'],bundle:true,write:false,
    platform:'browser',format:'esm',plugins:[{name:'cloud-compute-mocks',setup(builder){
      builder.onResolve({filter:/\/(cloud-session|cloud-api-origin)\.js$/},args=>({path:args.path,namespace:'compute-mock'}));
      builder.onLoad({filter:/.*/,namespace:'compute-mock'},args=>({contents:args.path.includes('cloud-session')
        ?`export const cloudClient=()=>globalThis.__computeMock.client;
          export const cloudStorage=()=>globalThis.__computeMock.storage;
          export const requireCloudUser=async()=>({id:${JSON.stringify(userID)}});`
        :`export const cloudApiRequest=async()=>({ok:true});`,loader:'js'}));
    }}]});
  return import('data:text/javascript;base64,'+Buffer.from(result.outputFiles[0].contents).toString('base64'));
}

test('manual SAM box reuses the owner-scoped corrected page in CloudBase',async()=>{
  const calls=[];
  globalThis.__computeMock={storage:{from:()=>({
    copy:async(...args)=>{calls.push(['copy',...args]);return {data:{path:args[1]}};},
    upload:async()=>{throw Error('manual prompt must not upload from the phone');}
  })},client:{rpc:async(name,args)=>{calls.push(['rpc',name,args]);return {data:{id:args.p_id,status:'queued'}};}}};
  try{
    const {submitSegmentationJob}=await moduleUnderTest();
    const id=await submitSegmentationJob(null,{model:'sam2-small',kind:'material-segmentation',
      sourceJobId:sourceID,box:[10,20,100,120]});
    assert.match(id,/^[a-f0-9-]{36}$/);
    assert.equal(calls[0][0],'copy');
    assert.equal(calls[0][1],`${userID}/compute/${sourceID}/input.png`);
    assert.equal(calls[0][2],`${userID}/compute/${id}/input.png`);
    assert.equal(calls[1][1],'shiye_enqueue_compute_job_v1');
    assert.equal(calls[1][2].p_input_path,calls[0][2]);
  }finally{delete globalThis.__computeMock;}
});

test('completed SAM masks download in bounded parallel order',async()=>{
  const canvas=createCanvas(2,2),ctx=canvas.getContext('2d');
  ctx.fillStyle='rgba(255,0,0,1)';ctx.fillRect(0,0,2,2);
  const png=canvas.toBuffer('image/png');
  const objects=Array.from({length:8},(_,i)=>({file:`material-${String(i+1).padStart(3,'0')}.png`,
    bbox_xyxy:[0,0,2,2],area:4}));
  const manifest=new Blob([JSON.stringify({version:1,width:2,height:2,model:'sam2-small',objects})]);
  let active=0,peak=0;
  const old={window:globalThis.window,document:globalThis.document,
    createImageBitmap:globalThis.createImageBitmap};
  globalThis.window={addEventListener(){},removeEventListener(){}};
  globalThis.document={addEventListener(){},removeEventListener(){},createElement:()=>createCanvas(1,1)};
  globalThis.createImageBitmap=async blob=>loadImage(Buffer.from(await blob.arrayBuffer()));
  globalThis.__computeMock={storage:{from:()=>({download:async path=>{
    if(path.endsWith('/result.json'))return {data:manifest};
    active++;peak=Math.max(peak,active);
    await new Promise(resolve=>setTimeout(resolve,25));
    active--;return {data:new Blob([png])};
  }})},client:{from:()=>({select:()=>({eq:()=>({single:async()=>({data:{id:jobID,status:'completed',
    result_path:`${userID}/compute/${jobID}/result.json`}})})})})}};
  try{
    const {waitForSegmentationJob}=await moduleUnderTest();
    const regions=await waitForSegmentationJob(jobID);
    assert.equal(peak,4);
    assert.equal(regions.length,8);
    assert.ok(regions.every(region=>region.mask.alpha.length===4&&region.mask.alpha[0]===255));
  }finally{
    delete globalThis.__computeMock;
    for(const [key,value] of Object.entries(old)){
      if(value===undefined)delete globalThis[key];else globalThis[key]=value;
    }
  }
});
