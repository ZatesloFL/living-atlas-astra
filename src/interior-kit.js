// Spatial data only. An interior reuses its Place, content, grants and readers.
export function defineInterior(spec){
 const s=structuredClone(spec),finite=p=>Array.isArray(p)&&p.length===2&&p.every(Number.isFinite);
 if(s.kind!=='exhibit-hall'||!/^hall:[a-z0-9-]+$/.test(s.scene)||!s.parent||!s.edge)throw new Error('Invalid interior identity');
 if(!(s.width>=12&&s.width<=24&&s.depth>=16&&s.depth<=32&&s.height>=4&&s.height<=6))throw new Error('Interior shell outside kit bounds');
 const inside=p=>finite(p)&&Math.abs(p[0])<s.width/2-.3&&Math.abs(p[1])<s.depth/2-.3;
 const f=s.frontage;if(!(f.width>=4&&f.width<=10&&f.height>=3.5&&f.height<=6&&f.depth>=3&&f.depth<=8))throw new Error('Frontage outside kit bounds');
 if(!inside(s.arrival.position)||!Number.isFinite(s.arrival.facing)||!finite(s.exit)||!finite(s.frontage.door)||!finite(s.frontage.outside)||!finite(s.frontage.arrival))throw new Error('Invalid interior arrival');
 if(!Array.isArray(s.bays)||s.bays.length>8||new Set(s.bays.map(b=>b.block)).size!==s.bays.length)throw new Error('Invalid interior bays');
 for(const b of s.bays)if(!b.block||!inside(b.position)||!inside(b.approach)||!Number.isFinite(b.facing)||!Array.isArray(b.label)||b.label.length!==3||!b.label.every(Number.isFinite)||Math.abs(b.label[0])>s.width/2||Math.abs(b.label[2])>s.depth/2||b.label[1]<.5||b.label[1]>s.height-.2)throw new Error('Invalid exhibit bay');
 for(const wall of s.partitions??[])if(!inside(wall.position)||!finite(wall.size)||wall.size.some(n=>n<=0||n>s.width/2))throw new Error('Invalid interior partition');
 return s;
}
export function exhibitSpace(room,styleScale=1){
 const h=room.layout.interior;if(!h)return {...room.layout,scale:(room.layout.scale??1)*styleScale};
 // Fixture size follows Style; the wall/bay centers do not drift or crowd the aisle.
 return {...room.layout,scene:h.scene,slot:[0,0],facing:0,scale:styleScale,approach:h.arrival.position,sign:false,
  components:h.bays.map(b=>({block:b.block,position:b.position.map(n=>n/styleScale),facing:b.facing}))};
}
