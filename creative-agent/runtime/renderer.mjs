import {createHash} from 'node:crypto';
import {loadOfflineCanvas,renderOfflinePNG} from '../../src/offline-node-preview.mjs';
import {textFont} from '../../src/editor-tools-model.js';
import {auditCreationDesign} from '../../src/creation-design-audit.js';
import {creationSceneRevision} from '../../src/creation-transaction.js';

const hash=bytes=>'sha256:'+createHash('sha256').update(bytes).digest('hex');
export async function createHarnessRenderer({source,images,saveArtifact}){
  const canvas=await loadOfflineCanvas(),decodedCache=new Map();let lastRendered=null;
  const modelImage=async(bytes,limit=1280)=>{
    const image=await canvas.loadImage(Buffer.from(bytes)),scale=Math.min(1,limit/Math.max(image.width,image.height));
    const out=canvas.createCanvas(Math.max(1,Math.round(image.width*scale)),Math.max(1,Math.round(image.height*scale))),ctx=out.getContext('2d');
    ctx.fillStyle='#ffffff';ctx.fillRect(0,0,out.width,out.height);ctx.drawImage(image,0,0,out.width,out.height);
    return 'data:image/jpeg;base64,'+out.toBuffer('image/jpeg',{quality:.88}).toString('base64');
  };
  const sourceImages=new Map(),detailImages=new Map(),thumbnailImages=new Map();
  for(const material of source.materials){
    const bytes=images[material.alias];if(!bytes)throw Error('缺少授权素材图像：'+material.alias);
    sourceImages.set(material.alias,bytes);
  }
  const tray=async(document,signal,{space='tray',all=false}={})=>{
    signal?.throwIfAborted();
    const nodes=[];const collect=items=>{for(const node of items||[]){nodes.push(node);if(node.children)collect(node.children);}};
    collect(document.page.layers);
    const placed=new Set(nodes.filter(node=>node.type==='material').map(node=>node.assetID));
    const unplaced=space==='tray'?source.materials.filter(material=>all||!placed.has(material.assetID)):[];
    const parked=all?[]:document.page.layers.filter(node=>node.isParked&&(node.workspaceId||'tray')===space);
    if(!unplaced.length&&!parked.length)return null;
    const cellWidth=240,cellHeight=218,columns=Math.min(6,Math.max(3,unplaced.length)),width=columns*cellWidth,header=parked.length?90:54;
    let parkedImage=null,parkedHeight=0;
    if(parked.length){
      const draft=structuredClone(document.page);
      const reveal=nodes=>{for(const node of nodes){node.isParked=false;if(node.children)reveal(node.children);}};
      draft.layers=structuredClone(parked);reveal(draft.layers);draft.paperColor='#eef1ea';draft.paperPattern='plain';
      const {png}=await renderOfflinePNG(draft,source,images,canvas,{decodedCache});
      parkedImage=await canvas.loadImage(png);
      parkedHeight=Math.round(parkedImage.height*width/parkedImage.width);
    }
    const rows=Math.ceil(unplaced.length/columns),height=header+parkedHeight+(rows?42+rows*cellHeight:0);
    const surface=canvas.createCanvas(width,height),ctx=surface.getContext('2d');
    ctx.fillStyle='#e9ede6';ctx.fillRect(0,0,width,height);
    ctx.fillStyle='#344938';ctx.font='bold 30px sans-serif';ctx.fillText(all?'全局素材编号图':space==='tray'?'素材暂放区':space,28,39);
    if(parkedImage){ctx.drawImage(parkedImage,0,header,width,parkedHeight);}
    const start=header+parkedHeight;
    if(unplaced.length){
      ctx.fillStyle='#344938';ctx.font='24px sans-serif';ctx.fillText(all?'全部授权素材 · 编号对应素材清单':'尚未取用 · 编号对应素材清单',28,start+29);
      for(const [index,material] of unplaced.entries()){
        signal?.throwIfAborted();
        const col=index%columns,row=Math.floor(index/columns),x=col*cellWidth,y=start+42+row*cellHeight;
        ctx.fillStyle='#fdfdfa';ctx.fillRect(x+5,y+5,cellWidth-10,cellHeight-10);
        if(!thumbnailImages.has(material.alias))thumbnailImages.set(material.alias,await canvas.loadImage(Buffer.from(images[material.alias])));
        const image=thumbnailImages.get(material.alias);
        const factor=Math.min((cellWidth-24)/image.width,(cellHeight-55)/image.height);
        ctx.drawImage(image,x+(cellWidth-image.width*factor)/2,y+8+(cellHeight-55-image.height*factor)/2,image.width*factor,image.height*factor);
        const label=source.sourceSnapshots.find(snapshot=>snapshot.assetID===material.assetID)?.title||material.alias;
        ctx.fillStyle='#344938';ctx.font='bold 19px sans-serif';ctx.fillText(String(index+1).padStart(2,'0')+' '+String(label).slice(0,10),x+12,y+cellHeight-18,cellWidth-24);
      }
    }
    const data=surface.toBuffer('image/jpeg',{quality:.86});
    return {imageURL:await modelImage(data,3000),items:unplaced.map((material,index)=>({number:index+1,alias:material.alias,title:source.sourceSnapshots.find(snapshot=>snapshot.assetID===material.assetID)?.title||''})),parkedIDs:parked.map(node=>node.id),signature:hash(data)};
  };
  const textContext=canvas.createCanvas(1,1).getContext('2d');
  return {
    measureText(node,text){
      textContext.font=textFont(node);textContext.letterSpacing=(node.letterSpacing||0)+'px';
      return textContext.measureText(text).width;
    },
    async reviewDetails(document,signal){
      signal?.throwIfAborted();
      const audit=auditCreationDesign(document.page),candidates=audit.textCoverCandidates||[];
      if(!audit.textRegions?.length)return [];
      const revision=creationSceneRevision(document);
      const png=lastRendered?.revision===revision?lastRendered.png:(await renderOfflinePNG(document.page,source,images,canvas,{decodedCache})).png;
      const image=await canvas.loadImage(png),groups=new Map();
      for(const item of candidates){const group=groups.get(item.textId)||{...item,coverIds:[],overlapArea:0};group.coverIds.push(item.coverId);group.overlapArea+=item.overlapArea;groups.set(item.textId,group);}
      // Printed marks beneath text can disrupt letters without any upper-layer
      // intersection. Include actual paragraph crops even when geometry is clear.
      for(const item of audit.textRegions)if(!groups.has(item.textId))groups.set(item.textId,{...item,coverIds:[],overlapArea:0});
      const details=[];
      for(const item of [...groups.values()].sort((a,b)=>b.overlapArea-a.overlapArea||b.text.length-a.text.length).slice(0,4)){
        const pad=18,x=Math.max(0,Math.floor(item.box.x-pad)),y=Math.max(0,Math.floor(item.box.y-pad));
        const right=Math.min(image.width,Math.ceil(item.box.x+item.box.width+pad)),bottom=Math.min(image.height,Math.ceil(item.box.y+item.box.height+pad));
        const width=right-x,height=bottom-y;if(width<=0||height<=0)continue;
        const scale=Math.min(2,1280/Math.max(width,height)),crop=canvas.createCanvas(Math.max(1,Math.round(width*scale)),Math.max(1,Math.round(height*scale)));
        crop.getContext('2d').drawImage(image,x,y,width,height,0,0,crop.width,crop.height);
        details.push({textId:item.textId,text:item.text,coverIds:item.coverIds,regionPx:{x,y,width,height},pngHash:hash(png),sceneRevision:revision,imageURL:await modelImage(crop.toBuffer('image/png'))});
      }
      return details;
    },
    async renderDraft(document,signal){
      signal?.throwIfAborted();
      const {png}=await renderOfflinePNG(document.page,source,images,canvas,{decodedCache});
      signal?.throwIfAborted();
      return {pngHash:hash(png),sceneRevision:creationSceneRevision(document),imageURL:await modelImage(png)};
    },
    async inspectMaterials(keys){return Promise.all(keys.map(async alias=>{
      if(!sourceImages.has(alias))throw Error('素材不在本次授权来源中');
      if(!detailImages.has(alias))detailImages.set(alias,await modelImage(sourceImages.get(alias)));
      return {alias,url:detailImages.get(alias)};
    }));},
    tray,
    index(document,signal){return tray(document,signal,{all:true});},
    async viewSpace(document,id,signal){
      if(id==='source')return tray(document,signal,{all:true});
      if(id!=='page')return tray(document,signal,{space:id});
      const visible=document.page.layers.some(node=>!node.isParked&&!node.hidden&&!node.isHidden);
      if(!visible)return null;
      const {png}=await renderOfflinePNG(document.page,source,images,canvas,{decodedCache});
      return {imageURL:await modelImage(png),signature:hash(png),items:document.page.layers.filter(node=>!node.isParked).map(node=>node.id)};
    },
    async render(document,signal,spaces=[{id:'page'},{id:'tray'}]){
      signal?.throwIfAborted();
      const started=performance.now(),{png,report}=await renderOfflinePNG(document.page,source,images,canvas,{decodedCache});
      signal?.throwIfAborted();
      const pngHash=hash(png),sceneRevision=creationSceneRevision(document);lastRendered={png,revision:sceneRevision};
      const sampleEdge=32,thumbnail=canvas.createCanvas(sampleEdge,sampleEdge),thumbnailContext=thumbnail.getContext('2d');
      thumbnailContext.drawImage(await canvas.loadImage(png),0,0,sampleEdge,sampleEdge);
      const pixels=thumbnailContext.getImageData(0,0,sampleEdge,sampleEdge).data,visualSample=Buffer.alloc(sampleEdge*sampleEdge*3);
      for(let i=0,j=0;i<pixels.length;i+=4){visualSample[j++]=pixels[i];visualSample[j++]=pixels[i+1];visualSample[j++]=pixels[i+2];}
      const artifact=await saveArtifact({png,pngHash,sceneRevision,document,report});
      const views=await Promise.all(spaces.filter(space=>space.id!=='page').map(async space=>({id:space.id,...await tray(document,signal,{space:space.id})})));
      const pageNodes=document.page.layers.filter(node=>!node.isParked&&!node.hidden&&!node.isHidden);
      const pageSignature=pngHash;
      const pageImageURL=await modelImage(png);
      const spaceViews=[{id:'page',imageURL:pageNodes.length?pageImageURL:null,signature:pageSignature,items:pageNodes.map(node=>node.id)},...views.map(view=>({id:view.id,imageURL:view.imageURL||null,signature:view.signature||'empty',items:view.items||[],parkedIDs:view.parkedIDs||[]}))];
      return {pngHash,sceneRevision,artifact,imageURL:pageImageURL,spaceViews,visualSample:visualSample.toString('base64'),renderMs:Math.round(performance.now()-started),renderer:report.rendererBackend};
    }
  };
}
