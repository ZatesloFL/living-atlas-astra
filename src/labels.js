import * as THREE from '../vendor/three/three.module.min.js';
// Projected nameplates stay crisp regardless of render resolution. They face the
// camera, but never reveal rooms that were omitted from the current world.
export class WorldLabels {
  constructor(root){this.root=root;this.world=null;this.entries=[];this.visible=[];this.projected=new THREE.Vector3();}
  update(world,camera){
    if(this.world!==world||this.width!==innerWidth){
      this.world=world;this.width=innerWidth;this.compact=Math.min(innerWidth,innerHeight)<=600;this.root.replaceChildren();
      this.entries=world.labels.map(label=>{
        const el=document.createElement('div');el.className='world-sign';el.dataset.room=label.id||'';
        const title=document.createElement('strong'),sub=document.createElement('small');title.textContent=label.title;sub.textContent=label.sub;
        el.append(title,sub);el.style.setProperty('--sign-color',label.color||'#bfe9d9');el.style.width=`${this.compact?Math.min(172,Math.max(126,label.title.length*6.1+20)):Math.min(224,Math.max(160,label.title.length*7.4+26))}px`;
        this.root.append(el);return {...label,el,width:parseFloat(el.style.width),height:this.compact?46:72};
      });
    }
    const w=innerWidth,h=innerHeight,top=(h<w?88:136)+(document.body.classList.contains('test-active')?28:0);this.visible=[];const anchors=[];
    const blocked=[{x:0,y:0,w,h:top},{x:0,y:h-240,w:150,h:240},{x:0,y:h-80,w,h:80}];
    const overlaps=(a,b)=>a.x<b.x+b.w+6&&a.x+a.w>b.x-6&&a.y<b.y+b.h+6&&a.y+a.h>b.y-6;
    camera.updateMatrixWorld();
    const candidates=this.entries.map(e=>({e,d:e.position.distanceTo(camera.position)})).sort((a,b)=>a.d-b.d);
    for(const {e,d} of candidates){
      e.el.hidden=true;if(d>(this.compact?24:27)||this.visible.length>=(this.compact?3:5)||anchors.some(p=>p.distanceToSquared(e.position)<2.25))continue;
      this.projected.copy(e.position).project(camera);
      if(this.projected.z>1||this.projected.z< -1||Math.abs(this.projected.x)>1.13||Math.abs(this.projected.y)>1.15)continue;
      const px=(this.projected.x+1)*w/2,py=(1-this.projected.y)*h/2;
      let rect=null;for(const dy of (this.compact?[-22,30,-74]:[-28,-88,32,-148])){
        const r={x:Math.max(10,Math.min(w-e.width-10,px-e.width/2)),y:py+dy,w:e.width,h:e.height};
        if(r.y<top||r.y+r.h>h-82||blocked.some(b=>overlaps(r,b)))continue;
        rect=r;break;
      }
      if(!rect)continue;
      e.el.style.transform=`translate3d(${Math.round(rect.x)}px,${Math.round(rect.y)}px,0)`;e.el.hidden=false;e.el.style.opacity=String(1-THREE.MathUtils.smoothstep(d,8,this.compact?24:27)*.8);anchors.push(e.position);
      blocked.push(rect);this.visible.push({...rect,id:e.id});
    }
  }
  pick(x,y){return this.visible.find(r=>x>=r.x&&x<=r.x+r.w&&y>=r.y&&y<=r.y+r.h)?.id;}
}
