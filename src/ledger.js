export const GENESIS='0'.repeat(64);
export function canonical(value){
  if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';
  if(value&&typeof value==='object')return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k])).join(',')+'}';
  return JSON.stringify(value);
}
export async function entryHash(entry){
  const {hash,...payload}=entry;
  const bytes=new TextEncoder().encode(canonical(payload));
  const digest=await globalThis.crypto.subtle.digest('SHA-256',bytes);
  return [...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('');
}
export async function appendEntry(entries,actor,action,diff){
  const entry={id:entries.length+1,prevHash:entries.at(-1)?.hash??GENESIS,actor,action,time:new Date().toISOString(),diff:structuredClone(diff)};
  entry.hash=await entryHash(entry);entries.push(entry);return entry;
}
export async function verifyChain(entries){
  let prev=GENESIS;
  for(let i=0;i<entries.length;i++){const entry=entries[i];if(entry.id!==i+1||entry.prevHash!==prev||entry.hash!==await entryHash(entry))return {valid:false,index:i,count:entries.length};prev=entry.hash;}
  return {valid:true,count:entries.length};
}
