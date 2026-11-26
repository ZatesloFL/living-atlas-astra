export function visitorHUD(controls,world,back){
 const css=document.createElement('link');css.rel='stylesheet';css.href=new URL('../visitor.css',import.meta.url).href;document.head.append(css);
 const root=document.createElement('div');root.className='visitor-controls';root.setAttribute('aria-label','Viewpoint inside this Place');
 root.innerHTML='<button id="visitor-rise" aria-label="Hold to rise inside this Place">Hold to rise</button><button id="visitor-land" disabled>Land</button><button id="visitor-entrance">Back to the entrance</button><output id="visitor-view-status">Walking · 1×</output>';document.getElementById('bottom-bar').append(root);
 const rise=root.querySelector('#visitor-rise');rise.onpointerdown=e=>{if(!controls.canMove())return;e.preventDefault();rise.setPointerCapture(e.pointerId);controls.rising=true;};for(const name of ['pointerup','pointercancel','lostpointercapture'])rise.addEventListener(name,()=>{controls.rising=false;});
 rise.onkeydown=e=>{if(['Space','Enter'].includes(e.code)&&controls.canMove()){e.preventDefault();controls.rising=true;}};rise.onkeyup=()=>{controls.rising=false;};rise.onblur=()=>{controls.rising=false;};
 root.querySelector('#visitor-land').onclick=()=>controls.land(world());root.querySelector('#visitor-entrance').onclick=back;
 return ({flying,landing,height,zoom})=>{root.querySelector('#visitor-land').disabled=!flying;root.querySelector('#visitor-view-status').textContent=`${landing?'Landing':flying?'Risen '+height.toFixed(1)+' m':'Walking'} · ${zoom.toFixed(1)}×`;};
}
