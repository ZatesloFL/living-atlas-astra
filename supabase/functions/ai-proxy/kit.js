// Bounded kit vocabulary. No scripts, selectors, URLs or cross-room action targets.
export const KIT_SCHEMAS=Object.freeze({
 screen:{required:['title','slides','transcript'],maxItems:8,cost:{instances:8,atlasTiles:1,liveTextures:0},accessibility:['captions always on','transcript','poster']},
 photoWall:{required:['title','photos'],maxItems:6,cost:{instances:20,atlasTiles:6,liveTextures:0},accessibility:['alt text','caption','credit','keyboard lightbox']},
 listening:{required:['title','cues','transcript'],maxItems:8,cost:{instances:8,atlasTiles:0,liveTextures:0},accessibility:['speech optional','synced transcript','reduced-motion waveform']},
 newspaper:{required:['title','headline','columns'],maxItems:4,cost:{instances:6,atlasTiles:1,liveTextures:0},accessibility:['readable text','zoom controls','scroll to pan']},
 seatMap:{required:['title','seats'],maxItems:12,cost:{instances:30,atlasTiles:0,liveTextures:0},accessibility:['labeled seat buttons','caption region','diagram alternative']}
});
const EVENTS=['tap','leave','photo','seat','zoom','seek'],ACTIONS=['toggle','pause','photo','seat','zoom','seek'];
export function validateComponent(c){
 const schema=KIT_SCHEMAS[c?.kind];if(!schema)throw new Error('Unknown kit component');if(!/^[a-z0-9-]{1,60}$/.test(c.id))throw new Error('Invalid component ID');
 if(schema.required.some(k=>!(k in (c.settings??{}))))throw new Error('Missing kit setting');
 if(typeof c.settings.title!=='string'||c.settings.title.length>160)throw new Error('Invalid kit title');
 const allowed=new Set([...schema.required,'secondsPerSlide','voice']);if(Object.keys(c.settings).some(k=>!allowed.has(k)))throw new Error('Unknown kit setting');
 if(c.kind==='screen'&&(!Number.isFinite(c.settings.secondsPerSlide)||c.settings.secondsPerSlide<1||c.settings.secondsPerSlide>30))throw new Error('Invalid slide duration');
 if(c.position&&(!Array.isArray(c.position)||c.position.length!==2||c.position.some(v=>!Number.isFinite(v)||Math.abs(v)>30)))throw new Error('Placement outside kit bounds');
 const lists=['slides','photos','cues','columns','seats'];for(const k of lists)if(c.settings[k]&&(!Array.isArray(c.settings[k])||c.settings[k].length>schema.maxItems))throw new Error('Kit item budget exceeded');
 if((c.behaviors?.length??0)>12)throw new Error('Behavior budget exceeded');
 for(const b of c.behaviors??[])if(!EVENTS.includes(b.when)||b.if!=='canView'||b.target!=='self'||!ACTIONS.includes(b.then))throw new Error('Behavior is outside the kit scope');return true;
}
export function interpret(c,event,{canView=false,value}={}){
 validateComponent(c);return (c.behaviors??[]).filter(b=>b.when===event&&canView).map(b=>({action:b.then,value,target:c.id}));
}
export const behavior=(when,then)=>({when,if:'canView',then,target:'self'});
