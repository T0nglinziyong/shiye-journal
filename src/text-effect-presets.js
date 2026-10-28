// Presets compile to the SAME public style values used by AI Commands.
export const textEffectPresets=[['plain','原色'],['outline','描边'],['offset','错位轮廓'],['gradient','渐变'],['gradient-outline','渐变描边'],['shadow','投影']];
export function textEffectStyle(id,color='#35516A'){
 const clear={outline:null,gradient:null,shadow:null};
 if(id==='plain')return clear;
 if(id==='outline')return {...clear,outline:{color:'#FFFFFF',widthMm:.5,offsetMm:[0,0]}};
 if(id==='offset')return {...clear,outline:{color:'#738BA4',widthMm:.45,offsetMm:[.65,.65]}};
 if(id==='shadow')return {...clear,shadow:{color:'#B6B4C8',offsetMm:[.65,.65],blurMm:.4}};
 if(['gradient','gradient-outline'].includes(id))return {...clear,gradient:{angleDeg:90,stops:[{offset:0,color:'#D49B7D'},{offset:1,color}]},...(id==='gradient-outline'?{outline:{color:'#FFFFFF',widthMm:.45,offsetMm:[0,0]}}:{})};
 throw Error('未知文字效果');
}
