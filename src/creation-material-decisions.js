import {sceneLayerEntries} from './scene-v2.js';

const choices=new Set(['intact','crafted','omitted']);
const cropped=rect=>Boolean(rect&&(
  Math.abs((rect.x??0))>1e-6||Math.abs((rect.y??0))>1e-6||Math.abs((rect.width??1)-1)>1e-6||Math.abs((rect.height??1)-1)>1e-6));
const processed=item=>Boolean(item.tapeStrip||item.materialMask||item.vectorMask||item.craftDisplaySlices?.length||item.materialRelation||item.isFlippedHorizontally||
  (item.cropZoom??1)!==1||(item.cropOffsetX??0)!==0||(item.cropOffsetY??0)!==0||cropped(item.cropRect)||item.cropSteps?.some(cropped)||
  item.materialSteps?.some(step=>step.op!=='whole')||item.operation&&item.operation.op!=='whole');

// An explanation is useful only when it describes the material that was
// actually placed. This checks observable facts, never an aesthetic quota.
export function validateMaterialDecisions(decisions,draft,source){
  if(!Array.isArray(decisions)){
    throw Error('请在 scene.json 的 materialDecisions 中逐件记录素材取舍');
  }
  const materials=source.materials||[];
  if(decisions.length!==materials.length)throw Error('materialDecisions 必须对本次每件候选素材各记录一次取舍');
  const known=new Set(materials.map(item=>item.alias));
  const ids=new Map(materials.map(item=>[item.alias,item.assetID]));
  const actual=new Map();
  for(const {kind,value,parents} of sceneLayerEntries(draft,{hidden:true})){
    if(kind!=='material'||value.hidden||value.isHidden||value.isParked||value.parked||(value.opacity??1)<=0||parents.some(p=>p.hidden||p.isHidden||p.isParked||p.parked||(p.opacity??1)<=0))continue;
    const entries=actual.get(value.assetID)||[];entries.push(value);actual.set(value.assetID,entries);
  }
  const seen=new Set();
  for(const item of decisions){
    if(!item||typeof item!=='object'||Array.isArray(item)||Object.keys(item).some(key=>!['asset','choice','reason'].includes(key)))throw Error('materialDecisions 条目格式无效');
    if(!known.has(item.asset)||seen.has(item.asset))throw Error('materialDecisions 素材别名缺失、重复或不在本次任务内');
    seen.add(item.asset);
    if(!choices.has(item.choice)||typeof item.reason!=='string'||item.reason.trim().length<8||item.reason.length>240)throw Error('materialDecisions 需要有效取舍和简短具体的理由');
    const placed=actual.get(ids.get(item.asset))||[];
    if(item.choice==='omitted'&&placed.length||item.choice!=='omitted'&&!placed.length)throw Error(`素材 ${item.asset} 的取舍与实际可见图层不一致`);
    if(item.choice==='intact'&&placed.some(processed)||item.choice==='crafted'&&!placed.some(processed))throw Error(`素材 ${item.asset} 的加工声明与实际图层不一致`);
  }
  return decisions;
}
