// Small editable fallbacks for template sticker slots when the user's basket
// has no suitable figure. They represent the slot's visual role, not a crop
// taken from the reference photograph.
const head=(dx=0)=>[
 {d:`M ${dx+10} 36 L ${dx+15} 12 L ${dx+34} 24 Q ${dx+50} 16 ${dx+66} 24 L ${dx+85} 12 L ${dx+90} 36 Q ${dx+97} 58 ${dx+84} 77 Q ${dx+72} 91 ${dx+50} 91 Q ${dx+28} 91 ${dx+16} 77 Q ${dx+3} 58 ${dx+10} 36 Z`,style:{fill:'#FFFCF3',stroke:'#202A2E'}},
 {d:`M ${dx+33} 51 A 3 3 0 1 1 ${dx+39} 51 A 3 3 0 1 1 ${dx+33} 51 M ${dx+61} 51 A 3 3 0 1 1 ${dx+67} 51 A 3 3 0 1 1 ${dx+61} 51`,style:{fill:'#202A2E',stroke:'#202A2E'}},
 {d:`M ${dx+46} 65 L ${dx+54} 65 L ${dx+50} 70 Z M ${dx+50} 70 Q ${dx+43} 78 ${dx+38} 72 M ${dx+50} 70 Q ${dx+57} 78 ${dx+62} 72`,style:{fill:'#202A2E',stroke:'#202A2E'}}
];
const coffee=[
 {d:'M 12 80 Q 50 91 88 80 Q 81 88 50 90 Q 19 88 12 80 Z',style:{fill:'#DFC6A5',stroke:'#6F5C50'}},
 {d:'M 19 34 L 73 34 L 68 73 Q 50 83 27 73 Z',style:{fill:'#FFF5DF',stroke:'#6F5C50'}},
 {d:'M 74 41 Q 96 35 92 56 Q 91 69 69 64',style:{fill:null,stroke:'#6F5C50'}},
 {d:'M 20 34 A 27 8 0 1 1 74 34 A 27 8 0 1 1 20 34',style:{fill:'#A36D4B',stroke:'#6F5C50'}}
];
const bottle=[
 {d:'M 34 8 L 66 8 L 66 22 L 72 30 L 76 42 L 76 85 Q 76 94 65 95 L 35 95 Q 24 94 24 85 L 24 42 L 28 30 L 34 22 Z',style:{fill:'#E7A5B7',stroke:'#845263'}},
 {d:'M 35 14 L 65 14 M 31 48 Q 50 40 69 48 L 69 73 Q 50 82 31 73 Z',style:{fill:'#F7D9DF',stroke:'#845263'}},
 {d:'M 42 57 Q 50 50 58 57 Q 50 70 42 57 Z',style:{fill:'#B66F84',stroke:'#B66F84'}}
];
const teddy=[
 {d:'M 18 24 A 12 12 0 1 1 42 24 A 12 12 0 1 1 18 24 M 58 24 A 12 12 0 1 1 82 24 A 12 12 0 1 1 58 24',style:{fill:'#5264A3',stroke:'#263B79'}},
 {d:'M 22 52 Q 19 23 50 20 Q 81 23 78 52 Q 79 73 50 76 Q 21 73 22 52 Z',style:{fill:'#5C74B8',stroke:'#263B79'}},
 {d:'M 23 68 Q 6 65 10 80 Q 17 90 32 80 M 77 68 Q 94 65 90 80 Q 83 90 68 80 M 32 72 Q 29 94 43 92 L 47 78 M 68 72 Q 71 94 57 92 L 53 78',style:{fill:'#5264A3',stroke:'#263B79'}},
 {d:'M 36 48 A 3 3 0 1 1 42 48 A 3 3 0 1 1 36 48 M 58 48 A 3 3 0 1 1 64 48 A 3 3 0 1 1 58 48 M 46 57 Q 50 53 54 57 Q 50 63 46 57 Z',style:{fill:'#F5EAD9',stroke:'#F5EAD9'}}
];
const ghost=(dx,fill,face)=>[
 {d:`M ${dx+7} 76 L ${dx+11} 35 Q ${dx+14} 12 ${dx+45} 11 Q ${dx+77} 12 ${dx+80} 36 L ${dx+86} 80 Q ${dx+73} 72 ${dx+67} 84 Q ${dx+58} 75 ${dx+49} 85 Q ${dx+39} 76 ${dx+30} 84 Q ${dx+20} 73 ${dx+7} 76 Z`,style:{fill,stroke:'#202A2E'}},
 {d:`M ${dx+28} 42 A 3 4 0 1 1 ${dx+34} 42 A 3 4 0 1 1 ${dx+28} 42 M ${dx+55} 42 A 3 4 0 1 1 ${dx+61} 42 A 3 4 0 1 1 ${dx+55} 42 M ${dx+39} 61 Q ${dx+46} ${face} ${dx+54} 61`,style:{fill:fill==='#202A2E'?'#FFFDF7':'#202A2E',stroke:fill==='#202A2E'?'#FFFDF7':'#202A2E'}}
];
export function templateStickerGeometry(motif){
 if(motif==='doodle-animal')return {kind:'path',viewBox:[0,0,100,100],paths:head()};
 if(motif==='doodle-pair')return {kind:'path',viewBox:[0,0,200,100],paths:[...head(0),...head(100)]};
 if(motif==='doodle-ghost-pair')return {kind:'path',viewBox:[0,0,200,100],paths:[...ghost(0,'#202A2E',54),...ghost(100,'#FFFDF7',54)]};
 if(motif==='coffee-cup')return {kind:'path',viewBox:[0,0,100,100],paths:coffee};
 if(motif==='milk-bottle')return {kind:'path',viewBox:[0,0,100,100],paths:bottle};
 if(motif==='teddy-bear')return {kind:'path',viewBox:[0,0,100,100],paths:teddy};
 throw new RangeError(`未知模板贴纸图样：${motif}`);
}
