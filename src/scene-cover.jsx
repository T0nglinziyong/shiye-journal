import React,{useEffect,useState} from 'react';

// A work cover is the 480px Canvas 2D rendering of its saved Scene. The
// editor's interactive Fabric canvas is never used as the thumbnail source.
export function SceneCover({draft,source,priority=false,localCover='',projectID=null}){
  const [,refresh]=useState(0),[error,setError]=useState(''),[failedRemote,setFailedRemote]=useState(''),
    [loadedCover,setLoadedCover]=useState('');
  useEffect(()=>{
    if(!projectID)return;
    const update=event=>{
      if(event.detail?.projectID!==projectID)return;
      if(event.detail.error)setError(event.detail.error);
      refresh(value=>value+1);
    };
    window.addEventListener('shiye-react-cover-update',update);
    return ()=>window.removeEventListener('shiye-react-cover-update',update);
  },[projectID]);
  if(!draft)return null;
  const direct=draft.coverImageID||draft.coverBlobId;
  const remote=direct?source(direct):'';
  const local=typeof localCover==='function'?localCover():localCover;
  // The private-image loader uses a transparent one-pixel SVG while its COS
  // request is pending. It must never hide an already rendered local cover.
  const cached=remote&&!remote.startsWith('data:image/svg+xml,')&&failedRemote!==remote?remote:local;
  if(cached)return <img className="work-reference" loading={priority?'eager':'lazy'}
    fetchPriority={priority?'high':undefined} decoding="async" src={cached} alt="作品完整封面"
    onError={()=>{if(cached!==remote)return;setFailedRemote(remote);
      window.dispatchEvent(new CustomEvent('shiye-work-cover-failed',{detail:{projectID}}));}}/>;
  // Keep the placeholder image mounted: the private-image loader discovers
  // image nodes, then replaces their SVG source with the saved cloud cover.
  if(remote&&failedRemote!==remote)return <>
    <img className="work-reference" loading={priority?'eager':'lazy'}
      fetchPriority={priority?'high':undefined} decoding="async" src={remote} alt="作品完整封面"
      onLoad={event=>{const img=event.currentTarget;
        if(img.naturalWidth>1&&!img.currentSrc.includes('#shiye-image='))setLoadedCover(direct);}}
      onError={()=>{setFailedRemote(remote);
        window.dispatchEvent(new CustomEvent('shiye-work-cover-failed',{detail:{projectID}}));}}/>
    {loadedCover!==direct?<span className="work-cover-pending" role="status">{error||'正在准备预览…'}</span>:null}
  </>;
  return <span className="work-cover-pending" role="status">{error||'正在准备预览…'}</span>;
}
