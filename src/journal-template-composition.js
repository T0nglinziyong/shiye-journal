const labels=[
  ['纸片',/纸片|卡纸|便签|底纸|底块|书写纸|色纸|纸带|标签/],
  ['主图',/主图|主照片|主体图|大图|大幅|核心图/],
  ['次图',/次图|小图|照片|图片|图块|图框|图像/],
  ['文字',/标题|文字|正文|短字|手写|书写|字条|注释|编号|日期|清单|短记|日记/],
  ['装饰',/装饰|点缀|圆片|贴纸|胶带|细线|曲线|箭头|色块/],
  ['布局关系',/串联|呼应|错层|对齐|交替|穿插|分组|阅读|连接|留白/]
];

export function journalTemplateComposition(template){
  return String(template.structure||'').split(/[，；。]/).map(text=>text.trim())
    .filter(text=>text.length>=3).slice(0,12).map((text,index)=>({
      id:`part-${index+1}`,label:labels.map(([label,pattern])=>({label,at:text.search(pattern)}))
        .filter(match=>match.at>=0).sort((a,b)=>a.at-b.at)[0]?.label||'构成',text
    }));
}
