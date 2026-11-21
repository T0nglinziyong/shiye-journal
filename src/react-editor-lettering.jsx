import React,{useState} from 'react';
import './editor-lettering.css';
import {letteringEditorState} from './editor-lettering.js';
import {letteringCharacters} from './scene-lettering.js';
const fonts=[['hand','手写'],['serif','宋体'],['sans','黑体'],['rounded','圆体']];
export function NewLetteringForm({page,defaults,onCreate}){
 const [content,setContent]=useState(''),[font,setFont]=useState(defaults?.style||'hand'),[error,setError]=useState('');
 const [size,setSize]=useState(Number(((defaults?.fontSize||40)*page.physicalPageHeightMM/page.canvas.height*72/25.4).toFixed(1)));
 return <form className="stack lettering-controls" onSubmit={e=>{e.preventDefault();try{letteringCharacters(content);setError('');onCreate({content,style:{fontPreset:font,fontSizePt:size,color:defaults?.color||'#30463d'}});}catch(error){setError(error.message);}}}>
  <label>标题文字<input value={content} maxLength={128} placeholder="例如：脑内电台" onChange={e=>setContent(e.target.value)} required/></label>
  <small>适合 1–32 个字的短标题。创建后可整体改字、重排，也能单独编辑每个字。</small>
  <div className="form-grid"><label>标题字体<select value={font} onChange={e=>setFont(e.target.value)}>{fonts.map(([id,name])=><option key={id} value={id}>{name}</option>)}</select></label>
  </div><label className="lettering-slider">标题大小<input aria-label="标题大小" type="range" value={size} min={6} max={Math.max(72,size)} step={1} onChange={e=>setSize(Number(e.target.value))}/><span className="lettering-range-hints"><span>小一点</span><span>大一点</span></span></label>
  {error?<p role="alert">{error}</p>:null}<button type="submit" className="btn primary" disabled={!content.trim()}>创建艺术标题</button>
 </form>;
}
export function EditorLetteringPanel({page,nodeID,onAction}){
 let initial;try{initial=letteringEditorState(page,nodeID);}catch(e){return <p role="status">{e.message}</p>;}
 // Remount only after a committed Scene change, not for each keystroke.
 return <details><summary>艺术标题排版</summary><LetteringForm key={JSON.stringify(initial)} initial={initial} onApply={change=>onAction('fabric-inspector-lettering',change)}/></details>;
}
function LetteringForm({initial,onApply}){
 const [content,setContent]=useState(initial.content),[gap,setGap]=useState(initial.gapMm),[font,setFont]=useState('');
 const [size,setSize]=useState(''),[color,setColor]=useState('#30463d'),[uniformColor,setUniformColor]=useState(false),[error,setError]=useState('');
 const [selected,setSelected]=useState(0),[letters,setLetters]=useState(initial.letters),[changed,setChanged]=useState([]);
 const current=letters[selected];
 const update=(field,value)=>{setLetters(rows=>rows.map((row,i)=>i===selected?{...row,[field]:value}:row));setChanged(ids=>ids.includes(selected)?ids:[...ids,selected]);};
 const apply=()=>{
  let count;try{count=letteringCharacters(content).length;setError('');}catch(error){setError(error.message);return;}
  const change={};if(content!==initial.content)change.content=content;if(gap!==initial.gapMm)change.gapMm=gap;
  const style={};if(font)style.fontPreset=font;if(size!=='')style.fontSizePt=Number(size);if(uniformColor)style.color=color;
  if(Object.keys(style).length)change.style=style;
  if(changed.length)change.letters=changed.filter(index=>index<count).map(index=>({index,rotationDeg:letters[index].rotationDeg,offsetMm:letters[index].offsetMm}));
  if(Object.keys(change).length)onApply(change);
 };
 return <div className="stack lettering-controls">
  <label>整段标题<input maxLength={128} value={content} onChange={e=>setContent(e.target.value)}/></label>
  <label className="lettering-slider">字距<input type="range" min={0} max={Math.max(6,initial.gapMm,gap)} step={.1} value={gap} onChange={e=>setGap(Number(e.target.value))}/><span className="lettering-range-hints"><span>紧凑</span><span>宽松</span></span></label>
  <label>统一字体<select value={font} onChange={e=>setFont(e.target.value)}><option value="">保持各字字体</option>{fonts.map(([id,name])=><option key={id} value={id}>{name}</option>)}</select></label>
  <label className="lettering-slider">统一大小<input type="range" min={6} max={Math.max(72,initial.fontSizePt,Number(size))} step={1} value={size===''?initial.fontSizePt:size} onChange={e=>setSize(e.target.value)}/><span className="lettering-range-hints"><span>小一点</span><span>大一点</span></span></label>
  {size!==''?<button type="button" className="btn mini" onClick={()=>setSize('')}>保留原来各字的大小</button>:null}
  <label className="editor-inspector-check"><input type="checkbox" checked={uniformColor} onChange={e=>setUniformColor(e.target.checked)}/>统一文字颜色</label>
  {uniformColor?<label>标题颜色<input type="color" value={color} onChange={e=>setColor(e.target.value)}/></label>:null}
  {content===initial.content?<>
   <small>点选一个字，调整它的位置</small>
   <div className="lettering-letter-picker" role="group" aria-label="选择要调整的字">{letters.map((n,i)=><button type="button" key={n.id} aria-label={`调整第 ${i+1} 字：${n.content}`} aria-pressed={selected===i} onClick={()=>setSelected(i)}>{n.content===' '?'␣':n.content}</button>)}</div>
   <div className="lettering-nudge" role="group" aria-label="移动选中的字">{[['左移',0,-.5,'←'],['上移',1,-.5,'↑'],['下移',1,.5,'↓'],['右移',0,.5,'→']].map(([name,axis,delta,glyph])=><button type="button" className="btn mini" key={name} aria-label={name} onClick={()=>{const p=[...current.offsetMm];p[axis]+=delta;update('offsetMm',p);}}>{glyph}</button>)}<button type="button" className="btn mini" onClick={()=>{update('offsetMm',[0,0]);update('rotationDeg',0);}}>摆正</button></div>
   <label className="lettering-slider">倾斜<input type="range" min={Math.min(-30,current.rotationDeg)} max={Math.max(30,current.rotationDeg)} step={1} value={current.rotationDeg} onChange={e=>update('rotationDeg',Number(e.target.value))}/><span className="lettering-range-hints"><span>左倾</span><span>右倾</span></span></label>
  </>:<small>先应用新标题，再调整新字位。</small>}
  <details><summary>精细调整</summary><div className="stack">
   <label>字间距（mm）<input type="number" min={0} max={20} step={.1} value={gap} onChange={e=>setGap(Number(e.target.value))}/></label>
   <label>统一字号（pt）<input type="number" min={1} max={400} step={.1} placeholder="留空保留各字大小" value={size} onChange={e=>setSize(e.target.value)}/></label>
   {content===initial.content?<><div className="form-grid">{['X','Y'].map((axis,i)=><label key={axis}>字位偏移 {axis}（mm）<input type="number" min={-100} max={100} step={.1} value={Number(current.offsetMm[i].toFixed(2))} onChange={e=>{const p=[...current.offsetMm];p[i]=Number(e.target.value);update('offsetMm',p);}}/></label>)}</div>
    <label>字位旋转（°）<input type="number" min={-180} max={180} step={1} value={current.rotationDeg} onChange={e=>update('rotationDeg',Number(e.target.value))}/></label></>:null}
  </div></details>
  <small>改字和字距会保留各字样式；颜色、描边等细节可在下方进入单字编辑。</small>
  {error?<p role="alert">{error}</p>:null}<button type="button" className="btn primary" disabled={!content.trim()} onClick={apply}>应用标题排版</button>
 </div>;
}
