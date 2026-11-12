export const LOOKS={Studio:{accent:'#65ddcf',mix:0},Documentary:{accent:'#cbb78e',mix:.28},Gallery:{accent:'#9cbbef',mix:.35},Kids:{accent:'#efbd59',mix:.5}};
export function itemStyle(room,lens){
 const control=room.styleControl??'open',pref=lens.itemStyles?.[room.id]??{},allowed=room.approvedLooks??Object.keys(LOOKS);
 let preset=pref.preset??lens.stylePreset??'Studio';if(control==='fixed')preset=room.authorLook??allowed[0];else if(control==='authorLooks'&&!allowed.includes(preset))preset=room.authorLook??allowed[0];if(!LOOKS[preset])preset='Studio';
 return {control,preset,...LOOKS[preset],accent:control==='open'&&/^#[0-9a-f]{6}$/i.test(pref.color)?pref.color:LOOKS[preset].accent,mix:control==='open'&&/^#[0-9a-f]{6}$/i.test(pref.color??'') ? .28 : LOOKS[preset].mix,scale:control==='open'?Math.max(.7,Math.min(1.25,Number(pref.scale)||1)):1};
}
export const styleLabel=room=>({fixed:'Fixed · author’s presentation',authorLooks:'Author’s looks · approved styles only',open:'Open · restyle your own view'})[room.styleControl??'open'];
