// Dimensions are millimetres per single sheet, in portrait orientation.
// The non-ISO journal formats come from the user's size comparison chart;
// actual inserts may vary by maker, so a measured custom size remains available.
export const paperPresets=Object.freeze([
  {id:'a4',name:'A4',width:210,height:297,group:'常用纸张'},
  {id:'a5',name:'A5',width:148,height:210,group:'常用纸张'},
  {id:'a6',name:'A6',width:105,height:148,group:'常用纸张'},
  {id:'b5',name:'B5（ISO）',width:176,height:250,group:'常用纸张'},
  {id:'b5-jis',name:'B5（手帐常用）',width:182,height:257,group:'大中尺寸'},
  {id:'b5-half',name:'B5 Half',width:91,height:257,group:'大中尺寸'},
  {id:'a5-slim',name:'A5 Slim / PUO / TN',width:110,height:210,group:'大中尺寸'},
  {id:'b6',name:'B6',width:125,height:176,group:'大中尺寸'},
  {id:'hb-wa5',name:'方方子 / HB×WA5',width:148,height:171,group:'大中尺寸'},
  {id:'pw',name:'PW',width:120,height:171,group:'活页与长条'},
  {id:'fc',name:'FC',width:108,height:171,group:'活页与长条'},
  {id:'personal',name:'Personal',width:95,height:171,group:'活页与长条'},
  {id:'a6-slim',name:'A6 Slim',width:80,height:171,group:'活页与长条'},
  {id:'slim-80x148',name:'Slim 80×148',width:80,height:148,group:'活页与长条'},
  {id:'tn-pocket',name:'TN 随身本',width:95,height:165,group:'活页与长条'},
  {id:'weeks',name:'Weeks',width:95,height:188,group:'活页与长条'},
  {id:'b7',name:'B7',width:86,height:128,group:'迷你尺寸'},
  {id:'tn-passport',name:'TN 护照本',width:88,height:125,group:'迷你尺寸'},
  {id:'a7-tall',name:'A7 加高',width:80,height:127,group:'迷你尺寸'},
  {id:'a7',name:'A7',width:80,height:120,group:'迷你尺寸'},
  {id:'a7-wide',name:'A7 大纸',width:85,height:127,group:'迷你尺寸'},
  {id:'a8-m5-80',name:'A8 / M5 宽 80',width:80,height:105,group:'迷你尺寸'},
  {id:'a8-m5-74',name:'A8 / M5 宽 74',width:74,height:105,group:'迷你尺寸'},
  {id:'a8-m5-67',name:'A8 / M5 宽 67',width:67,height:105,group:'迷你尺寸'},
  {id:'a8-m5-62',name:'A8 / M5 宽 62',width:62,height:105,group:'迷你尺寸'},
  {id:'m2-5',name:'M2.5',width:42,height:105,group:'迷你尺寸'},
  {id:'a9',name:'A9',width:60,height:80,group:'迷你尺寸'}
]);

const byId=new Map(paperPresets.map(({id,...size})=>[id,Object.freeze({id,...size})]));
export function paperPreset(id){return byId.get(id)||null;}
export function paperDimensions(id){
  const preset=paperPreset(id);
  if(preset)return {width:preset.width,height:preset.height};
  const match=/^custom:(\d{2,4})x(\d{2,4})$/.exec(id||'');
  if(!match)return null;
  const width=Number(match[1]),height=Number(match[2]);
  return width>=50&&width<=1000&&height>=50&&height<=1000?{width,height}:null;
}
export function paperSizeOptions(selected,{includeNone=false,includeCustom=true}={}){
  const current=String(selected||'');
  let html=includeNone?`<option value="none" ${current==='none'?'selected':''}>无背景板</option>`:'';
  let group='';
  for(const preset of paperPresets){
    if(preset.group!==group){if(group)html+='</optgroup>';group=preset.group;html+=`<optgroup label="${group}">`;}
    html+=`<option value="${preset.id}" ${current===preset.id?'selected':''}>${preset.name} · ${preset.width} × ${preset.height} mm</option>`;
  }
  if(group)html+='</optgroup>';
  if(includeCustom)html+=`<option value="custom" ${current==='custom'||current.startsWith('custom:')?'selected':''}>自定义尺寸</option>`;
  return html;
}
