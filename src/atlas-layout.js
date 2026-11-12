export const positions={studio:[130,360],commons:[330,360],market:[330,260],night:[330,475],broadcast:[130,475],listening:[130,580],lab:[260,570],tallahassee:[130,220],canopy:[130,125],capitol:[90,45],mission:[270,120],boycott:[355,190],cascades:[355,45],workbench:[45,290],family:[45,405]};
export const mapTitles={studio:'Studio',tallahassee:'Tallahassee',canopy:'Canopy',capitol:'Capitols',mission:'San Luis',boycott:'1956',cascades:'Cascades',commons:'Commons',market:'Night Market',night:'After Dark',broadcast:'Broadcast',listening:'Listening',lab:'Lab window',workbench:'Workbench',family:'Private'};
export function layoutAtlasLabels(){
  const nodes=Object.entries(positions),used=[],result={};
  const overlap=(a,b)=>a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y;
  for(const [id,[x,y]] of nodes){
    const w=mapTitles[id].length*6.7+14,h=22;
    const options=[{x:x-w/2,y:y+25},{x:x-w/2,y:y-47},{x:x+27,y:y-11},{x:x-w-27,y:y-11}];
    const r=options.map(p=>({...p,w,h})).find(r=>r.x>=6&&r.x+r.w<=434&&r.y>=4&&r.y+r.h<=650&&!nodes.some(([,p])=>overlap(r,{x:p[0]-22,y:p[1]-22,w:44,h:44}))&&!used.some(p=>overlap(r,p)));
    if(!r)throw new Error('No clear map label position: '+id);
    used.push(r);result[id]=r;
  }
  return result;
}
