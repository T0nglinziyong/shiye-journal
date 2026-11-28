import React,{createContext,useContext,useEffect,useState} from 'react';

export const AssetOrganizationContext=createContext(null);
const names={queued:'等待整理',running:'正在整理',failed:'整理未完成'};
const titles={queued:'素材已暂存，等待同步后自动整理',running:'正在后台整理名称和标签，可继续使用页面',failed:'自动整理未完成，素材已保存，可稍后重新识别'};
export function OrganizationBadge({id}){
  const organization=useContext(AssetOrganizationContext);
  const [,refresh]=useState(0);
  useEffect(()=>organization?.subscribe(()=>refresh(value=>value+1)),[organization]);
  const status=organization?.status(id);
  return status?<span className="asset-organization-badge" data-organization-status={status}
    role="status" aria-live="polite" aria-atomic="true" title={titles[status]}>{names[status]}</span>:null;
}
