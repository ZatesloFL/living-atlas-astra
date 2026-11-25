import {sourcedRoom} from './source-catalog.js';

export const isStarterArchive=room=>!!room?.arrivalSeed&&room.id.endsWith('/drive');
export function attachedArchiveSources(room,lens){
  if(!isStarterArchive(room))return [];
  const view=sourcedRoom(room,lens);
  return (view.sources??[]).map(source=>({
    id:source.id,label:source.label??view.blocks?.find(b=>b.source?.sourceId===source.id)?.source?.label??source.id,
    mode:source.syncMode,status:source.status,asOf:source.lastSync??null,simulated:!!source.simulated
  }));
}
export function archiveSourceText(source){
  return `${source.label} · ${source.simulated?'simulated · ':''}${source.mode} · ${source.status??'status not supplied'} · ${source.asOf?'as of '+source.asOf:'not synced yet'}`;
}
// Only the arrival shell is projected here. Source blocks remain lane B's view.
export function currentArchive(room,lens){
  const attached=attachedArchiveSources(room,lens);if(!attached.length)return room;
  const summary='Your personal archive · '+attached.map(archiveSourceText).join('; ');
  return {...room,substance:{...room.substance,summary,body:summary},blocks:room.blocks?.filter(b=>!['archive-state','archive-inbox'].includes(b.id))};
}
