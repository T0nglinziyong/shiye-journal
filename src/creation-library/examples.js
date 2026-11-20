export const exampleMaterials=[
 {id:'example-photo',alias:'m1',title:'示意照片',kind:'photo',role:'focal',physicalWidthMM:28,physicalHeightMM:38,supply:{quantity:1}},
 {id:'example-card',alias:'m2',title:'示意卡片',kind:'card',role:'secondary',physicalWidthMM:22,physicalHeightMM:26,supply:{quantity:1}},
 {id:'example-paper',alias:'m3',title:'示意图案纸',kind:'paper',role:'background',physicalWidthMM:42,physicalHeightMM:32,supply:{quantity:1}},
 {id:'example-tape',alias:'m4',title:'示意胶带',kind:'tape',role:'connector',physicalWidthMM:100,physicalHeightMM:6,tapeAxis:'horizontal',supply:{quantity:1}}
];
export function techniqueExample(method){
 const p={id:'demo',at:[72,88]},before=[];
 if(method.recipe==='title')p.text='收集小美好';
 if(method.recipe==='materials'){p.aliases=['m1','m2','m3'];if(method.defaults.captionPosition)p.caption='一片颜色，一段小记。';}
 if(method.recipe==='tape')p.aliases=['m4'];
 if(method.recipe==='record')p.items=['留下一片颜色','写下一句短记','收好今天的小物'];
 if(['relate','tear','window','split'].includes(method.recipe)){
  delete p.at;p.target='paper';before.push({op:'material.add',id:'paper',asset:'m3',place:{reference:'page',at:[70,80],unit:'mm'}});
  if(method.recipe==='relate'){p.referenceTarget='card';before.push({op:'material.add',id:'card',asset:'m2',place:{reference:'page',at:[70,80],unit:'mm'}});}
  if(method.recipe==='tear')p.path={points:[[0,.4],[.3,.5],[.7,.35],[1,.5]],unit:'ratio'};
  if(method.recipe==='window')p.box=[.2,.2,.6,.6];
 }
 return {parameters:p,before};
}
