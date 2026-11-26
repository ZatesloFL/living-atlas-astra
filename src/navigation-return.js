// Keep one obvious return action inside the active dialog/top layer as well as the walk.
export function mountReturnControl(run,{visible=()=>true,home=()=>document.body}={}){
 const button=document.createElement('button');button.id='navigation-return';button.textContent='Back to the entrance';button.className='navigation-return';button.onclick=run;
 if(!document.querySelector('[data-return-style]')){const link=document.createElement('link');link.rel='stylesheet';link.href=new URL('../navigation-return.css',import.meta.url).href;link.dataset.returnStyle='';document.head.append(link);}
 const sync=()=>{
  const modal=[...document.querySelectorAll('dialog[open]')].at(-1),overlay=[...document.querySelectorAll('.access-overlay:not([hidden])')].at(-1),sheet=document.querySelector('#sheet:not([hidden])'),page=document.querySelector('#page-form:not([hidden]) .page-header');
  const container=modal?.querySelector('header')??modal??overlay?.querySelector('.access-sheet header')??sheet?.querySelector('.sheet-header')??page??home();
  if(button.parentElement!==container)container.append(button);
  const floating=container===document.body;if(button.classList.contains('floating')!==floating)button.classList.toggle('floating',floating);
  const hidden=!visible();if(button.hidden!==hidden)button.hidden=hidden;
 };
 const observer=new MutationObserver(mutations=>{if(!button.isConnected||mutations.some(m=>m.type==='attributes'&&m.target.matches('body,dialog,#sheet,#page-form,.access-overlay,#startup-diagnostics')||m.type==='childList'&&[...m.addedNodes].some(n=>n.nodeType===1&&n.matches('dialog,.access-overlay,#page-form'))))sync();});
 observer.observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['hidden','open','class']});sync();return {button,refresh:sync,destroy(){observer.disconnect();button.remove();}};
}
