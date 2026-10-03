import {readFileSync,mkdirSync,writeFileSync,statSync} from 'node:fs';
import {glyphCutGeometry} from './craft-glyphs.js';
try{
 const [fontPath,text,size='12',bridges='[]']=process.argv.slice(2);
 if(!fontPath||!text)throw Error('用法：node runtime/glyphs.cjs 本地字体路径 文字 字号毫米 可选连接桥JSON');
 if(statSync(fontPath).size>16_000_000)throw Error('字体超过16 MB处理上限');
 const result=glyphCutGeometry(new Uint8Array(readFileSync(fontPath)),text,{fontSizeMM:Number(size),bridges:JSON.parse(bridges)});
 mkdirSync('output',{recursive:true});writeFileSync('output/glyph-geometry.json',JSON.stringify(result,null,2)+'\n');
 console.log('已写出 output/glyph-geometry.json，仅含数值路径。使用 cut_shape/remove/geometry 可制作镂空，不复制字体文件。');
}catch(error){process.stderr.write(String(error.message||error)+'\n');process.exitCode=1;}
