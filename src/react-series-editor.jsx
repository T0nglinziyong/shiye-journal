import {SeriesArtwork} from './react-series-artwork.jsx';
import {seriesCoverModes,seriesCoverMode} from './series-cover-layout.js';
import React,{useRef,useState} from 'react';
import {useUnsavedInput} from './unsaved-inputs.js';

export function SeriesEditorDialog({series,members,assets,source,onClose,onSave,onError,defaultCoverLayout='auto'}){
  const [title,setTitle]=useState(series?.title||''),[about,setAbout]=useState(series?.introduction||''),
    [styles,setStyles]=useState((series?.styleTags||[]).join('、')),
    [semantics,setSemantics]=useState((series?.semanticTags||[]).join('、')),
    [automatic,setAutomatic]=useState(series?.coverAssetIDs==null),
    [coverLayout,setCoverLayout]=useState(seriesCoverMode(series?.coverLayout??defaultCoverLayout)),
    [layoutModified,setLayoutModified]=useState(false),
    [chosen,setChosen]=useState(()=>series?.coverAssetIDs?.filter(id=>members.some(asset=>asset.id===id))||[]),
    [busy,setBusy]=useState(false),[error,setError]=useState('');
  const formState=JSON.stringify({title,about,styles,semantics,automatic,chosen,coverLayout});
  const initial=useRef(formState);
  useUnsavedInput('系列信息',formState!==initial.current);
  const choose=id=>{
    setAutomatic(false);
    if(chosen.includes(id))setChosen(chosen.filter(item=>item!==id));
    else setChosen([...chosen,id]);
  };
  const save=async()=>{
    if(busy)return;
    if(!title.trim()){setError('请填写系列名称');return;}
    setBusy(true);setError('');
    try{await onSave({title:title.trim(),introduction:about.trim(),styleTags:styles,
      semanticTags:semantics,coverLayout:layoutModified||series?.coverLayout!=null?coverLayout:null,
      coverAssetIDs:automatic?null:[...chosen],
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
        <h3>系列封面</h3><p>整齐摆放最多显示九件；自由叠放可以使用全部素材。</p>
        <button type="button" className="btn" id="series-auto-cover" onClick={()=>{
          setAutomatic(true);setChosen(members.map(asset=>asset.id));
        }}>使用自动封面</button>
        <label>封面排版<select id="series-cover-layout" aria-label="系列封面排版" value={coverLayout} onChange={event=>{setCoverLayout(event.target.value);setLayoutModified(true);}}>{seriesCoverModes.map(([id,label])=><option key={id} value={id}>{label}</option>)}</select></label>
        <div className="series-editor-cover"><SeriesArtwork members={automatic?members:chosen.map(id=>members.find(a=>a.id===id)).filter(Boolean)} mode={coverLayout} source={source} priority/></div>
        <p id="series-cover-state">{automatic?`自动封面 · ${members.length} 件`:`已选择 ${chosen.length} 件`}{coverLayout==='grid'&&(automatic?members.length:chosen.length)>9?' · 当前排版显示前九件':''}</p>
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
