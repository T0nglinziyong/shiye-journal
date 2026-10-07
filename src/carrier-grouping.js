// Optional carrier-aware grouping for visual material instances.
//
// Visual instance discovery decides WHAT OBJECTS are present. This module only
// decides whether several already-discovered objects should be treated as one
// physical material because a shared carrier has been independently observed.
//
// No image segmentation happens here. With grouping disabled, identities are
// returned unchanged. With grouping enabled, only explicit, high-confidence
// shared-carrier links may join instances.

const area=r=>Math.max(0,r?.w||0)*Math.max(0,r?.h||0);
const unionBox=(items)=>{
  const left=Math.min(...items.map(x=>x.x)),top=Math.min(...items.map(x=>x.y)),
    right=Math.max(...items.map(x=>x.x+x.w)),bottom=Math.max(...items.map(x=>x.y+x.h));
  return {x:left,y:top,w:right-left,h:bottom-top};
};

export function validCarrierLink(link){
  if(!link||!Number.isInteger(link.a)||!Number.isInteger(link.b)||link.a===link.b)return false;
  if((link.confidence??0)<.72)return false;
  if((link.edgeSupport??0)<.28)return false;
  if((link.seedCoverage??0)<.82)return false;
  if((link.pageLeak??1)>.18)return false;
  if((link.carrierAreaRatio??0)<1.02||(link.carrierAreaRatio??99)>6)return false;
  return true;
}

export function groupInstancesByCarrier(instances,links=[],{enabled=true}={}){
  const input=instances||[];
  if(!enabled)return input.map((instance,index)=>({
    members:[index],instance,grouped:false,carrierLinkCount:0
  }));
  const parent=input.map((_,i)=>i),rank=input.map(()=>0);
  const find=i=>{while(parent[i]!==i){parent[i]=parent[parent[i]];i=parent[i];}return i;};
  const join=(a,b)=>{a=find(a);b=find(b);if(a===b)return;if(rank[a]<rank[b])[a,b]=[b,a];parent[b]=a;if(rank[a]===rank[b])rank[a]++;};
  const accepted=[];
  for(const link of links){
    if(link.a<0||link.b<0||link.a>=input.length||link.b>=input.length||!validCarrierLink(link))continue;
    join(link.a,link.b);accepted.push(link);
  }
  const buckets=new Map();
  for(let i=0;i<input.length;i++){const root=find(i);if(!buckets.has(root))buckets.set(root,[]);buckets.get(root).push(i);}
  return [...buckets.values()].map(members=>{
    const items=members.map(i=>input[i]),box=unionBox(items),
      groupLinks=accepted.filter(link=>members.includes(link.a)&&members.includes(link.b));
    if(members.length===1)return {members,instance:items[0],grouped:false,carrierLinkCount:0};
    return {
      members,grouped:true,carrierLinkCount:groupLinks.length,
      x:box.x,y:box.y,w:box.w,h:box.h,
      pixels:items.reduce((sum,item)=>sum+(item.pixels||0),0),
      edgeMethod:'carrier-group',instanceMethod:'carrier-group',
      sourceInstances:items,
      carrierEvidence:groupLinks
    };
  }).sort((a,b)=>(a.instance?.y??a.y)-(b.instance?.y??b.y)||(a.instance?.x??a.x)-(b.instance?.x??b.x));
}

export function carrierGroupingSummary(groups){
  return {
    visualInstances:groups.reduce((sum,g)=>sum+g.members.length,0),
    outputMaterials:groups.length,
    groupedMaterials:groups.filter(g=>g.grouped).length,
    groupedVisualInstances:groups.filter(g=>g.grouped).reduce((sum,g)=>sum+g.members.length,0),
    totalGroupedArea:groups.filter(g=>g.grouped).reduce((sum,g)=>sum+area(g),0)
  };
}
