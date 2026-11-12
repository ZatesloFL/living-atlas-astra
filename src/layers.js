import {ROOMS} from './data.js';
import {roomVisible} from './rules.js';
import {blockAccess} from './content.js';
import {accessSettings,identityOf} from './identity.js';
import {permission} from './permissions.js';
import {viewRoom} from './audience.js';
export const layerConsentKey=lens=>JSON.stringify(accessSettings(lens).limits);
export const LAYER_TYPES=['More detail','Counterpoint','Expert deep-dive','Viewpoint','Remix'];
export function layerAccess(room,layer,lens){
 const gate=blockAccess({content:layer.content},viewRoom(room,lens),lens),types=lens.layerTypes??LAYER_TYPES;
 const trust=layer.trust??{},from=lens.trustFrom??'Author',mode=lens.layerMode??'Core only',expert=layer.type==='Expert deep-dive'&&lens.depth==='Deep';
 const visible=roomVisible(Object.keys(ROOMS).find(id=>ROOMS[id].id===room.id),lens)&&permission(room,lens).canLook&&!gate.hidden&&types.includes(layer.type)&&(layer.author.isAgent||lens.show?.[identityOf(layer.author).display]!==false)&&(expert||mode==='Everything'||mode==='Vouched'&&trust.vouches>0)&&!(from==='Academic'&&!trust.academic||from==='Vouched'&&!trust.vouches||from==='Community'&&!trust.community);
 return {...gate,visible,expert,accepted:(lens.acceptedLayers??[]).includes(layer.id)};
}
export function layerSelection(room,lens){return (room.layers??[]).map(layer=>({layer,...layerAccess(room,layer,lens)})).filter(x=>x.visible);}
export function mergedLayers(room,lens){const version=viewRoom(room,lens).version?.id??'original';return (room.layers??[]).filter(l=>lens.access?.layerState?.[l.id]?.merges?.some(m=>m.version===version));}
export function layerBlock(layer,merged=false){return {id:'layer-'+layer.id,type:'text',importance:'supporting',body:layer.body,reps:{text:layer.body},content:layer.content,author:layer.author,trust:layer.trust,sources:layer.sources,contribution:{name:layer.author.name,type:layer.type,merged}};}
export async function proposeLayer(store,key,layerId,lens){return store.transaction(async()=>{
 if(lens.preview)throw new Error('Exit Preview as before proposing.');const room=store.room(key),p=permission(room,store.lens(lens)),layer=room.layers?.find(l=>l.id===layerId);if(!layer||!p.canLook||p.visibility!=='public'&&!p.canSuggest)throw new Error('Suggest access is required here.');
 if(blockAccess({content:layer.content},viewRoom(room,lens),lens).hidden)throw new Error('This layer is outside your content limits.');
 const state=store.data.layerState[layerId]??={merges:[]};if(state.proposed)return;state.proposed=true;state.by=lens.profileId;state.at=new Date().toISOString();await store.record(key,lens,'layer_proposed',{layer:layerId,contributor:layer.author,by:lens.profileId});
 });}
export async function mergeLayer(store,key,layerId,version,lens){return store.transaction(async()=>{
 store.owner(lens);const room=store.room(key),layer=room.layers?.find(l=>l.id===layerId),state=store.data.layerState[layerId];if(!layer||!state?.proposed)throw new Error('Propose this layer before merging.');const target=room.versions?.find(v=>v.id===version);if(room.versions?.length&&!target)throw new Error('Choose an audience version.');
 if(target&&Object.entries(layer.content).some(([k,n])=>n>(target.content[k]??0)))throw new Error('Layer scores exceed that audience version. Choose a qualified version.');
 if(state.merges.some(m=>m.version===version))return;const merge={version,by:lens.profileId,at:new Date().toISOString(),contributor:layer.author};await store.record(key,lens,'layer_merged',{layer:layerId,...merge});state.merges.push(merge);
 });}
