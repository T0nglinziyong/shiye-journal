export function mainSection(route,importMode='material'){
  if(['series','library','assetDetail'].includes(route))return 'library';
  if(['works','projectPreview','editor','templates','trash'].includes(route))return 'works';
  if(route==='import')return importMode==='work'?'works':'library';
  return route==='matching'?'matching':null;
}

// A tab remembers its own nested pages. Browser history remains available for
// hardware Back, while in-app Back never jumps into a different main tab.
export function createMainNavigation(){
  const locations=new Map(),stacks=new Map();
  return {
    visit(snapshot,nextRoute,{back=false,replaceHistory=false,importMode='material'}={}){
      const section=mainSection(snapshot.route,importMode),target=mainSection(nextRoute,importMode);
      if(!section)return;
      locations.set(section,structuredClone(snapshot));
      if(!back&&!replaceHistory&&section===target&&nextRoute!==snapshot.route){
        const stack=stacks.get(section)||[];
        stack.push(structuredClone(snapshot));
        if(stack.length>24)stack.shift();
        stacks.set(section,stack);
      }
    },
    record(snapshot,importMode='material'){
      const section=mainSection(snapshot.route,importMode);
      if(section)locations.set(section,structuredClone(snapshot));
    },
    last(section,valid=()=>true){
      const snapshot=locations.get(section);
      return snapshot&&valid(snapshot)?structuredClone(snapshot):null;
    },
    back(section,valid=()=>true){
      const stack=stacks.get(section)||[];
      while(stack.length){const snapshot=stack.pop();if(valid(snapshot))return snapshot;}
      return null;
    },
    reset(){locations.clear();stacks.clear();}
  };
}
