// One vector illustration per scene, rendered into both Page SVG and the 3D atlas.
// These are invented educational illustrations, never archival photographs.
const palette=['#194650','#386454','#806244','#455373','#68634d','#536e65'];
const rect=(fill,x,y,w,h)=>({kind:'rect',fill,x,y,w,h});
const ellipse=(fill,x,y,rx,ry)=>({kind:'ellipse',fill,x,y,rx,ry});
const path=(fill,d)=>({kind:'path',fill,d});
function person(x,y,color='#e5c7a3'){
 return [ellipse(color,x,y,12,12),path(color,`M${x-12} ${y+19}h24l8 54h-40Z`),path('#243f43',`M${x-11} ${y+73}h9l-6 36h-10ZM${x+2} ${y+73}h9l12 36h-10Z`)];
}
function scene(index){
 const i=((index%6)+6)%6;
 const shapes=[rect(palette[i],0,0,720,440),ellipse('#e4c68e',565,84,39,39),path('#537e73','M0 235 140 145 250 240 390 135 720 225V440H0Z'),rect('#889c82',0,292,720,148)];
 if(i===0){
  shapes.push(path('#b6b39c','M180 440 350 200 380 200 560 440Z'),path('#f2dcb4','M354 315h7l-5 32h-9ZM343 366h9l-11 45h-12Z'));
  for(const [x,y] of [[86,114],[630,136]])shapes.push(rect('#b99b73',x-8,y,16,205),ellipse('#355f50',x,y,139,59),ellipse('#70937a',x+25,y-17,109,42));
  shapes.push(rect('#d8c49e',324,242,103,54),rect('#224752',333,251,85,20),ellipse('#24383d',344,299,10,10),ellipse('#24383d',408,299,10,10));
 }else if(i===1){
  shapes.push(rect('#b7a47e',145,144,330,15),path('#d8c6a0','M128 144 194 107H447L492 144Z'),rect('#c7b795',159,159,10,161),rect('#c7b795',452,159,10,161),rect('#d6bc91',190,265,238,12),rect('#426258',204,277,9,42),rect('#426258',407,277,9,42),rect('#bba67f',537,168,8,159),rect('#e1d2ac',512,126,58,50),...person(486,226));
 }else if(i===2){
  shapes.push(path('#c5b79d','M0 335 720 275V440H0Z'));
  for(const [x,y,c] of [[228,215,'#e2c399'],[322,193,'#afccb4'],[414,209,'#e8d6b1'],[508,197,'#c9ae85']])shapes.push(...person(x,y,c));
 }else if(i===3){
  shapes.push(rect('#c5ac84',175,257,365,25),rect('#d6bb90',200,282,14,78),rect('#d6bb90',497,282,14,78));
  for(const x of [230,330,425])shapes.push(rect('#efe3bc',x,227,68,28),rect('#5a7e79',x+5,233,55,4),rect('#5a7e79',x+5,243,39,3));
  shapes.push(rect('#c3ab83',139,282,40,15),rect('#c3ab83',544,282,40,15));
 }else if(i===4){
  shapes.push(rect('#254c4d',120,98,186,186),rect('#a3bb9e',131,109,164,164),rect('#365c53',208,109,10,164),rect('#365c53',131,185,164,10),rect('#b69c75',95,321,540,18));
  shapes.push(path('#eee2bb','M167 236Q260 215 350 253V329Q253 290 167 310Z'),path('#ded1a8','M350 253Q440 215 532 236V310Q440 290 350 329Z'));
  for(let y=258;y<302;y+=12){shapes.push(rect('#798b79',191,y,122,3),rect('#798b79',386,y,122,3));}
  shapes.push(rect('#65887c',555,213,20,108),rect('#d0bc91',579,199,22,122));
 }else{
  for(const [x,y,w] of [[58,241,76],[145,203,92],[250,252,70],[336,170,70],[418,223,91],[526,246,57],[595,206,70]]){
   shapes.push(rect('#b8bca1',x,y,w,132));
   for(let a=x+12;a<x+w-9;a+=23)for(let b=y+15;b<340;b+=26)shapes.push(rect('#426b65',a,b,10,12));
  }
  shapes.push(path('#d7bd91','M321 170 370 127 421 170Z'),path('#749681','M0 361Q140 309 280 356T720 349V440H0Z'));
 }
 return shapes;
}
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function artSVG(index=0,title='Generated sample'){
 const shapes=scene(index).map(s=>s.kind==='rect'?`<rect x="${s.x}" y="${s.y}" width="${s.w}" height="${s.h}" fill="${s.fill}"/>`:s.kind==='ellipse'?`<ellipse cx="${s.x}" cy="${s.y}" rx="${s.rx}" ry="${s.ry}" fill="${s.fill}"/>`:`<path d="${s.d}" fill="${s.fill}"/>`).join('');
 return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 720 440">${shapes}<rect y="378" width="720" height="62" fill="#102d36"/><text x="28" y="407" font-family="Georgia,serif" font-size="23" fill="#f6e6c9">${escape(title)}</text><text x="28" y="429" font-family="sans-serif" font-size="12" letter-spacing="2" fill="#c2d7cb">GENERATED SAMPLE · NOT ARCHIVAL MEDIA</text></svg>`;
}
export const artURL=(index,title)=>'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(artSVG(index,title));
export function drawArt(ctx,index,x=0,y=0,w=512,h=320){
 ctx.save();ctx.translate(x,y);ctx.scale(w/720,h/440);
 for(const s of scene(index)){
  ctx.fillStyle=s.fill;
  if(s.kind==='rect')ctx.fillRect(s.x,s.y,s.w,s.h);
  else if(s.kind==='ellipse'){ctx.beginPath();ctx.ellipse(s.x,s.y,s.rx,s.ry,0,0,Math.PI*2);ctx.fill();}
  else ctx.fill(new Path2D(s.d));
 }
 ctx.restore();
}
