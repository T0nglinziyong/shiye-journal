import {useEffect,useRef} from 'react';

// The application update gate and beforeunload handler share this registry.
// It contains only form labels, never the user's values or image bytes.
const pending=new Map();
export function pendingUnsavedInputs(){return [...pending.values()];}
export function useUnsavedInput(label,dirty){
  const token=useRef(null);
  if(!token.current)token.current=Symbol(label);
  useEffect(()=>{
    if(dirty)pending.set(token.current,label);
    else pending.delete(token.current);
    return ()=>pending.delete(token.current);
  },[label,dirty]);
}
