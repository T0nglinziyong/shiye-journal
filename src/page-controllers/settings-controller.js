export function createSettingsController({
  actions,render
}){
  return {
    mount(lifetime){
      lifetime.use(actions.subscribe(event=>{
        if(event.scope==='settings')render();
      },{scope:'settings'}));
    }
  };
}
export function registerSettingsActions(actions,{providers}){
  actions.register('settings/provider',({previous,next})=>{
    const preset=providers[next];
    if(!preset)throw Error('不支持的 AI 服务商');
    return {changes:{aiSettings:{
      ...previous,provider:next,endpoint:preset.endpoint,
      model:preset.models[0]?.[0]||'',
      keys:{...previous.keys,[previous.provider]:previous.key},
      key:previous.keys?.[next]||'',
      includeThumbnails:preset.models[0]?.[2]===true
    }},scope:'settings'};
  });
  actions.register('settings/section',({section})=>({
    changes:{settingsSection:section||null},scope:'settings'
  }));
}
