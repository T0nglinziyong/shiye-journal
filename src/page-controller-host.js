import {ComponentLifetime} from './ui-component-lifecycle.js';
// A page controller owns its view projection and transient DOM resources.
// Business state is always provided from outside; controllers can later be
// replaced by React/Vue mounts without changing their Action/State protocol.
export function createPageControllerHost(){
  const definitions=new Map();
  let active=null;
  return {
    register(name,controller){
      if(definitions.has(name))throw Error('页面控制器已注册: '+name);
      if(typeof controller.render!=='function')throw Error('页面控制器缺少 render: '+name);
      definitions.set(name,controller);
      return controller;
    },
    has:name=>definitions.has(name),
    render(name){return definitions.get(name)?.render();},
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
