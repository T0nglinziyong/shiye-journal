import {journalFontCandidates,DEFAULT_TEXT_PRESET} from './journal-fonts.js';
import {execFileSync} from 'node:child_process';
import {existsSync} from 'node:fs';
import {resolve} from 'node:path';

export function summarizeFontCatalog(names,{bundledHandFont=false,full=false,discovery='fontconfig'}={}){
 const families=[...new Set([...names,...(bundledHandFont?['Ma Shan Zheng']:[])])].sort();
 const recommended=Object.fromEntries(Object.entries(journalFontCandidates).map(([preset,candidates])=>[preset,
  candidates.map(candidate=>families.find(name=>name.toLowerCase()===candidate.toLowerCase())).find(Boolean)||null]));
 if(bundledHandFont)recommended.hand='Ma Shan Zheng';
 return {defaultPreset:DEFAULT_TEXT_PRESET,presets:['hand','serif','rounded','sans'],recommended,
  families:full?families:[...new Set(Object.values(recommended).filter(Boolean))],totalFamilies:families.length,
  discovery,bundledHandFont,artisticFontAvailable:!!recommended.hand,
  note:'fontPreset 是字体族偏好，不保证跨环境一致，也不保证每个字都有字形。'+(bundledHandFont?'包内 Ma Shan Zheng 可供 Node Canvas 和离线 Chromium 使用。':'本目录未发现随包手写字体。')+'其他字体依赖运行环境，列表不代表下载授权。',
  ...(!full?{fullHelp:'fonts --full：查看所有已发现字体；默认只列本机可用的各预设首选。'}:{})};
}
export function offlineFontCatalog({full=false}={}){
 const bundledHandFont=existsSync(resolve(process.cwd(),'fonts/MaShanZheng-Regular.ttf'));
 let names=[],discovery='unavailable';
 try{names=execFileSync('fc-list',['--format=%{family}\n'],{encoding:'utf8',timeout:3000,maxBuffer:1_000_000}).split(/[,\n]/).map(s=>s.trim()).filter(Boolean);discovery='fontconfig';}catch{}
 return summarizeFontCatalog(names,{bundledHandFont,full,discovery});
}
