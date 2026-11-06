import {withLoadTimeout} from './session.js';
export function watchNewOrders({getCount,onChange,events=document,isVisible=()=>document.visibilityState==='visible',interval=10000}) {
 let stopped=false,busy=false,count=0;
 async function refresh(){
  if(stopped||busy)return;busy=true;
  try{const next=await withLoadTimeout(getCount());if(!stopped){count=next;onChange({count,error:false})}}
  catch{if(!stopped)onChange({count,error:true})}
  finally{busy=false}
 }
 const visible=()=>{if(isVisible())refresh()};
 events.addEventListener('visibilitychange',visible);
 events.addEventListener('qrmenu-orders-changed',visible);
 const timer=setInterval(visible,interval);refresh();
 return {refresh,stop(){stopped=true;clearInterval(timer);events.removeEventListener('visibilitychange',visible);events.removeEventListener('qrmenu-orders-changed',visible)}};
}
