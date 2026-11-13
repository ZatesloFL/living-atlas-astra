// One DOM layout owns all Visit HUD positions. Notifications take turns in one lane.
export class HUD {
 constructor(){
  if(!document.querySelector('link[data-hud-style]')){const link=document.createElement('link');link.rel='stylesheet';link.href=new URL('../hud.css',import.meta.url).href;link.dataset.hudStyle='';document.head.append(link);}
  this.queue=[];this.sources=[];this.rects=[];
  this.shell=document.createElement('div');this.shell.id='hud-shell';document.body.append(this.shell);this.shell.append(document.getElementById('topbar'));
  this.lane=document.createElement('section');this.lane.id='notification-lane';this.lane.setAttribute('aria-label','Notifications and travel status');this.shell.append(this.lane);
  const utility=document.createElement('div');utility.className='hud-utilities';utility.append(document.getElementById('performance'),document.getElementById('diagnostics-toggle'));this.lane.append(utility);
  this.slot=document.createElement('div');this.slot.id='notification-slot';this.lane.append(this.slot);
  document.querySelector('.location-stack').append(document.getElementById('test-banner'));
  const footer=document.getElementById('bottom-bar'),left=document.createElement('div');left.className='hud-bottom-left';left.append(document.getElementById('build-button'),document.getElementById('perf-toggle'));footer.prepend(left);footer.insertBefore(document.getElementById('joystick'),document.getElementById('lens-button'));
  this.mount(document.getElementById('toast'),100);this.mount(document.getElementById('edge-prompt'),20);
  this.observer=new MutationObserver(()=>this.schedule());for(const node of [this.lane,document.getElementById('topbar')])this.observer.observe(node,{subtree:true,childList:true,attributes:true,attributeFilter:['hidden','class']});this.observer.observe(document.body,{attributes:true,attributeFilter:['class']});this.observer.observe(document.getElementById('scene-title'),{attributes:true,attributeFilter:['class']});
  this.resize=new ResizeObserver(()=>this.measure());for(const node of [this.shell,footer])this.resize.observe(node);window.addEventListener('resize',()=>this.measure());this.schedule();window.atlasHud=this;
 }
 mount(node,priority=40){if(!node)return;if(!this.sources.some(s=>s.node===node))this.sources.push({node,priority});this.slot.append(node);this.schedule();}
 schedule(){if(this.pending)return;this.pending=true;queueMicrotask(()=>{this.pending=false;this.sync();});}
 sync(){
  const toast=document.getElementById('toast');if(toast.hidden!==!this.queue.length)toast.hidden=!this.queue.length;const candidates=this.sources.filter(({node})=>!node.hidden).sort((a,b)=>b.priority-a.priority),winner=candidates[0]?.node;
  for(const {node} of this.sources){const hidden=node!==winner;if(node.classList.contains('hud-suppressed')!==hidden)node.classList.toggle('hud-suppressed',hidden);}
  this.measure();
 }
 notify(text,{duration=3200,action,label}={}){if(this.queue.some(n=>n.text===text))return;this.queue.push({text,duration,action,label});if(this.queue.length===1)this.present();}
 present(){clearTimeout(this.timer);const item=this.queue[0],root=document.getElementById('toast');root.replaceChildren();if(item){const text=document.createElement('span');text.textContent=item.text;root.append(text);if(item.action){const button=document.createElement('button');button.textContent=item.label??'Continue';button.onclick=()=>{item.action();this.next();};root.append(button);}this.timer=setTimeout(()=>this.next(),item.duration);}this.sync();}
 next(){if(document.body.matches('.panel-open,.page-mode,.diagnostics-open')){this.timer=setTimeout(()=>this.next(),500);return;}this.queue.shift();this.present();}
 measure(){
  const visible=el=>el&&!el.hidden&&getComputedStyle(el).display!=='none'&&getComputedStyle(el).visibility!=='hidden';
  const bottom=document.getElementById('bottom-bar');this.rects=[this.shell,bottom,document.getElementById('scene-title')].filter(visible).filter(el=>!el.classList.contains('faded')).map(el=>{const r=el.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height};});
  document.documentElement.style.setProperty('--hud-top',Math.ceil(this.shell.getBoundingClientRect().bottom+12)+'px');
 }
}
