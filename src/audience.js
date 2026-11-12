import {accessSettings} from './identity.js';
export function selectVersion(room,lens){
 if(!room.versions?.length)return null;const a=accessSettings(lens);
 return [...room.versions].sort((x,y)=>y.rank-x.rank).find(v=>a.age>=(v.minAge??0)&&(!v.verified||a.verified)&&Object.entries(v.content).every(([k,n])=>n<=a.limits[k]&&(a.hard[k]===null||n<=a.hard[k])))??null;
}
export function viewRoom(room,lens){const v=selectVersion(room,lens);return v?{...room,content:v.content,measured:v.content,minAge:v.minAge,blocks:v.blocks,layout:{...room.layout,...v.layout},version:v}:room;}
export function versionLabel(room,lens){const v=selectVersion(room,lens);return v?`You’re seeing the ${v.name} version. ${room.versions.length-1} others exist.`:'';}
