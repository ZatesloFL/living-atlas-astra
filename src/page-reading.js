// DOM-only presentation helpers. Arrange only blocks the shared reader has
// already admitted; this module never reads room content or grants access.
const blockSelector=id=>`[data-block-id="${CSS.escape(id)}"]`;
function detailKey(detail){
 const block=detail.closest('[data-block-id]');
 return block?`${block.dataset.blockId}:${[...block.querySelectorAll('details')].indexOf(detail)}`:detail.className;
}
export function captureReading(root){
 const blocks=[...root.querySelectorAll('article [data-block-id]')];
 const edge=(root.querySelector('.page-lens-bar')?.getBoundingClientRect().bottom??0)+24;
 const hero=root.querySelector('.article-hero');
 const index=hero&&hero.getBoundingClientRect().bottom<=edge?blocks.findIndex(b=>b.getBoundingClientRect().bottom>edge):-1;
 const anchor=index>=0?blocks[index]:null;
 const candidates=anchor?[...blocks.slice(index),...blocks.slice(0,index).reverse()].map(b=>b.dataset.blockId):[];
 const active=root.contains(document.activeElement)?document.activeElement:null;
 const block=active?.closest('[data-block-id]');
 return {
  scroll:window.scrollY,candidates,top:anchor?.getBoundingClientRect().top,
  details:new Map([...root.querySelectorAll('article details')].map(d=>[detailKey(d),d.open])),
  focus:active?.id?{id:active.id}:block?{block:block.dataset.blockId,index:[...block.querySelectorAll('button,a,input,select,summary')].indexOf(active)}:null
 };
}
export function restoreReading(root,state){
 if(!state)return;
 root.querySelectorAll('article details').forEach(d=>{if(state.details.has(detailKey(d)))d.open=state.details.get(detailKey(d));});
 const focus=state.focus;
 const active=focus?.id?root.querySelector('#'+CSS.escape(focus.id)):focus?.block?root.querySelector(blockSelector(focus.block))?.querySelectorAll('button,a,input,select,summary')[focus.index]:null;
 active?.focus({preventScroll:true});
 const anchor=state.candidates.map(id=>root.querySelector(blockSelector(id))).find(Boolean);
 window.scrollTo(0,anchor?window.scrollY+anchor.getBoundingClientRect().top-state.top:state.scroll);
}
export function arrangeArticle(root){
 const body=root.querySelector('.article-body');if(!body)return;
 // Group adjacent references/cards without changing authored reading order.
 for(const block of [...body.children]){
  if(block.parentNode!==body)continue;
  const citations=block.matches('[data-block-type=citation]');
  const related=!!block.querySelector('.related-room');
  if(!citations&&!related)continue;
  const group=document.createElement(citations?'ol':'nav');
  group.className=citations?'article-citations':'article-related';
  group.setAttribute('aria-label',citations?'Sources to verify':'Related places');
  body.insertBefore(group,block);
  let current=block;
  while(current&&(citations?current.matches('[data-block-type=citation]'):!!current.querySelector('.related-room'))){
   const next=current.nextElementSibling;
   if(citations){const li=document.createElement('li');li.append(current);group.append(li);}else group.append(current);
   current=next;
  }
 }
 root.querySelectorAll('.content-block').forEach(section=>{
  const credit=section.querySelector('.contributor-credit');if(!credit)return;
  const note=document.createElement('details');note.className='page-layer-note';
  const summary=document.createElement('summary');summary.textContent=credit.textContent;note.append(summary);
  while(section.firstChild)note.append(section.firstChild);
  section.append(note);
 });
}
