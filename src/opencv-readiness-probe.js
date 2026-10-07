import cvModule from '@techstark/opencv-js';

export async function probeOpenCVMainThread(){
  let cv;
  if(cvModule&&typeof cvModule.then==='function')cv=await cvModule;
  else{
    cv=cvModule;
    if(!cv.Mat)await new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>reject(Error('OpenCV main-thread initialization timeout')),30000);
      const previous=cv.onRuntimeInitialized;
      cv.onRuntimeInitialized=()=>{clearTimeout(timer);try{previous?.();}catch{}resolve();};
    });
  }
  return {ready:!!cv?.Mat,hasGrabCut:typeof cv?.grabCut==='function',hasInpaint:typeof cv?.inpaint==='function'};
}
