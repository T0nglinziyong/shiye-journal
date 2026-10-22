import {textEffectInsets,textContentWidth,validateTextEffects} from './text-effects.js';
// One deterministic measurement policy for editable geometry. Rendering may
// measure glyphs with its real font backend; no estimated result claims pixel
// parity across machines. textLines is also used by the Canvas renderer.
import {textLines} from './editor-tools-model.js';
export function measureSceneText(node,measure){
 validateTextEffects(node);
 const padding=textEffectInsets(node);
 if(!(node.width>padding.left+padding.right))throw Error('文字描边占满宽度；增大文字框或减小描边/偏移');
 const width=measure||((text)=>Array.from(text).reduce((sum,ch)=>sum+node.fontSize*(/[\u0000-\u00ff]/u.test(ch)?.65:1)+(node.letterSpacing||0),0));
 const curve=node.curveHeight||0;
 if(curve&&String(node.content).includes('\n'))throw Error('曲线文字只支持单行');
 const layout=textLines(node,width);
 const height=curve?node.fontSize*1.6+Math.abs(curve):Math.max(node.fontSize*1.6,layout.height);
 return {...layout,height:height+padding.top+padding.bottom,width:Math.max(0,...layout.lines.map(line=>width(line.text)))+padding.left+padding.right,unwrappedWidth:width(String(node.content)),measurement:measure?'font-backend':'deterministic-estimate'};
}
export function reflowSceneText(node,{minimumHeight,lineHeightRatio}={},measure){
 if(node.type!=='text')return node;
 const state={minimumHeight:0,...node.textLayout};
 if(minimumHeight!==undefined)state.minimumHeight=minimumHeight;
 if(lineHeightRatio!==undefined)state.lineHeightRatio=lineHeightRatio;
 if(state.lineHeightRatio!==undefined)node.fixedLineHeight=node.fontSize*state.lineHeightRatio;
 const metrics=measureSceneText(node,measure);
 if(node.curveHeight&&metrics.unwrappedWidth>textContentWidth(node)+1e-7)throw Error('曲线文字超出宽度；加宽 size.width 或使用 text.fit');
 node.textLayout=state;node.height=Math.max(state.minimumHeight,metrics.height);return node;
}
