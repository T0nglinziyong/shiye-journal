const valid=value=>Number.isSafeInteger(value)&&value>=0;
export function creativeElapsed(ms){
 const seconds=Math.max(0,Math.floor((Number(ms)||0)/1000));
 return `${Math.floor(seconds/60)}分${seconds%60}秒`;
}
export function creativeTokenText(usage){
 if(!valid(usage?.inputTokens)||!valid(usage?.outputTokens))return '';
 const reused=valid(usage.reusedTokens)?usage.reusedTokens:0;
 const number=value=>value.toLocaleString('zh-CN');
 return `token输入${number(Math.max(0,usage.inputTokens-reused))}，复用${number(reused)}，输出${number(usage.outputTokens)}`;
}

export function creativeCompleteProgress(usage,elapsedMs=usage?.totalMs??usage?.elapsedMs){
 const rounds=valid(usage?.turns)?`${usage.turns}轮，`:'';
 const tokens=creativeTokenText(usage);
 return `创作完成，累计，${rounds}用时${creativeElapsed(elapsedMs)}${tokens?'，'+tokens:''}。点击方案继续编辑。`;
}
