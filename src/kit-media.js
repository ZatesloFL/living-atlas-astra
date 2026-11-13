import {interpret} from './kit.js';
import {drawArt} from './kit-art.js';
export const players=new Map();
const listeners=new Set();
let environment=()=>true;
export function setMediaGuard(fn){environment=fn;}
export function stopMedia(){for(const p of players.values())p.pause();}
export function subscribeMedia(fn){listeners.add(fn);return()=>listeners.delete(fn);}
export function mediaPlayer(room,component){
 const key=room+':'+component.id;if(players.has(key))return players.get(key);const p=new Player(room,component);players.set(key,p);return p;
}
class Player{
 constructor(room,c){this.room=room;this.component=c;this.playing=false;this.time=0;this.cue=0;this.status='Ready · captions on';this.views=new Set();this.duration=(c.settings.slides?.length??1)*(c.settings.secondsPerSlide??3);this.generation=0;}
 emit(){for(const view of [...this.views]){if(!view.root.isConnected){view.dispose?.();this.views.delete(view);}else view.update(this);}for(const fn of listeners)fn(this);}
 dispatch(event,value){for(const op of interpret(this.component,event,{canView:event==='leave'||environment(this),value})){
  if(op.action==='toggle')this.playing?this.pause():this.play();else if(op.action==='pause')this.pause();else if(op.action==='seek'){this.time=Math.max(0,Math.min(this.duration-.01,Number(value)||0));this.tickFrame();this.emit();}
 } }
 play(){if(this.playing||!environment(this))return;for(const p of players.values())if(p!==this)p.pause();this.playing=true;this.status='Playing · captions on';this.generation++;this.emit();
  if(this.component.kind==='listening'){this.speak(this.cue,this.generation);return;}
  if(this.time>=this.duration)this.time=0;this.last=performance.now();this.tickFrame();this.timer=setInterval(()=>{if(!environment(this)){this.pause();return;}const now=performance.now();this.time+=(now-this.last)/1000;this.last=now;if(this.time>=this.duration){this.time=this.duration;this.pause('Finished · replay available');return;}this.tickFrame();this.emit();},200);
 }
 pause(status='Paused'){if(!this.playing)return;this.playing=false;this.generation++;clearInterval(this.timer);if(this.component.kind==='listening')globalThis.speechSynthesis?.cancel();this.status=status;this.emit();}
 speak(index,token){
  if(!globalThis.speechSynthesis||!globalThis.SpeechSynthesisUtterance||!speechSynthesis.getVoices().length){this.pause('Speech unavailable on this device · read the transcript');return;}
  this.cue=index;this.emit();const u=new SpeechSynthesisUtterance(this.component.settings.cues[index]);u.rate=.9;u.onstart=()=>{if(token===this.generation){this.cue=index;this.status='Speaking · sample narration';this.emit();}};u.onend=()=>{if(token!==this.generation)return;if(!environment(this)){this.pause();return;}if(index+1<this.component.settings.cues.length)this.speak(index+1,token);else{this.cue=0;this.pause('Finished · replay available');}};u.onerror=()=>{if(token===this.generation)this.pause('Speech interrupted · transcript remains available');};speechSynthesis.speak(u);
  clearInterval(this.timer);this.timer=setInterval(()=>{if(!environment(this))this.pause();},250);
 }
 tickFrame(){const slides=this.component.settings.slides;if(!slides)return;this.cue=Math.min(slides.length-1,Math.floor(this.time/(this.component.settings.secondsPerSlide??3)));if(this.canvas){const ctx=this.canvas.getContext('2d');drawArt(ctx,slides[this.cue].scene,0,0,720,440);ctx.fillStyle='#112c35';ctx.fillRect(0,373,720,67);ctx.fillStyle='#f6e6c9';ctx.font='24px Georgia';ctx.fillText(slides[this.cue].title,24,411);}}
 stream(){if(this.streamObject)return this.streamObject;this.canvas=document.createElement('canvas');this.canvas.width=720;this.canvas.height=440;this.tickFrame();this.streamObject=this.canvas.captureStream?.(5);return this.streamObject;}
}
if(globalThis.document)document.addEventListener('visibilitychange',()=>{if(document.hidden)stopMedia();});
