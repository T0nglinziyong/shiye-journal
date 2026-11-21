import {ComponentLifetime} from './ui-component-lifecycle.js';
// A page controller owns transient route resources. React owns the view;
// business state transitions remain independent of the route mount.
export function createPageControllerHost(){
  const definitions=new Map();
  let active=null;
  return {
    register(name,controller){
      if(definitions.has(name))throw Error('页面控制器已注册: '+name);
      if(!controller||typeof controller!=='object')throw Error('页面控制器无效: '+name);
      definitions.set(name,controller);
      return controller;
    },
    has:name=>definitions.has(name),
    patch(name){
      if(active?.name!==name)return false;
      return definitions.get(name)?.patch?.()===true;
    },
    mount(name){
      if(active)throw Error('必须先卸载旧页面');
      const controller=definitions.get(name);
      if(!controller)return;
      const lifetime=new ComponentLifetime();
      active={name,controller,lifetime};
      try{
        const cleanup=controller.mount?.(lifetime);
        if(typeof cleanup==='function')lifetime.use(cleanup);
      }catch(error){active=null;lifetime.dispose();throw error;}
    },
    dispose(){
      if(!active)return;
      const previous=active;active=null;
      previous.lifetime.dispose();
      previous.controller.dispose?.();
    },
    getActive:()=>active?.name||null
  };
}
