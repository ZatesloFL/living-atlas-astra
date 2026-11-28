export const PLACE_OVERVIEW_ID='place-overview';
// Authored words only. This is evidence, not a generated description. Both the
// public server bundle and the local helper use this same projection.
export function placeOverview(room){
  const body=[...new Set([room.title,room.substance?.summary,room.substance?.body].filter(value=>typeof value==='string'&&value.trim()))].join('\n\n');
  return body?{id:PLACE_OVERVIEW_ID,type:'text',importance:'core',body,content:room.content,author:room.author,sources:[]}:null;
}

// A readable projection of authored structured fields, shared with the server.
// URLs and rendering settings are not answer prose. No JSON envelopes are evidence.
export function evidenceText(block){
 const body=block.body;
 let text=typeof body==='string'?body:'';
 if(Array.isArray(body))text=body.map(row=>typeof row==='string'?row:[row.date,row.text??row.label].filter(Boolean).join(': ')).filter(Boolean).join('\n');
 else if(body&&typeof body==='object')text=block.type==='infobox'?Object.entries(body).filter(([,v])=>typeof v==='string').map(([k,v])=>`${k}: ${v}`).join('\n'):[body.text,body.label,body.note,body.status].filter(v=>typeof v==='string').join('\n');
 return [block.title,text].filter((v,i,a)=>typeof v==='string'&&v.trim()&&a.indexOf(v)===i).join('\n\n');
}
export const readableAnswer=text=>typeof text==='string'&&!!text.trim()&&!/^\s*(?:[\[{]|"[^"\n]+"\s*:)/.test(text);
