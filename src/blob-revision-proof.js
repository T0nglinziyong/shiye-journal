// A global account revision does not mean every immutable image changed.
// Only a fully verified delta (or our own acknowledged CAS commit) can prove
// that a cached blob record remained valid across a revision transition.
export function createBlobRevisionProof({limit=64}={}){
  const steps=new Map();
  return {
    accept(before,after,{blobIDs=[],allBlobs=false}={}){
      if(!Number.isSafeInteger(before)||!Number.isSafeInteger(after)||after<=before)return;
      steps.set(before,{after,changed:new Set(blobIDs),allBlobs});
      while(steps.size>limit)steps.delete(steps.keys().next().value);
    },
    valid(id,from,to){
      if(!Number.isSafeInteger(from)||!Number.isSafeInteger(to)||from>to)return false;
      let cursor=from;
      for(let count=0;cursor<to&&count<steps.size;count++){
        const step=steps.get(cursor);
        if(!step||step.after>to||step.allBlobs||step.changed.has(id))return false;
        cursor=step.after;
      }
      return cursor===to;
    },
    clear(){steps.clear();}
  };
}
