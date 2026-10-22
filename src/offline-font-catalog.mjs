import {DEFAULT_TEXT_PRESET,textFontPresets} from './text-font-presets.js';
import {execFileSync} from 'node:child_process';
export function offlineFontCatalog(){
 const result={defaultPreset:DEFAULT_TEXT_PRESET,recommendations:[],presets:['serif','sans','rounded','hand'],families:[],discovery:'unavailable',note:'fontPreset 是字体族偏好，不保证各机器拥有相同字体。fontFamily 需实际可用；未列出不代表下载授权。字体文件不随作品交付。'};
 try{const names=execFileSync('fc-list',['--format=%{family}\n'],{encoding:'utf8',timeout:3000,maxBuffer:1_000_000}).split(/[,\n]/).map(s=>s.trim()).filter(Boolean);result.families=[...new Set(names)].sort().slice(0,256);result.discovery='fontconfig';}catch{}
 result.recommendations=textFontPresets.map(p=>({preset:p.id,label:p.label,installed:result.families.filter(name=>p.families.some(family=>family.toLowerCase()===name.toLowerCase()))}));
 result.note+=' 新文字默认艺术手写；App 可用 Ma Shan Zheng。离线仅使用本机字体，未安装时按同类字体退让，不能声称字形完全相同，不打包字体。';
 return result;
}
