export const PLACE_OVERVIEW_ID='place-overview';
// Authored words only. This is evidence, not a generated description. Both the
// public server bundle and the local helper use this same projection.
export function placeOverview(room){
  const body=[...new Set([room.title,room.substance?.summary,room.substance?.body].filter(value=>typeof value==='string'&&value.trim()))].join('\n\n');
  return body?{id:PLACE_OVERVIEW_ID,type:'text',importance:'core',body,content:room.content,author:room.author,sources:[]}:null;
}
