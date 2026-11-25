import {EDGES} from './data.js';
import {resolveAddress} from './navigation.js';
import {roomEntry} from './content.js';
import {planRoute} from './travel-plan.js';

export function addressFailure(value){return `No accessible room at that address. I tried “${String(value).trim()}” as an exact room address and checked your current Lens, access and route. Nothing has been crossed.`;}
export function manualDestination(value,lens,from){
 const id=resolveAddress(value,lens);
 return id&&roomEntry(id,lens,EDGES).state!=='hidden'&&planRoute(from,id,lens)!==null?{ok:true,id}:{ok:false,message:addressFailure(value)};
}
export function showAddressFailure(form,message){
 let output=form.querySelector('[data-address-message]');if(!output){output=document.createElement('p');output.id=form.id+'-message';output.dataset.addressMessage='';output.className='reason';output.setAttribute('role','alert');output.tabIndex=-1;form.append(output);}form.elements.address.setAttribute('aria-describedby',output.id);output.textContent=message;output.focus({preventScroll:true});output.scrollIntoView({block:'nearest'});
}
export function destinationWords(input){
 return String(input).trim().replace(/^(?:please\s+)?(?:(?:take|bring|lead|guide)\s+(?:me|us)\s+(?:to\s+)?|(?:go|travel|head)\s+(?:to\s+)?|(?:find|show)\s+(?:me\s+)?|(?:i(?:'d| would)?\s+(?:like|want)\s+to\s+(?:visit|see|go to)\s+)|(?:where\s+(?:is|can i find)\s+))/i,'').replace(/[?.!]+$/,'').trim();
}
export function resolveDestination(input,discovery,{from='square'}={}){
 const requested=destinationWords(input),exact=/\/|^tlh:/i.test(requested),query=exact?'':requested.split(/\s+/).filter(w=>!['the','a','an','please'].includes(w.toLowerCase())).join(' '),lens=discovery.lens();
 const result=discovery.query({words:query},{from}),id=exact?resolveAddress(requested,lens):null;
 const matches=result.results.filter(c=>c.type==='room'&&(!exact||c.room===id));
 const tried=exact?`the exact address “${requested}” in the Discovery index`:`Discovery for “${query||requested}”`;
 return {requested,query,exact,rule:result.sortLabel,matches:query||exact?matches:[],message:matches.length&&(query||exact)?`I found ${matches.length===1?'a Place':matches.length+' Places'} using ${tried}, through your current Lens and door terms.`:`I couldn’t find a Place for “${requested}”. I searched ${tried}, through your current Lens and door terms. Nothing has been crossed.`};
}
