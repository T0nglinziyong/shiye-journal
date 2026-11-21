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
export function registerSettingsActions(actions){
  actions.register('settings/section',({section})=>({
    changes:{settingsSection:section||null},scope:'settings'
  }));
}
