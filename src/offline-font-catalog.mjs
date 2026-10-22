import {journalFontCandidates,DEFAULT_TEXT_PRESET} from './journal-fonts.js';
import {execFileSync} from 'node:child_process';
export function offlineFontCatalog(){
 const result={defaultPreset:DEFAULT_TEXT_PRESET,presets:['hand','serif','rounded','sans'],recommended:{},families:[],discovery:'unavailable',note:'fontPreset 是字体族偏好，不保证各机器拥有相同字体。fontFamily 需实际可用；未列出不代表下载授权。默认艺术手写；网页使用 Ma Shan Zheng，离线运行若 recommended.hand 为空则需安装或明确选择可用字体，不能把后备字体冒称同款艺术字。字体文件不随作品交付。'};
 try{const names=execFileSync('fc-list',['--format=%{family}\n'],{encoding:'utf8',timeout:3000,maxBuffer:1_000_000}).split(/[,\n]/).map(s=>s.trim()).filter(Boolean);result.families=[...new Set(names)].sort().slice(0,256);result.discovery='fontconfig';for(const [preset,names] of Object.entries(journalFontCandidates))result.recommended[preset]=names.find(name=>result.families.some(f=>f.toLowerCase()===name.toLowerCase()))||null;result.artisticFontAvailable=!!result.recommended.hand;}catch{}
 return result;
}
