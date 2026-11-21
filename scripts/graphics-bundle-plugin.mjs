export function headlessPaper(){return {name:'headless-paper',setup(builder){
 builder.onResolve({filter:/^\.\/node\/self\.js$/},()=>({path:'paper-self',namespace:'headless-paper'}));
 builder.onResolve({filter:/^\.\/node\/extend\.js$/},()=>({path:'paper-extend',namespace:'headless-paper'}));
 builder.onLoad({filter:/.*/,namespace:'headless-paper'},({path})=>({contents:path==='paper-self'?"module.exports={navigator:{userAgent:'ShiyeGeometry/1'}};":"module.exports=function(){};",loader:'js'}));
}};}
