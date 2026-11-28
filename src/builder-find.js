import {EDGES,ROOMS} from './data.js';
import {roomEntry} from './content.js';
import {visibleEdge} from './rules.js';
import {thingSubject,thingTitle} from './thing-subject.js';

function enteredPublicationRoom(world,roomKey){
  const parent=ROOMS[roomKey];
  if(!parent?.layout||world?.builderView?.roomKey||world?.kind!==(parent.layout.interior?.scene??parent.layout.scene))return null;
  const lens=world.lens;
  const entry=roomEntry(roomKey,lens,EDGES);
  if(lens.preview||entry.state==='hidden'||entry.type==='window'||!entry.rights?.canEnter||entry.admission?.blocked)return null;
  return parent;
}

function findPiece(world,roomKey,parent,piece){
  const {id:pieceId}=piece,lens=world.lens;
  if(piece.kind==='interior-shell') {
    const placeId=piece.ref?.placeId,room=ROOMS[placeId],interior=room?.layout?.interior;
    if(room?.builderStructure?.pieceId!==pieceId||interior?.parent!==roomKey||room.layout.scene!==world.kind)return null;
    if(!world.renderedRooms.some(record=>record.id===placeId&&record.frontage&&!record.draft))return null;
    const edge=world.edgeObjects.find(item=>item.id===interior.edge&&item.interior===placeId);
    const gate=edge&&visibleEdge(edge,lens);
    if(!gate?.rights?.canLook||gate.state==='hidden')return null;
    return {kind:'hall',roomKey,pieceId,placeId,title:room.title,position:interior.frontage.arrival.slice()};
  }
  if(piece.ref?.placeId===parent.id&&piece.ref.thingId) {
    const blockId=piece.ref.thingId,marker='exhibit:'+roomKey+':'+blockId;
    if(!parent.blocks.some(block=>block.id===blockId&&block.publishedAt)||world.draftSubjects.has(marker))return null;
    const subject=thingSubject(roomKey,blockId,lens),frame=subject&&world.thingFrame(roomKey,blockId);
    if(!frame)return null;
    const [x,z]=frame.face?[frame.face.point[0],frame.face.point[2]]:frame.slot;
    return {kind:piece.kind==='sign'?'sign':'thing',roomKey,pieceId,blockId,title:thingTitle(subject.block),position:[x,z]};
  }
  return null;
}

// Resolve against the published catalog and actual Visit geometry, never the sketch.
export function publishedPieceInWorld(world, roomKey, pieceId) {
  const parent=enteredPublicationRoom(world,roomKey),piece=parent?.kitPieces?.find(item=>item.id===pieceId);
  return piece?findPiece(world,roomKey,parent,piece):null;
}

export function publishedPiecesInWorld(world,roomKey){
  const parent=enteredPublicationRoom(world,roomKey);
  return (parent?.kitPieces??[]).map(piece=>findPiece(world,roomKey,parent,piece)).filter(Boolean);
}
