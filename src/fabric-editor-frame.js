// Scene objects, groups, and selection proxies share these visible controls.
export function configureFabricEditorFrame(fabric,object){
  const edgeHandle=horizontal=>(ctx,left,top,_style,target)=>{
    ctx.save();ctx.translate(left,top);ctx.rotate((target.angle||0)*Math.PI/180);
    ctx.fillStyle='#fffefa';ctx.strokeStyle='#416c59';ctx.lineWidth=1.5;
    const width=horizontal?20:8,height=horizontal?8:20;
    ctx.beginPath();ctx.roundRect(-width/2,-height/2,width,height,4);ctx.fill();ctx.stroke();
    ctx.restore();
  };
  const cornerHandle=(ctx,left,top,_style,target)=>{
    ctx.save();ctx.translate(left,top);ctx.rotate((target.angle||0)*Math.PI/180);
    ctx.fillStyle='#fffefa';ctx.strokeStyle='#416c59';ctx.lineWidth=1.5;
    ctx.beginPath();ctx.roundRect(-9,-9,18,18,5);ctx.fill();ctx.stroke();
    ctx.beginPath();ctx.arc(-1,-1,4,-Math.PI*.88,Math.PI*.45);ctx.stroke();
    ctx.beginPath();ctx.moveTo(1,2);ctx.lineTo(6,6);ctx.moveTo(2,6);
    ctx.lineTo(6,6);ctx.lineTo(6,2);ctx.stroke();ctx.restore();
  };
  const scaleAndRotate=(event,transform,x,y)=>{
    const {target,ex,ey,theta,scaleX,scaleY}=transform;
    const center=target.getCenterPoint();
    const startDistance=Math.hypot(ex-center.x,ey-center.y);
    if(startDistance<1)return false;
    const ratio=Math.max(.1,Math.min(20,Math.hypot(x-center.x,y-center.y)/startDistance));
    const angle=(theta+Math.atan2(y-center.y,x-center.x)-
      Math.atan2(ey-center.y,ex-center.x))*180/Math.PI;
    const nextX=target.lockScalingX?scaleX:scaleX*ratio;
    const nextY=target.lockScalingY?scaleY:scaleY*ratio;
    if(Math.abs(target.angle-angle)<1e-3&&Math.abs(target.scaleX-nextX)<1e-4&&
      Math.abs(target.scaleY-nextY)<1e-4)return false;
    target.set({angle,scaleX:nextX,scaleY:nextY});
    target.setPositionByOrigin(center,'center','center');target.setCoords();
    target.canvas?.fire('object:rotating',{e:event,target,transform});
    if(nextX!==scaleX||nextY!==scaleY)
      target.canvas?.fire('object:scaling',{e:event,target,transform});
    return true;
  };
  const controls={},base=object.controls;
  if(!object.lockScalingX&&!object.lockScalingY)
    for(const side of ['ml','mr','mt','mb'])controls[side]=new fabric.Control({
      ...base[side],render:edgeHandle(side==='mt'||side==='mb')});
  controls.br=new fabric.Control({...base.br,actionName:'rotate',
    actionHandler:scaleAndRotate,cursorStyle:'crosshair',render:cornerHandle});
  object.controls=controls;
  object.set({cornerSize:24,touchCornerSize:46,transparentCorners:false,
    cornerColor:'#fffefa',cornerStrokeColor:'#416c59',borderColor:'#416c59'});
}
