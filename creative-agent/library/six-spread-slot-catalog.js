// A slot describes what a piece does in the composition. The photographed
// subject is a preference, not the definition of the slot. All geometry and
// occlusion remain in six-spread-template-graphs.json.
const roleCatalog={
 'ruled-background':{purpose:'页面底层的横线纸面',mode:'generated',roles:[]},
 'large-scene-photo':{purpose:'承载本页视觉重量的大画面',mode:'material',roles:['photo','writing-card','printed-card']},
 'large-irregular-photo':{purpose:'贯穿页面的大面积主体',mode:'material',roles:['photo','figure','writing-card']},
 'small-scene-photo':{purpose:'与大画面形成远近关系的小画面',mode:'material',roles:['photo','printed-card','figure']},
 'irregular-photo':{purpose:'保留完整轮廓的主角画面',mode:'material',roles:['photo','figure','printed-card']},
 'scene-photo':{purpose:'内容画面与文字区域的视觉焦点',mode:'material',roles:['photo','printed-card','figure']},
 'small-scene-card':{purpose:'小幅主题卡片或照片',mode:'material',roles:['photo','printed-card','writing-card','figure']},
 'square-scene-card':{purpose:'上方或侧边的方形主题画面',mode:'material',roles:['photo','printed-card','writing-card']},
 'large-irregular-flower':{purpose:'压住纸边的完整不规则主体',mode:'material',roles:['figure','photo']},
 'small-irregular-flower':{purpose:'边缘的不规则小主体',mode:'material',roles:['figure','photo']},
 'irregular-subject':{purpose:'盖住卡纸边缘的完整主体',mode:'material',roles:['figure','photo','printed-card']},
 'body-on-background':{purpose:'直接写在背景上的正文',mode:'text',roles:[]},
 'body-on-photo':{purpose:'与主题画面共用空间的正文',mode:'text',roles:[]},
 'body-on-card':{purpose:'写在卡纸可读区域的正文',mode:'text',roles:[]},
 'micro-heading':{purpose:'轻量分段标题',mode:'text',roles:[]},
 'micro-typography':{purpose:'小号辅助文字',mode:'text',roles:[]},
 'large-date-text':{purpose:'参与构图的大数字',mode:'text-or-number',roles:['number','numeral']},
 'horizontal-lace':{purpose:'跨接两块区域的细长连接件',mode:'material-or-generated',roles:['tape','strip']},
 'vertical-connector':{purpose:'纵向连接并建立节奏的条带',mode:'material-or-generated',roles:['tape','strip','pattern-paper']},
 'edge-accent':{purpose:'连接纸边、稳定重心的点缀',mode:'material-or-generated',roles:['accent','figure']},
 'support-paper':{purpose:'托住主体的底层卡纸',mode:'material-or-generated',roles:['plain-paper','pattern-paper','writing-card']},
 'support-card':{purpose:'托住上层对象的卡纸',mode:'material-or-generated',roles:['plain-paper','pattern-paper','writing-card']},
 'backing-paper':{purpose:'从主画面侧边露出的底层纸',mode:'material-or-generated',roles:['plain-paper','pattern-paper','writing-card']},
 'translucent-backing-paper':{purpose:'半透明的底层纸',mode:'material-or-generated',roles:['vellum','translucent-paper']},
 'translucent-paper':{purpose:'透出下层图案的硫酸纸',mode:'material-or-generated',roles:['vellum','translucent-paper']},
 'light-writing-card':{purpose:'浅色书写纸面',mode:'material-or-generated',roles:['writing-card','plain-paper']},
 'torn-writing-card':{purpose:'有自然纸边的书写纸面',mode:'material-or-generated',roles:['writing-card','plain-paper']},
 'large-writing-card':{purpose:'占主要阅读面积的大书写纸',mode:'material-or-generated',roles:['writing-card','plain-paper']},
 'small-heading-card':{purpose:'容纳短标题的标签卡',mode:'material-or-generated',roles:['writing-card','plain-paper','printed-card']},
 'date-card':{purpose:'日期或数字的支撑卡',mode:'material-or-generated',roles:['writing-card','plain-paper','printed-card']},
 'large-date-badge':{purpose:'参与构图的大日期徽章',mode:'material-or-generated',roles:['number','numeral']},
 'micro-label':{purpose:'小字标签',mode:'material-or-generated',roles:['printed-card','writing-card','plain-paper']},
 'pattern-note':{purpose:'带图案的小便签',mode:'material-or-generated',roles:['writing-card','pattern-paper','printed-card']},
 'irregular-label':{purpose:'叠在主题画面上的异形标签',mode:'material-or-generated',roles:['accent','printed-card']}
};
const purposeById={
 'S01-苹果绿白':{'L-apple-photo':'左页承载主叙事的水果或日常照片／可写卡','L-blue-heading':'压在照片左上部的蓝色标题条','L-date':'左页右下方日期块','R-lime-back':'右页上方照片背后的亮色纸','R-black-photo':'右页上方对比照片','R-pale-card':'右页下方被果篮压住的浅色纸','R-fruit-basket':'跨越浅色纸边缘的完整主体'},
 'S02-青黄面包':{'L-bread-photo':'左页大幅暖色主画面，可以是面包或其他温暖的日常主体','L-date':'压住左页下部的大数字徽章','R-cyan-card':'右页写字的蓝绿色硫酸纸','R-vellum-lower':'露在蓝绿卡纸下方的第二层硫酸纸','R-fruit-basket':'右页下方压住纸边的小主体'},
 'S03-棕蓝爱心':{'L-heart-photo':'左页中央完整主体，心形只是案例的一种轮廓','L-lace':'跨左页中线的透明花边或胶带','R-translucent-card':'右页连续的大张硫酸纸，文字写在同一纸面','R-cake-illustration':'右上方食物、花、物件或旅行主题方卡','R-star-top':'硫酸纸上缘星形点缀','R-star-right':'硫酸纸右缘星形点缀','R-star-left':'硫酸纸左缘星形点缀'},
 'S04-粉黑百合':{'L-pink-translucent':'左页浅色纸后面透出的粉色硫酸纸','L-writing-card':'左页正文主纸','L-flower-photo':'左页下方花或其他自然图案小卡','R-gray-back':'右页主纸下方露出的灰色硫酸纸','R-writing-card':'右页上方书写主纸','R-lily':'从页心跨到右页下缘的完整不规则主体'},
 'S05-灰黄甜点':{'L-grid-strip':'左页边缘纵向格纹连接带','L-vase-card':'左页上方主题小卡','L-elephant-card':'左页下方主题小卡','R-white-band':'右页中段横向衬底纸','R-dessert-photo':'右页中段的主题画面','R-top-card':'右页上方短标题卡','R-green-sticker':'压住上方标题卡的另一张小卡'},
 'S06-白粉果实':{'L-number':'左页上方大数字','L-fruit-photo':'左页中央大幅主画面','L-vellum-overlay':'主画面上方的半透明写字纸','L-flower':'压在主画面左下角的小幅花图卡','R-fig-card':'右页上方方形主题卡','R-lower-paper':'右页下方大幅横线书写纸','R-mid-number':'右页中段大数字','R-flower':'压在下方书写纸边缘的红色花图卡'}
};

export function describeSpreadSlot(templateId,node){
 const [id,page,role,box,z]=node;
 const spec=roleCatalog[role];
 if(!spec)throw new Error(`未登记的双页槽位角色：${role}`);
 return {id,page,role,box,z,purpose:purposeById[templateId]?.[id]||spec.purpose,
  mode:spec.mode,acceptedMaterialRoles:[...spec.roles],
  sourceSize:'用户素材按原始毫米尺寸摆放，不缩放',
  fallback:spec.mode==='material'?'无合适素材时生成同尺寸可编辑纸卡，保留槽位与遮挡':spec.mode==='text'||spec.mode==='text-or-number'?'可编辑文字':'按模板生成可编辑对象',
  crop:'默认保留完整主体；只有纸张或边饰可按槽位安全裁切'};
}
