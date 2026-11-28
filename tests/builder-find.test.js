import test from 'node:test';
import assert from 'node:assert/strict';
import {publishedPieceInWorld,publishedPiecesInWorld} from '../src/builder-find.js';
import {EDGES,PRESETS,ROOMS} from '../src/data.js';
import {scores} from '../src/scores.js';

test('Finding published work requires a drawn subject in the entered Place and its current Lens',()=>{
  const roomKey='builder-find-fixture',placeId=roomKey+'/hall-lantern';
  const edge={id:placeId+'/door',from:roomKey,to:placeId,interior:placeId,type:'door'};
  const sign={id:'gate-sign',title:'Gate sign',type:'text',importance:'core',content:scores(),publishedAt:'2026-11-28T00:00:00Z'};
  const parent={id:roomKey,visibility:'public',content:scores(),layout:{scene:roomKey},
    blocks:[sign,{...sign,id:'seed-label',publishedAt:undefined}],kitPieces:[
      {id:'lantern',kind:'interior-shell',ref:{placeId}},
      {id:sign.id,kind:'sign',ref:{placeId:roomKey,thingId:sign.id}},
      {id:'seed-label',kind:'sign',ref:{placeId:roomKey,thingId:'seed-label'}},
    ]};
  ROOMS[roomKey]=parent;
  ROOMS[placeId]={id:placeId,parentPlaceId:roomKey,builderStructure:{pieceId:'lantern'},
    title:'Lantern hall',visibility:'public',content:scores(),layout:{scene:roomKey,
      interior:{parent:roomKey,edge:edge.id,frontage:{arrival:[8,4]}}}};
  EDGES.push(edge);
  const world={kind:roomKey,lens:{...structuredClone(PRESETS.Adult),profileId:'find-work-visitor',show:{}},
    edgeObjects:[edge],draftSubjects:new Map(),renderedRooms:[{id:placeId,frontage:true}],
    thingFrame:()=>({face:{point:[-3,1.1,2]}})};
  try{
    assert.deepEqual(publishedPiecesInWorld(world,roomKey),[
      {kind:'hall',roomKey,pieceId:'lantern',placeId,title:'Lantern hall',position:[8,4]},
      {kind:'sign',roomKey,pieceId:sign.id,blockId:sign.id,title:'Gate sign',position:[-3,2]},
    ]);
    assert.equal(publishedPieceInWorld({...world,kind:'square'},roomKey,sign.id),null);
    assert.equal(publishedPieceInWorld({...world,builderView:{roomKey}},roomKey,sign.id),null);
    assert.equal(publishedPieceInWorld({...world,renderedRooms:[]},roomKey,'lantern'),null);
    assert.equal(publishedPieceInWorld({...world,edgeObjects:[]},roomKey,'lantern'),null);

    world.draftSubjects.set('exhibit:'+roomKey+':'+sign.id,{});
    assert.equal(publishedPieceInWorld(world,roomKey,sign.id),null);
    world.draftSubjects.clear();
    sign.content=scores({violence:{amount:3,graphicness:3}});
    world.lens.hard.violence={amount:0,graphicness:0};
    assert.equal(publishedPieceInWorld(world,roomKey,sign.id),null);
    parent.visibility='hidden';
    assert.deepEqual(publishedPiecesInWorld(world,roomKey),[]);
  }finally{
    EDGES.pop();
    delete ROOMS[placeId];
    delete ROOMS[roomKey];
  }
});
