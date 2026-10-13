// Framework-neutral command/state store. Pure state transitions never know
// about DOM or persistence: subscribers decide which view projection changes.
// Legacy side-effect commands can be migrated a route at a time.
export function createActionStore(state){
  const handlers=new Map(),listeners=new Set();
  let revision=0,batching=0,events=[];
  const publish=(type,{scope='global',keys=[],ids=[],origin='local',payload=null}={})=>{
    const event=Object.freeze({type,scope,keys:Object.freeze([...keys]),
      ids:Object.freeze([...ids]),origin,payload,revision:++revision});
    if(batching)events.push(event);
    else for(const listener of [...listeners])listener(event,state);
    return event;
  };
  return Object.freeze({
    getState:()=>state,
    getRevision:()=>revision,
    register(type,handler){
      if(handlers.has(type))throw Error('重复注册 Action: '+type);
      handlers.set(type,handler);
      return ()=>{if(handlers.get(type)===handler)handlers.delete(type);};
    },
    subscribe(listener,{scope}={}){
      const wrapped=scope?e=>{if(e.scope===scope||e.scope==='global')listener(e,state);}:listener;
      listeners.add(wrapped);return ()=>listeners.delete(wrapped);
    },
    async dispatch(action){
      if(!action||typeof action.type!=='string')throw Error('Action 缺少 type');
      const handler=handlers.get(action.type);
      if(!handler)throw Error('未注册的 Action: '+action.type);
      const outcome=await handler(action.payload||{},state,action);
      if(outcome?.changes){
        Object.assign(state,outcome.changes);
        publish(action.type,{scope:outcome.scope||'global',
          keys:Object.keys(outcome.changes),ids:outcome.ids||[],payload:action.payload});
      }else if(outcome?.notify){
        publish(action.type,{scope:outcome.scope||'global',keys:outcome.keys||[],
          ids:outcome.ids||[],payload:action.payload});
      }
      return outcome?.result;
    },
    publish,
    batch(fn){
      batching++;
      try{return fn();}
      finally{
        batching--;
        if(!batching){const pending=events;events=[];for(const event of pending)
          for(const listener of [...listeners])listener(event,state);}
      }
    }
  });
}
