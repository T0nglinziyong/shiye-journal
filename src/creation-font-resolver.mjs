// Node-only capability injected into the shared reducer. No font bytes are
// persisted, copied to the creation package, or sent over the network.
import {execFileSync} from 'node:child_process';
import {readFileSync,statSync} from 'node:fs';
import {glyphCutGeometry} from './craft-glyphs.js';
export function localGlyphOutline(text,style){
 const family=style.fontFamily;
 if(typeof family!=='string'||family.length>120||!family.trim()||/^[-]|[:=]/.test(family)||/[\\/\n\r\0]/.test(family))throw Error('字体名无效');
 let output;
 try{output=execFileSync('fc-match',['--format=%{family}\n%{file}',family],{encoding:'utf8',timeout:5000,maxBuffer:65536});}
 catch{throw Object.assign(Error('本机字体发现不可用；请提供 region 字形轮廓或安装所需字体环境'),{code:'FONT_UNAVAILABLE'});}
 const [matched,path]=output.split('\n');
 if(!matched.split(',').some(name=>name.trim().toLowerCase()===family.trim().toLowerCase()))throw Object.assign(Error('没有找到指定字体：'+family),{code:'FONT_UNAVAILABLE'});
 if(!path||statSync(path).size>16_000_000)throw Error('字体路径不可读或超过解析预算');
 try{return glyphCutGeometry(new Uint8Array(readFileSync(path)),text,{fontSizeMM:style.fontSizePt*25.4/72}).geometryMM;}
 catch(error){throw Object.assign(Error('无法从指定字体提取字形：'+error.message),{code:error.code||'FONT_PARSE_FAILED'});}
}
