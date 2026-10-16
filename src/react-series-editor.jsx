import React,{useRef,useState} from 'react';
import {seriesCovers} from './library-model.js';
import {useUnsavedInput} from './unsaved-inputs.js';

export function SeriesEditorDialog({series,members,assets,source,onClose,onSave,onError}){
  const [title,setTitle]=useState(series?.title||''),[about,setAbout]=useState(series?.introduction||''),
    [styles,setStyles]=useState((series?.styleTags||[]).join('、')),
    [semantics,setSemantics]=useState((series?.semanticTags||[]).join('、')),
    [automatic,setAutomatic]=useState(series?.coverAssetIDs==null),
    [chosen,setChosen]=useState(()=>series?seriesCovers(series,assets).map(asset=>asset.id):[]),
    [busy,setBusy]=useState(false),[error,setError]=useState('');
  const formState=JSON.stringify({title,about,styles,semantics,automatic,chosen});
  const initial=useRef(formState);
  useUnsavedInput('系列信息',formState!==initial.current);
  const choose=id=>{
    setAutomatic(false);
    if(chosen.includes(id))setChosen(chosen.filter(item=>item!==id));
    else if(chosen.length<5)setChosen([...chosen,id]);
    else onError?.('封面最多选择 5 件素材');
  };
  const save=async()=>{
    if(busy)return;
    if(!title.trim()){setError('请填写系列名称');return;}
    setBusy(true);setError('');
    try{await onSave({title:title.trim(),introduction:about.trim(),styleTags:styles,
      semanticTags:semantics,coverAssetIDs:automatic?null:[...chosen],
      coverAssetID:automatic?null:chosen[0]||null});onClose();}
    catch(cause){setError(cause.message||'保存失败');}
    finally{setBusy(false);}
  };
  return <div className="cloud-admin-backdrop" onMouseDown={event=>{
    if(event.target===event.currentTarget)onClose();}}>
    <section className="cloud-admin-panel series-editor-dialog" role="dialog" aria-modal="true"
      aria-label={series?'编辑系列':'新建系列'}>
      <div className="dialog-head"><h2>{series?'编辑系列':'新建系列'}</h2>
        <button type="button" className="btn" id="series-cancel" onClick={onClose}>取消</button></div>
      <div className="stack"><label>系列名称<input id="series-name" value={title}
        onChange={event=>setTitle(event.target.value)}/></label>
        <label>系列介绍<textarea id="series-about" value={about}
          onChange={event=>setAbout(event.target.value)}/></label>
        <label>风格标签<input id="series-style-tags" value={styles}
          onChange={event=>setStyles(event.target.value)}/></label>
        <label>内容标签<input id="series-semantic-tags" value={semantics}
          onChange={event=>setSemantics(event.target.value)}/></label>
        <p>用逗号分隔多个标签，搜索系列时也能找到它们。</p>
        <h3>系列封面</h3><p>最多选择 5 件素材，共同组成封面。</p>
        <button type="button" className="btn" id="series-auto-cover" onClick={()=>{
          setAutomatic(true);setChosen(members.slice(0,3).map(asset=>asset.id));
        }}>使用自动封面（前 3 件）</button>
        <p id="series-cover-state">{automatic?'自动封面':`已选择 ${chosen.length} / 5`}</p>
        <div className="mini-assets cover-picker">{members.map(asset=><button type="button"
          className={`mini-asset ${chosen.includes(asset.id)?'selected':''}`} key={asset.id}
          data-cover={asset.id} aria-pressed={chosen.includes(asset.id)} onClick={()=>choose(asset.id)}>
          {source(asset.blobId)||asset.staticPath?<img src={source(asset.blobId)||asset.staticPath}
            data-asset-image-id={asset.id} alt={asset.title}/>:<span>无预览</span>}
          <span>{asset.title}</span>
        </button>)}</div>
        {!members.length?<p>先向系列添加素材，再选择封面。</p>:null}
        <p id="series-error" role="alert">{error}</p>
        <button type="button" className="btn primary" id="series-save" disabled={busy}
          onClick={()=>void save()}>保存系列</button>
      </div>
    </section>
  </div>;
}
