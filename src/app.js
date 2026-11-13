import {Diagnostics} from './diagnostics.js';
const diagnostics=new Diagnostics();
window.atlasDiagnostics=()=>diagnostics.payload();
window.atlasStatus=()=>({mode:diagnostics.mode,safe:diagnostics.safe,errors:diagnostics.errors.length});
let openingPage=false,page;
diagnostics.fallback=async(step,error)=>{
  if(error)diagnostics.record(step,error,'Continuing in Page form');
  diagnostics.stop3D?.();
  if(openingPage)return;openingPage=true;
  try{
    const {openFallbackPage}=await diagnostics.asyncRun('Page module',()=>import('./page.js'));
    page?.close();page=diagnostics.run('Page renderer',()=>openFallbackPage({...diagnostics.pageState?.(),diagnostics}));
    diagnostics.setMode('Page form');if(error)diagnostics.recovered(step,'Page form is available');
    window.atlasStatus=()=>({mode:'page',safe:diagnostics.safe,room:page.room,errors:diagnostics.errors.length});
    if(diagnostics.params.has('test'))window.__atlasPage=page;
  }catch(pageError){diagnostics.record('Page fallback',pageError,'Read or copy diagnostics; reload to retry.');document.getElementById('loading')?.classList.add('done');}
  finally{openingPage=false;}
};
window.addEventListener('error',event=>{if(event.error)diagnostics.fallback(`uncaught error (${diagnostics.current})`,event.error);});
window.addEventListener('unhandledrejection',event=>diagnostics.fallback(`unhandled rejection (${diagnostics.current})`,event.reason));
try{
  const {HUD}=await import('./hud.js');if(!window.atlasHud)new HUD();
  if(diagnostics.params.has('page')){
    try{
      const {ProfileStore}=await diagnostics.asyncRun('Page profiles module',()=>import('./profiles.js'));const profiles=diagnostics.run('Page profiles',()=>new ProfileStore());await profiles.ready;const {AccessStore}=await import('./access-store.js');const access=new AccessStore();await access.ready;
      diagnostics.pageState=()=>({access,profiles,lens:access.lens(profiles.current()),room:diagnostics.params.get('room')??'studio',onLensChange:lens=>profiles.preferences(lens),onAgeChange:async age=>{if(!profiles.completed)await profiles.setup({name:'My reading visit',age,preset:age<13?'Kids':'Teen',depth:'Standard',form:'page',display:'anonymous'});return profiles.current();}});
    }catch(error){diagnostics.record('Page profiles',error,'Reading without saved profiles.');}
    await diagnostics.fallback('Page URL selected');
  }else{
    const {startAtlas}=await diagnostics.asyncRun('runtime module',()=>import('./runtime.js'));
    await startAtlas(diagnostics);
  }
}catch(error){await diagnostics.fallback(diagnostics.current,error);}
