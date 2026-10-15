import React from 'react';

const steps=[['rough','修补轮廓'],['recognition','边缘优化'],['final','调整外观']];
function Toggle({id,label,description,checked,onChange}){
  return <label className="toggle-row setting-toggle"><span><b>{label}</b><small className="setting-help">{description}</small></span>
    <input id={id} type="checkbox" checked={!!checked} onChange={event=>onChange(event.target.checked)}/></label>;
}
function MaskTools({state,actions,note,extra}){
  return <div className="cutout-mask-tools"><div className="cutout-tabs two">
    <button type="button" data-repair="restore" className={state.restore?'selected':''} onClick={()=>actions.repair(true)}>补回</button>
    <button type="button" data-repair="erase" className={!state.restore?'selected':''} onClick={()=>actions.repair(false)}>擦除</button></div>
    <label>笔宽 · 短边的 <b id="brush-value">{Math.round(state.ratio*100)}%</b>
      <input id="cutout-strength" type="range" min="0.5" max="20" step="0.5" value={state.ratio*100}
        onChange={event=>actions.ratio(Number(event.target.value)/100)}/></label>
    <div className="cutout-brush-actions"><button type="button" id="cutout-undo" disabled={!state.history||state.busy} onClick={actions.undo}>↶ 撤销</button>
      <button type="button" id="cutout-refine" disabled={!state.lastStroke||state.busy} onClick={actions.refine}>细化涂抹</button></div>
    <details className="cutout-advanced cutout-mask-help"><summary>修补说明及恢复选项</summary>
      <small className="setting-help">{note}</small>{extra}</details>
  </div>;
}
export function CutoutPanel({state,actions,canvasRef}){
  const index=steps.findIndex(([id])=>id===state.mode);
  const common={state,actions};
  return <div className="material-editor cutout-modal"><header>
    <button type="button" id="cutout-cancel" disabled={state.busy} onClick={actions.cancel}>取消</button>
    <strong>检查抠图</strong><button type="button" id="cutout-apply" disabled={state.busy||state.mode!=='final'} onClick={actions.apply}>应用</button>
  </header>
  <div className="cutout-compare">{[['original','按住看原图'],['initial','按住看原抠图']].map(([kind,label])=><button type="button" key={kind} id={`compare-${kind}`}
    onPointerDown={event=>{if(state.busy)return;event.preventDefault();event.currentTarget.setPointerCapture(event.pointerId);actions.compare(kind);}}
    onPointerUp={()=>actions.compare(null)} onPointerCancel={()=>actions.compare(null)}
    onKeyDown={event=>{if([' ','Enter'].includes(event.key)){event.preventDefault();actions.compare(kind);}}}
    onKeyUp={()=>actions.compare(null)}>{label}</button>)}</div>
  <div className="material-editor-preview cutout-preview"><canvas id="cutout-canvas" ref={canvasRef} aria-label="素材抠图预览"/></div><div className="cutout-steps">{steps.map(([id,label],at)=><span key={id} data-cut-step={id}
    className={at===index?'current':at<index?'passed':''}><b>{at+1}</b>{label}</span>)}</div>
  <p className="cutout-hint">轻按画面修补边缘；长按上方按钮可对比原图。</p>
  <section className="cutout-controls"><div id="cutout-mode-panel">
    {state.mode==='rough'?<div className="stack"><h3>手动修补边缘</h3>
      <MaskTools {...common} note="这里的涂抹只作为重新识别的初始范围；主算法可以继续向真实物理边缘扩张或收缩。"
        extra={<div className="form-grid"><button type="button" id="cutout-rough-enter" onClick={actions.restoreEntry}>恢复进入时 mask</button>
          <button type="button" id="cutout-rough-original" disabled={state.busy} onClick={actions.restoreRecognition}>恢复原始识别 mask</button></div>}/>
      <details className="cutout-advanced"><summary>重新识别设置</summary>
        <label>识别方法<select id="cutout-method" value={state.recognition.method} onChange={event=>actions.recognition('method',event.target.value)}>
          {state.methods.map(item=><option key={item.id} value={item.id}>{item.label}</option>)}</select>
          <small id="cutout-method-help" className="setting-help">{state.methodDescription}</small></label>
        <label>处理像素<select id="cutout-pixels" value={state.recognition.pixels} onChange={event=>actions.recognition('pixels',Number(event.target.value))}>
          {state.pixels.map(([value,label])=><option key={value} value={value}>{label}</option>)}</select>
          <small className="setting-help">只影响这一次重新识别，不修改全局设置。</small></label>
        <h3>识别预处理</h3>
        <Toggle id="cutout-pre-light" label="光照场校正" description="补偿候选框内的渐变照明和阴影。" checked={state.recognition.preprocess.illumination} onChange={value=>actions.preprocess('illumination',value)}/>
        <Toggle id="cutout-pre-denoise" label="轻度去噪" description="减少噪点和 JPEG 纹理对边界的干扰。" checked={state.recognition.preprocess.denoise} onChange={value=>actions.preprocess('denoise',value)}/>
        <Toggle id="cutout-pre-contrast" label="局部对比增强" description="轻量增强浅色边缘，不修改最终保存颜色。" checked={state.recognition.preprocess.localContrast} onChange={value=>actions.preprocess('localContrast',value)}/>
        <Toggle id="cutout-pre-chroma" label="Lab 色差边缘增强" description="对绿白、浅色载体更有帮助，只作为边缘证据。" checked={state.recognition.preprocess.chromaEdges} onChange={value=>actions.preprocess('chromaEdges',value)}/>
      </details><button type="button" className="btn primary" id="cutout-rerecognize" disabled={state.busy||!state.canRerecognize} onClick={actions.rerecognize}>重新识别轮廓</button>
    </div>:state.mode==='recognition'?<div className="stack"><h3>检查边缘</h3>
      <MaskTools {...common} note="先手动修正主算法输出，再把当前 mask 送入后处理；后处理不会回到修正前的版本。"
        extra={<button type="button" id="cutout-recognition-base" onClick={actions.restoreRecognitionBase}>恢复刚识别结果</button>}/>
      <details className="cutout-advanced"><summary>边缘后处理选项</summary>
        <Toggle id="cutout-post-shapes" label="形状规整" description="只在真实边缘证据足够强时，把规则纸片收成更干净的直边、圆弧或多边形；自由异形保持原轮廓。" checked={state.post.shapeRegularization} onChange={value=>actions.post('shapeRegularization',value)}/>
        <Toggle id="cutout-post-apertures" label="重复打孔恢复" description="只恢复成排、等半径、近等间距且中心接近 A4 纸色的制造型孔；孤立白点不会挖空。" checked={state.post.apertures} onChange={value=>actions.post('apertures',value)}/>
      </details><button type="button" className="btn primary" id="cutout-postprocess" disabled={state.busy||!state.canPostprocess} onClick={actions.postprocess}>自动优化边缘</button>
    </div>:<div className="stack"><h3>最后调整</h3>
      <MaskTools {...common} note="这是最终人工边界。此后颜色和角度调整都不会再改变 mask。"
        extra={<button type="button" id="cutout-final-base" onClick={actions.restoreFinalBase}>恢复后处理结果</button>}/>
      <details className="cutout-advanced"><summary>角度与摆正</summary>
        <Toggle id="cutout-auto-straighten" label="自动摆正" description="根据最终 mask 估计素材主方向；只旋转输出，不改变透明边界。" checked={state.autoStraighten} onChange={actions.autoStraighten}/>
        <label>显示角度 <b id="rotation-value">{state.rotation.toFixed(1)}°</b><input id="cutout-angle" type="range" min="-180" max="180" step=".1" value={state.rotation} onChange={event=>actions.angle(Number(event.target.value))}/></label>
        <div className="form-grid"><button type="button" id="cutout-left" onClick={()=>actions.rotate(-90)}>左转90°</button><button type="button" id="cutout-rotate" onClick={()=>actions.rotate(90)}>右转90°</button></div>
        <button type="button" id="cutout-align" onClick={actions.align}>重新按最终边缘摆正</button><button type="button" id="cutout-original-direction" onClick={actions.originalDirection}>恢复原方向</button>
      </details><h3>颜色</h3><div className="cutout-tabs">{[['original','原色'],['natural','自然增强'],['vivid','鲜明展示']].map(([id,label])=><button type="button" key={id} data-appearance={id} className={state.appearance===id?'selected':''} onClick={()=>actions.appearance(id)}>{label}</button>)}</div>
      <label>增强强度 <b id="appearance-value">{Math.round(state.intensity*100)}%</b><input id="cutout-intensity" type="range" min="0" max="100" value={state.intensity*100} disabled={state.appearance==='original'} onChange={event=>actions.intensity(Number(event.target.value)/100)}/></label>
    </div>}
  </div><p id="cutout-note" role="status">{state.note}</p>
  <div className="cutout-step-nav"><button type="button" className="btn" id="cutout-prev" disabled={state.busy||index===0} onClick={actions.previous}>上一步</button>
    <button type="button" className="btn primary" id="cutout-next" disabled={state.busy} onClick={actions.next}>{index===steps.length-1?'应用当前结果':'下一步'}</button></div>
  <details className="cutout-advanced cutout-reset-settings"><summary>更多操作</summary><button type="button" className="btn" id="cutout-reset" disabled={state.busy} onClick={actions.reset}>恢复进入时的状态</button></details>
  </section></div>;
}
