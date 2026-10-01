import {itemFromAsset} from './domain.js';

// These are starting arrangements, not flattened images. Every placed material
// retains its measured size and remains an independent canvas object.
const templates=[
  {id:'story',title:'图文叙事',description:'主素材带出阅读路线，侧边留给可编辑文字。',anchors:[[.35,.32],[.72,.24],[.7,.65],[.3,.76],[.52,.5]],purposes:['日常记录','旅途记录','影像故事'],styles:['摄影叙事','胶片日记','手写日记','留白叙事'],kinds:['photo','paper']},
  {id:'collection',title:'收藏网格',description:'按实物尺寸分组，适合图文收藏与清单。',anchors:[[.27,.3],[.73,.3],[.27,.71],[.73,.71],[.5,.5]],purposes:['图文收藏','清单计划'],styles:['杂志网格','杂志编辑','日系文具','清单手帐'],kinds:['paper','photo','reference']},
  {id:'collage',title:'手作错层',description:'用不对称的素材关系建立轻快的拼贴节奏。',anchors:[[.43,.4],[.73,.22],[.2,.72],[.76,.75],[.2,.22]],purposes:['日常记录','旅途记录','图文收藏'],styles:['美式拼贴','复古旧物','混合媒材','密集拼贴','手作便签'],kinds:['sticker','tape','paper']},
  {id:'cover',title:'留白封面',description:'一件主素材做焦点，其余素材安放在边角。',anchors:[[.5,.48],[.22,.2],[.78,.8],[.78,.2],[.22,.8]],purposes:['主题封面'],styles:['极简留白','韩系清新','自然植物','留白叙事'],kinds:['sticker','photo']}
];

const area=asset=>(asset.physicalWidthMM||0)*(asset.physicalHeightMM||0);
export function manualLayoutChoices({assets=[],basket=[],styles=[],purposes=[]}={}){
  const selected=basket.map(id=>assets.find(asset=>asset.id===id)).filter(Boolean);
  return templates.map(template=>{
    const purpose=purposes.filter(value=>template.purposes.includes(value));
    const style=styles.filter(value=>template.styles.includes(value));
    const kinds=selected.filter(asset=>template.kinds.includes(asset.kind));
    const score=purpose.length*5+style.length*3+Math.min(2,kinds.length);
    const reason=[purpose[0]&&`适合${purpose[0]}`,style[0]&&`呼应${style[0]}`,kinds.length&&`匹配${kinds.length}件素材`].filter(Boolean).join(' · ')||'可作为自由排版起点';
    return {...template,score,reason};
  }).sort((a,b)=>b.score-a.score||templates.findIndex(item=>item.id===a.id)-templates.findIndex(item=>item.id===b.id));
}

function positions(template){
  const points=[...template.anchors];
  for(let row=0;row<9;row++)for(let col=0;col<7;col++)points.push([(.5+col)/7,(.5+row)/9]);
  return points;
}
function fits(item,placed,draft){
  const margin=Math.min(draft.canvas.width,draft.canvas.height)*.012;
  if(item.x-item.width/2<margin||item.x+item.width/2>draft.canvas.width-margin||item.y-item.height/2<margin||item.y+item.height/2>draft.canvas.height-margin)return false;
  return placed.every(other=>Math.abs(item.x-other.x)>=(item.width+other.width)/2+margin||Math.abs(item.y-other.y)>=(item.height+other.height)/2+margin);
}
export function applyManualLayout(draft,assets,basket,templateID){
  const template=templates.find(item=>item.id===templateID);if(!template)throw Error('请选择有效的手动排版模板');
  const selected=basket.map(id=>assets.find(asset=>asset.id===id)).filter(Boolean);
  const focus=selected.filter(asset=>asset.kind==='photo'||asset.kind==='paper').sort((a,b)=>area(b)-area(a))[0]||[...selected].sort((a,b)=>area(b)-area(a))[0];
  const ordered=focus?[focus,...selected.filter(asset=>asset!==focus)]:selected;
  const placed=[];
  for(const asset of ordered){
    if(!(asset.physicalWidthMM>0&&asset.physicalHeightMM>0))continue;
    const item=itemFromAsset(asset,draft,0,0,10+placed.length,true);
    const match=positions(template).find(([x,y])=>{item.x=x*draft.canvas.width;item.y=y*draft.canvas.height;return fits(item,placed,draft);});
    if(!match)continue;
    item.generationBaseline={...item.generationBaseline,x:item.x,y:item.y};
    placed.push(item);
  }
  draft.items=placed;
  draft.paperPattern=template.id==='collection'?'grid':template.id==='story'?'lines':'plain';
  return {placed:placed.length,remaining:selected.length-placed.length,template:template.title};
}
