// No network fetch or tracking; help is intentionally self-contained.
export function showHelp({body,modal}){
  body.replaceChildren();
  const title=document.createElement('h2');title.textContent='拾页 · 使用说明';
  const content=document.createElement('div');content.className='stack';
  const sections=[
    ['开始使用','从素材库导入照片，确认纸张四角与方向，查看每件素材边缘；漏检可手动补框。确认真实尺寸后保存到素材系列。'],
    ['搭配与创作','在素材库选择素材加入本次创作；搭配页可创建独立方案。画布会自动暂存修改，素材原图、用量和真实毫米尺寸不会因为拖放被重写。'],
    ['保存与同步','云端模式下“已暂存”与“已同步”含义不同。断网或版本冲突时，本机待传操作仍需保留。可点击右上同步状态查看并手动重试。'],
    ['备份与恢复','“完整备份”用于迁移整套素材及作品；“待同步应急备份”只保存当前设备未上传的修改。恢复会影响当前资料，请先独立保存现有备份。'],
    ['更新与故障排查','PWA 更新不会自动打断编辑。出现“更新拾页”按钮时，完成当前操作并确认本机保存后再点击。若识别引擎超时，重新执行该照片识别，无须清理本机数据。'],
    ['隐私','私人原图可能保存在私有云对象存储；启用第三方 AI 时，选中的素材预览和创作请求会发给所选模型服务商。不要分享含私人照片或文字的诊断文件、备份文件。']
  ];
  for(const [heading,text] of sections){
    const section=document.createElement('section'),h=document.createElement('h3'),p=document.createElement('p');
    h.textContent=heading;p.textContent=text;section.append(h,p);content.append(section);
  }
  const close=document.createElement('button');close.type='button';close.className='btn primary';close.textContent='返回';
  close.onclick=()=>modal.close();
  body.append(title,content,close);if(!modal.open)modal.showModal();
}
