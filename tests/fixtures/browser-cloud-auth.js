// Opens the local editor in the browser suite's fresh, isolated IndexedDB.
export async function startCloudSession(onReady){
  const showApp=()=>{document.querySelector('#auth-root').hidden=true;document.querySelector('#app').hidden=false;};
  await onReady(undefined,{onFirstView:showApp});
  showApp();
}
