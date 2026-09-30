export const styleGroups=[
  {id:'mood',label:'色彩与氛围',options:['韩系清新','美式拼贴','复古旧物','日系文具','自然植物','童趣插画','可爱插画','自定义风格']},
  {id:'layout',label:'版式与密度',options:['极简留白','留白叙事','密集拼贴','杂志网格','自由构图']},
  {id:'medium',label:'表现方式',options:['杂志编辑','旅行票据','摄影叙事','手写日记','胶片日记','混合媒材','清单手帐','手作便签']}
];
export const purposeGroups=[
  {id:'story',label:'记录内容',options:['日常记录','旅途记录','影像故事']},
  {id:'page',label:'页面任务',options:['图文收藏','清单计划','主题封面']}
];
export function selectedDirections(groups,values=[]){const selected=new Set(values);return groups.map(group=>group.options.find(name=>selected.has(name))).filter(Boolean);}
