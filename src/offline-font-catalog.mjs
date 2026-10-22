import {execFileSync} from 'node:child_process';
export function offlineFontCatalog(){
 const result={presets:['serif','sans','rounded','hand'],families:[],discovery:'unavailable',note:'fontPreset 是字体族偏好，不保证各机器拥有相同字体。fontFamily 需实际可用；未列出不代表下载授权。字体文件不随作品交付。'};
 try{const names=execFileSync('fc-list',['--format=%{family}\n'],{encoding:'utf8',timeout:3000,maxBuffer:1_000_000}).split(/[,\n]/).map(s=>s.trim()).filter(Boolean);result.families=[...new Set(names)].sort().slice(0,256);result.discovery='fontconfig';}catch{}
 return result;
}
