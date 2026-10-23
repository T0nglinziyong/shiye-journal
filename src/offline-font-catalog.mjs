import {journalFontCandidates,DEFAULT_TEXT_PRESET} from './journal-fonts.js';
import {execFileSync} from 'node:child_process';
import {existsSync} from 'node:fs';
import {resolve} from 'node:path';
export function offlineFontCatalog(){
 const bundledHandFont=existsSync(resolve(process.cwd(),'fonts/MaShanZheng-Regular.ttf'));
 const result={defaultPreset:DEFAULT_TEXT_PRESET,presets:['hand','serif','rounded','sans'],recommended:{},families:[],discovery:'unavailable',bundledHandFont,note:'fontPreset 是字体族偏好，不保证各机器拥有相同字体。fontFamily 需实际可用；未列出不代表下载授权。当前包内 Ma Shan Zheng 可由 Node Canvas 和离线 Chromium 使用；其他字体依赖运行环境。'};
 try{const names=execFileSync('fc-list',['--format=%{family}\n'],{encoding:'utf8',timeout:3000,maxBuffer:1_000_000}).split(/[,\n]/).map(s=>s.trim()).filter(Boolean);result.families=[...new Set(names)].sort().slice(0,256);result.discovery='fontconfig';for(const [preset,names] of Object.entries(journalFontCandidates))result.recommended[preset]=names.find(name=>result.families.some(f=>f.toLowerCase()===name.toLowerCase()))||null;result.artisticFontAvailable=!!result.recommended.hand;}catch{}
 if(bundledHandFont){result.recommended.hand='Ma Shan Zheng';result.artisticFontAvailable=true;}
 return result;
}
