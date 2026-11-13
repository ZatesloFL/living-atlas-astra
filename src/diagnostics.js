export class Diagnostics {
  constructor(){
    this.build='2026-11-13-g2';this.events=[];this.errors=[];this.current='bootstrap';this.mode='starting';this.contextFailed=false;
    this.params=new URLSearchParams(location.search);this.safe=this.params.has('safe');this.inject=new Set(this.params.has('test')?(this.params.get('fail')??'').split(','):[]);
    this.ensurePanel();
  }
  ensurePanel(){
    const host=document.body||document.documentElement;
    this.toggle=document.createElement('button');this.toggle.id='diagnostics-toggle';this.toggle.textContent='Diagnostics';this.toggle.onclick=()=>{this.panel.hidden=!this.panel.hidden;document.body.classList.toggle('diagnostics-open',!this.panel.hidden);this.refresh();};host.append(this.toggle);
    this.panel=document.createElement('section');this.panel.id='startup-diagnostics';this.panel.hidden=true;this.panel.setAttribute('role','region');this.panel.setAttribute('aria-label','Startup diagnostics');
    this.panel.innerHTML='<h2>Startup diagnostics</h2><p class="diagnostic-summary"></p><p class="diagnostic-render"></p><div class="diagnostic-actions"><button data-quality hidden>Try full quality</button><button data-perf>Show fps</button></div><pre class="diagnostic-errors" tabindex="0"></pre><div class="diagnostic-actions"><button data-copy>Copy diagnostics</button><button data-close>Continue</button></div><p class="diagnostic-copy-status" role="status"></p>';
    this.panel.querySelector('[data-quality]').onclick=()=>this.onFullQuality?.();this.panel.querySelector('[data-perf]').onclick=()=>{const p=document.getElementById('performance');if(p)p.hidden=false;this.panel.hidden=true;document.body.classList.remove('diagnostics-open');};
    this.panel.querySelector('[data-copy]').onclick=()=>this.copy();this.panel.querySelector('[data-close]').onclick=()=>{this.panel.hidden=true;document.body.classList.remove('diagnostics-open');};host.append(this.panel);
  }
  begin(step){this.current=step;const event={step,status:'running',time:Math.round(performance.now())};this.events.push(event);return event;}
  check(step){if(this.inject.has(step))throw new Error(`Injected test failure: ${step}`);}
  run(step,fn){const event=this.begin(step);try{this.check(step);const result=fn();event.status='passed';this.refresh();return result;}catch(error){event.status='failed';this.record(step,error);throw error;}}
  async asyncRun(step,fn){const event=this.begin(step);try{this.check(step);const result=await fn();event.status='passed';this.refresh();return result;}catch(error){event.status='failed';this.record(step,error);throw error;}}
  record(step,error,recovery){
    if(this.errors.some(e=>e.original===error)){if(recovery)this.errors.find(e=>e.original===error).recovery=recovery;this.refresh();return;}
    const item={step,name:error?.name||'Error',message:error?.message||String(error),stack:error?.stack||String(error),recovery:recovery||'Recovery in progress',time:Math.round(performance.now()),original:error};
    this.errors.push(item);this.panel.hidden=false;document.body.classList.add('diagnostics-open');this.refresh();console.error(`[Living Atlas: ${step}]`,error);
  }
  recovered(step,description){const e=[...this.errors].reverse().find(e=>e.step===step);if(e)e.recovery=description;this.refresh();}
  setMode(mode){this.mode=mode;this.refresh();}
  payload(){
    return {build:this.build,path:location.pathname,safe:this.safe,render:this.renderState?.()??null,mode:this.mode,startupStep:this.current,webglContextFailed:this.contextFailed,
      browser:navigator.userAgent,viewport:{width:innerWidth,height:innerHeight,dpr:devicePixelRatio},gpu:this.gpu??null,
      stages:this.events,errors:this.errors.map(({original,...e})=>e)};
  }
  refresh(){
    if(!this.panel)return;
    const render=this.renderState?.();this.toggle.hidden=!(this.safe||this.params.has('test')||this.errors.length||render&&render.level>1);this.toggle.textContent=render?`L${render.level} · Diagnostics`:'Diagnostics';
    this.panel.querySelector('.diagnostic-render').textContent=render?`Level ${render.level}: ${render.label}. Shadows ${render.shadows?'on':'off'}. DPR ${render.dpr.toFixed(2)}. ${render.firstFramePassed?'Frame validated.':'Awaiting frame validation.'} ${render.reason}`:'No 3D renderer active.';
    this.panel.querySelector('[data-quality]').hidden=!this.onFullQuality;
    this.panel.querySelector('.diagnostic-summary').textContent=`${this.mode} · ${this.safe?'safe mode · ':''}last stage: ${this.current}`;
    this.panel.querySelector('.diagnostic-errors').textContent=this.errors.length?this.errors.map(e=>`STEP: ${e.step}\n${e.name}: ${e.message}\n${e.stack}\nRECOVERY: ${e.recovery}`).join('\n\n'):JSON.stringify(this.payload(),null,2);
  }
  async copy(){
    const text=JSON.stringify(this.payload(),null,2),status=this.panel.querySelector('.diagnostic-copy-status');
    try{await navigator.clipboard.writeText(text);status.textContent='Diagnostics copied.';}
    catch{
      let field=this.panel.querySelector('textarea');if(!field){field=document.createElement('textarea');field.setAttribute('aria-label','Diagnostics to copy');this.panel.append(field);}field.value=text;field.focus();field.select();
      try{status.textContent=document.execCommand('copy')?'Diagnostics copied.':'Select and copy the diagnostic text below.';}catch{status.textContent='Select and copy the diagnostic text below.';}
    }
  }
}
