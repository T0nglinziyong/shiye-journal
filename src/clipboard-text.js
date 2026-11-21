export async function readClipboardText(clipboard){
  if(clipboard?.readText){
    try{const value=await clipboard.readText();if(value?.trim())return value;}
    catch{/* Some mobile browsers expose readText but permit read instead. */}
  }
  if(clipboard?.read){
    const items=await clipboard.read();
    for(const item of items){
      if(!item.types?.includes('text/plain'))continue;
      const value=await (await item.getType('text/plain')).text();
      if(value?.trim())return value;
    }
  }
  throw Error('剪贴板没有可读取的文本或浏览器拒绝了读取权限');
}
