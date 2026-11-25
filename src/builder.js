import {ROOMS, EDGES} from './data.js';
import {permission, personId, visibilityOf} from './permissions.js';
import {roomEntry, selectContent, blockNeedsPreview} from './content.js';
import {viewRoom} from './audience.js';
import {containingPlaces} from './admission.js';
import {appendEntry, canonical, verifyChain} from './ledger.js';
import {validateScores} from './standing-records.js';
import {scores} from './scores.js';
import {LOOKS} from './item-style.js';
import {makeSourcePiece, sourcedRoom} from './source-catalog.js';
import {composeBuilderRoom, withBuilderRoom} from './build-projection.js';
import {BUILDER_DRAW_CEILING, BUILDER_PIECES, builderPieceCost, makeBuilderPiece, snapBuilderPosition, validateBuilderPiece} from './builder-pieces.js';
import {builderPublication, builderPublications, builderSubject, stampBuilderProvenance, submissionFor} from './builder-provenance.js';
import {AtlasRecords} from './atlas-records.js';

export const BUILDER_STORAGE = 'living-atlas.builder.v1';
export const ROOM_BUDGET = Object.freeze({instances:80,atlasTiles:12,liveTextures:2,drawCalls:BUILDER_DRAW_CEILING,behaviors:16});
const copy = value => structuredClone(value);
const id = () => 'kit-' + crypto.randomUUID();
const same = (a,b) => canonical(a) === canonical(b);
const receiptView = receipt => ({id:'builder:'+receipt.hash, time:receipt.time, action:receipt.action, actor:receipt.actor});
const storageDefault = () => globalThis.localStorage;
const empty = () => ({drafts:{},receipts:[]});
const authoredBases = new WeakMap();

function publicContainment(roomKey,lens,rooms,host) {
  const chain = containingPlaces(roomKey,rooms,host);
  return !lens.standingInvalid && !!chain?.length && chain.every(key=>visibilityOf(rooms[key],lens)==='public');
}

function claimedRooms(starter) {
  const authored = new Map(starter.changes.filter(change=>change?.op==='create' && change.kind==='Place' && change.ref?.placeId)
    .map(change=>[change.ref.placeId,change.fields]));
  return Object.fromEntries(starter.projection.rooms.filter(room=>authored.has(room?.placeId)).map(room=>
    [room.placeId,{visibility:'hidden',...authored.get(room.placeId),id:room.placeId,parentPlaceId:room.parentPlaceId}]));
}

function placePosition(pieces) {
  const offsets = [[-3,1],[3,1],[-3,-2],[3,-2],[0,-3],[-4,4],[4,4],[0,4],[6,0],[-6,0],[0,-6],[0,6]];
  const point = offsets.find(([x,z]) => pieces.every(piece => {
    const [px,,pz] = piece.transform.position;
    return Math.hypot(x-px,z-pz) > 2;
  })) ?? [0,0];
  return [point[0],0,point[1]];
}

function boundedText(value, maximum, label) {
  if (typeof value !== 'string' || value.length > maximum || !value.trim()) throw new Error(label);
  return value.trim();
}

function normalizePieces(pieces, room) {
  if (!Array.isArray(pieces) || pieces.length > 80) throw new Error('This draft has too many pieces.');
  const identifiers = new Set();
  for (const piece of pieces) {
    validateBuilderPiece(piece,{placeId:room.id});
    if (!piece.block || piece.block.id !== piece.id || identifiers.has(piece.id)) throw new Error('A draft piece must have its own Thing.');
    piece.block.title = boundedText(piece.block.title,120,'Give the Thing a title up to 120 characters.');
    validateScores(piece.block.content);
    identifiers.add(piece.id);
  }
  return pieces;
}

function estimate(base, pieces) {
  const cost = Object.fromEntries(Object.keys(ROOM_BUDGET).map(key=>[key,0]));
  // Existing exhibits contribute to the same room envelope.
  for (const block of base.blocks ?? []) {
    if (!block.exhibit || !BUILDER_PIECES[block.exhibit.kind]) continue;
    const use = builderPieceCost(block.exhibit);
    for (const key of Object.keys(cost)) cost[key] += use[key];
  }
  for (const piece of pieces) {
    const use = builderPieceCost(piece);
    for (const key of Object.keys(cost)) cost[key] += use[key];
  }
  const over = Object.entries(cost).filter(([key,actual])=>actual>ROOM_BUDGET[key])
    .map(([key,actual])=>({key,actual,limit:ROOM_BUDGET[key]}));
  return {cost,limit:ROOM_BUDGET,over,valid:!over.length};
}

export class Builder {
  constructor({storage=storageDefault,onPublish=()=>{},atlasRecords=new AtlasRecords(storage)}={}) {
    this.storage = storage;
    this.onPublish = onPublish;
    this.atlasRecords = atlasRecords;
    this.base = new Map();
    this.data = empty();
    this.queue = Promise.resolve();
    this.warning = '';
    try {
      this.raw = storage()?.getItem(BUILDER_STORAGE) ?? null;
      if (this.raw) {
        const saved = JSON.parse(this.raw);
        if (saved.version!==1 || !Array.isArray(saved.receipts) || !saved.drafts || Array.isArray(saved.drafts)) throw new Error('Invalid Builder records');
        this.data = {receipts:saved.receipts,drafts:saved.drafts};
      }
    } catch {
      this.invalid = true;
      this.warning = 'Saved Builder records need recovery.';
    }
    this.ready = verifyChain(this.data.receipts).then(({valid})=>!(this.invalid ||= !valid)).catch(()=>!(this.invalid=true));
  }

  owner(roomKey,lens) {
    const room = Object.hasOwn(ROOMS,roomKey) ? ROOMS[roomKey] : null;
    if (!room?.ownerId || !room.layout || !lens || lens.isAgent || lens.preview || room.ownerId!==personId(lens)) {
      throw new Error('Build is available to the Place owner.');
    }
    if (!this.base.has(roomKey)) this.base.set(roomKey,copy(authoredBases.get(room)??room));
    return room;
  }

  published(data,roomKey,ownerId) {
    return data.receipts.filter(receipt=>receipt.actor===ownerId && receipt.diff.roomKey===roomKey && receipt.action==='build_published');
  }

  current(data,roomKey,room) {
    const version = this.published(data,roomKey,room.ownerId).at(-1);
    return data.drafts[roomKey] ?? {
      ownerId:room.ownerId, baseVersion:version?.diff.revisionId??null, pieces:version?.diff.pieces??[],
      undo:[],redo:[],preview:null,proposals:[]
    };
  }

  snapshot(data,roomKey,room) {
    const head = this.published(data,roomKey,room.ownerId).at(-1);
    const edit = this.current(data,roomKey,room), basePieces = head?.diff.pieces??[];
    return copy({
      roomKey,ownerId:room.ownerId,title:room.title,baseVersion:edit.baseVersion,
      basePieces,pieces:edit.pieces,preview:edit.preview,
      dirty:!same(edit.pieces,basePieces),
      canUndo:edit.undo.length>0,canRedo:edit.redo.length>0,proposals:edit.proposals
    });
  }

  open(roomKey,lens) {
    if (this.invalid) throw new Error(this.warning || 'Builder Receipts failed verification.');
    return this.snapshot(this.data,roomKey,this.owner(roomKey,lens));
  }

  list(lens) {
    if (!lens || lens.isAgent || lens.preview) return [];
    return Object.entries(ROOMS).filter(([,room])=>room.ownerId===personId(lens) && room.layout)
      .map(([roomKey,room])=>({roomKey,title:room.title,dirty:this.snapshot(this.data,roomKey,room).dirty}));
  }

  write(roomKey,operation) {
    const write = async () => {
      if (!await this.ready) throw new Error(this.warning || 'Builder Receipts failed verification.');
      const data = copy(this.data);
      const result = await operation(data);
      const serialized = JSON.stringify({version:1,...data});
      const storage = this.storage();
      if (!storage) throw new Error('Builder needs browser storage to keep this change.');
      if ((storage.getItem(BUILDER_STORAGE)??null)!==this.raw) throw new Error('Builder changed in another tab. Reload to continue.');
      storage.setItem(BUILDER_STORAGE,serialized);
      this.raw = serialized;
      this.data = data;
      if(result.projected) {
        const base = this.base.get(roomKey)??authoredBases.get(ROOMS[roomKey]);
        if (base) authoredBases.set(result.projected,base);
        ROOMS[roomKey]=result.projected;
      }
      return result;
    };
    const task = this.queue.then(()=>globalThis.navigator?.locks
      ? navigator.locks.request(BUILDER_STORAGE,write) : write());
    this.queue = task.catch(()=>{});
    return task;
  }

  transaction(roomKey,lens,operation) {
    return this.write(roomKey,data=>{
      const room = this.owner(roomKey,lens);
      const draft = data.drafts[roomKey] ??= copy(this.current(data,roomKey,room));
      if (draft.ownerId!==room.ownerId) throw new Error('This draft belongs to another owner.');
      return operation({data,draft,room,base:this.base.get(roomKey)});
    });
  }

  edit(roomKey,lens,transform) {
    return this.transaction(roomKey,lens,({data,draft,room})=>{
      const before = copy(draft.pieces);
      transform(draft,room);
      normalizePieces(draft.pieces,room);
      if (!same(before,draft.pieces)) {
        draft.undo.push(before);
        if(draft.undo.length>20)draft.undo.shift();
        draft.redo=[];
        draft.preview=null;
      }
      return this.snapshot(data,roomKey,room);
    });
  }

  newPiece(draft,room,kind,options={}) {
    if (!['Thing','Place'].includes(BUILDER_PIECES[kind]?.recordKind)) throw new Error('Choose a furnishing from the kit.');
    const requested = options.position ?? placePosition(draft.pieces);
    const position = Array.isArray(requested) ? requested : [requested.x,0,requested.z];
    const piece = makeBuilderPiece(kind,{...options,placeId:room.id,id:id(),position:snapBuilderPosition(position)});
    piece.block??={id:piece.id,title:piece.settings.title,type:'text',importance:'core',body:piece.settings.title,
      content:scores(),backing_ref:null,sources:[]};
    if (options.label) piece.block.title = options.label;
    draft.pieces.push(piece);
    return piece;
  }

  add(roomKey,lens,kind,options) { return this.edit(roomKey,lens,(draft,room)=>this.newPiece(draft,room,kind,options)); }

  placeSource(roomKey,lens,reference,position=null) {
    return this.edit(roomKey,lens,(draft,room)=>{
      const placed=this.prospectiveSourcePiece(room,lens,draft.pieces,reference,position);
      if(!draft.pieces.some(piece=>piece.kind===placed.kind&&piece.ref?.thingId===placed.ref.thingId))draft.pieces.push(placed);
    });
  }

  previewSource(roomKey,lens,reference,position) {
    const draft=this.open(roomKey,lens),room=ROOMS[roomKey];
    const existing=makeSourcePiece(room,lens,reference,{id:id(),position:position??[0,0,0]});
    if(draft.pieces.some(piece=>piece.kind===existing.kind&&piece.ref?.thingId===existing.ref.thingId)){
      throw new Error('That source already has a place in this draft. Move it from the inspector.');
    }
    const piece=this.prospectiveSourcePiece(room,lens,draft.pieces,reference,position);
    return {draft:{...draft,pieces:[...draft.pieces,piece]},piece};
  }

  prospectiveSourcePiece(room,lens,pieces,reference,position) {
    const occupied=[...pieces.map(piece=>piece.transform.position),
      ...(sourcedRoom(room,lens).sourcePlacements??[]).map(piece=>[piece.position[0],0,piece.position[1]])];
    let local=position;
    if(!local){
      for(let index=0;index<21;index++){
        const x=((index%3)-1)*2.9,z=-Math.floor(index/3)*2.8-1.5;
        if(occupied.every(([px,,pz])=>Math.hypot(px-x,pz-z)>1.7)){local=[x,0,z];break;}
      }
    }
    if(!local)throw new Error('Move a piece to make room on the source shelves.');
    return makeSourcePiece(room,lens,reference,{id:id(),position:local});
  }

  update(roomKey,lens,pieceId,patch) {
    return this.edit(roomKey,lens,draft=>{
      const piece = draft.pieces.find(item=>item.id===pieceId);
      if (!piece) throw new Error('Choose a piece in this draft.');
      if (patch.transform) {
        piece.transform = {...piece.transform,...patch.transform};
        piece.transform.position = snapBuilderPosition(piece.transform.position);
      }
      if(piece.kind.startsWith('hosted-'))return;
      if (patch.settings) piece.settings={...piece.settings,...patch.settings};
      if (patch.behaviors) piece.behaviors=copy(patch.behaviors);
      if (patch.block) {
        for (const key of ['title','content','body']) if (Object.hasOwn(patch.block,key)) piece.block[key]=copy(patch.block[key]);
        if(Object.hasOwn(patch.block,'style')) {
          const preset=patch.block.style?.preset;
          if(preset==null){delete piece.block.style;delete piece.block.authorLook;delete piece.block.styleControl;}
          else {
            if(!Object.hasOwn(LOOKS,preset))throw new Error('Choose a presentation preset.');
            Object.assign(piece.block,{style:{preset},authorLook:preset,styleControl:'fixed'});
          }
        }
        if (patch.block.title && piece.settings.title) piece.settings.title=patch.block.title;
        if (typeof piece.block.body!=='string' || piece.block.body.length>6000) throw new Error('Keep the text within 6,000 characters.');
      }
    });
  }

  remove(roomKey,lens,pieceId) {
    return this.edit(roomKey,lens,draft=>{draft.pieces=draft.pieces.filter(item=>item.id!==pieceId);});
  }

  duplicate(roomKey,lens,pieceId) {
    return this.edit(roomKey,lens,(draft,room)=>{
      const original=draft.pieces.find(item=>item.id===pieceId);
      if(!original)throw new Error('Choose a piece in this draft.');
      const piece=copy(original);
      piece.id=piece.block.id=id();
      if(!piece.kind.startsWith('hosted-'))piece.ref=BUILDER_PIECES[piece.kind].recordKind==='Place'?{placeId:room.id}:{placeId:room.id,thingId:piece.id};
      piece.transform.position=placePosition(draft.pieces);
      draft.pieces.push(piece);
    });
  }

  undo(roomKey,lens) { return this.swap(roomKey,lens,'undo','redo'); }
  redo(roomKey,lens) { return this.swap(roomKey,lens,'redo','undo'); }
  swap(roomKey,lens,from,to) {
    return this.transaction(roomKey,lens,({data,draft,room})=>{
      if(draft[from].length) {
        draft[to].push(draft.pieces);
        draft.pieces=draft[from].pop();
        draft.preview=null;
      }
      return this.snapshot(data,roomKey,room);
    });
  }

  async propose(roomKey,lens,request) {
    const text = boundedText(request,260,'Tell the Atlas what you want to place or tune.');
    const room=this.owner(roomKey,lens);
    await this.atlasRecords.requireInitiative(lens,'build','suggest',{requested:true});
    const draft=this.open(roomKey,lens);
    const wanted=Object.values(BUILDER_PIECES).find(def=>['Thing','Place'].includes(def.recordKind)&&text.toLowerCase().includes(def.label.toLowerCase()));
    const tuning=/^move (?:the )?(.+?) (left|right|forward|back)\.?$/i.exec(text);
    const piece=tuning&&draft.pieces.find(p=>p.block.title.toLowerCase()===tuning[1].toLowerCase());
    if(tuning&&!piece)throw new Error('That Thing is no longer in this draft.');
    if(!wanted&&!piece)throw new Error('Try “Place a bench” or “Move the bench left”.');
    const direction=tuning?.[2].toLowerCase();
    const move={left:[-1,0],right:[1,0],forward:[0,-1],back:[0,1]}[direction];
    const change=piece?{pieceId:piece.id,move}:{kind:wanted.kind};
    const summary=piece?'Move '+piece.block.title+' '+direction+' by one metre.':'Place '+wanted.label.toLowerCase()+' in the draft.';
    const proposal=await this.atlasRecords.proposeExtension(lens,{
      area:'build',action:piece?'move-piece':'place-piece',placeId:room.id,payload:change
    },text,{requested:true});
    return {id:proposal.id,text,summary,status:'pending',change,receiptId:proposal.receipt};
  }

  async decide(roomKey,lens,proposalId,keep) {
    const room=this.owner(roomKey,lens);
    const proposal=this.atlasRecords.state(lens).proposals.find(p=>p.id===proposalId&&p.status==='proposal'&&
      p.value.kind==='extension'&&p.value.area==='build'&&p.value.placeId===room.id);
    if(!proposal)throw new Error('This proposal is no longer pending for this Place.');
    if(!keep){await this.atlasRecords.decline(lens,proposalId);return this.open(roomKey,lens);}
    await this.atlasRecords.confirm(lens,proposalId,(value,refs)=>this.transaction(roomKey,lens,async({data,draft,room})=>{
        const change=await this.atlasRecords.verifyExtension(lens,{area:'build',action:value.action,placeId:room.id,...refs});
        draft.undo.push(copy(draft.pieces));
        if(draft.undo.length>20)draft.undo.shift();
        draft.redo=[];
        draft.preview=null;
        if(change.kind)this.newPiece(draft,room,change.kind);
        else{
          const piece=draft.pieces.find(p=>p.id===change.pieceId);
          if(!piece)throw new Error('The proposed Thing is no longer in the draft.');
          const [x,y,z]=piece.transform.position,[dx,dz]=change.move;
          piece.transform.position=snapBuilderPosition([x+dx,y,z+dz]);
        }
        normalizePieces(draft.pieces,room);
        const receipt=await appendEntry(data.receipts,room.ownerId,'build_proposal_accepted',{roomKey,proposalId,...refs});
        return {receiptId:receiptView(receipt).id};
    }));
    return this.open(roomKey,lens);
  }
  accept(roomKey,lens,proposalId) { return this.decide(roomKey,lens,proposalId,true); }
  reject(roomKey,lens,proposalId) { return this.decide(roomKey,lens,proposalId,false); }

  roomFor(roomKey,lens,draft=this.open(roomKey,lens)) {
    const room=this.owner(roomKey,lens);
    return composeBuilderRoom(this.base.get(roomKey),normalizePieces(copy(draft.pieces),room));
  }

  preview(roomKey,lens,visitorLens) {
    return this.transaction(roomKey,lens,async({data,draft,room,base})=>{
      const staged=composeBuilderRoom(base,normalizePieces(copy(draft.pieces),room));
      const checks=this.inspect(roomKey,staged,visitorLens);
      const receipt=await appendEntry(data.receipts,room.ownerId,'build_previewed',{roomKey,baseVersion:draft.baseVersion,checks});
      draft.preview=receiptView(receipt);
      return {checks,receipt:draft.preview};
    });
  }

  inspect(roomKey,staged,visitorLens) {
    const targetLens={...visitorLens,preview:true};
    return withBuilderRoom(roomKey,staged,()=>{
      const entry=roomEntry(roomKey,targetLens,EDGES);
      const canEnter=entry.state!=='hidden'&&entry.state!=='private'&&!entry.admission?.blocked&&!!entry.rights?.canEnter&&entry.type!=='window';
      const view=sourcedRoom(viewRoom(staged,targetLens),targetLens);
      const shown=canEnter?selectContent(view,targetLens).blocks.filter(block=>!block.filtered&&!blockNeedsPreview(block,view,targetLens,{approved:true})).map(block=>block.id):[];
      return {canEnter,description:entry.admission?.description??(canEnter?'Entry is available for this Lens.':'Entry is unavailable for this Lens.'),
        shown,withheld:view.blocks.filter(block=>!shown.includes(block.id)).map(block=>block.id),reasons:entry.reasons??[]};
    });
  }

  budget(roomKey,lens) {
    const room=this.owner(roomKey,lens);
    return estimate(this.base.get(roomKey),this.current(this.data,roomKey,room).pieces);
  }

  history(roomKey,lens) {
    const room=this.owner(roomKey,lens);
    return this.published(this.data,roomKey,room.ownerId).toReversed()
      .map(receipt=>({revisionId:receipt.diff.revisionId,receipt:receiptView(receipt),pieces:copy(receipt.diff.pieces)}));
  }

  restore(roomKey,lens,revisionId) {
    return this.edit(roomKey,lens,(draft,room)=>{
      const revision=this.published(this.data,roomKey,room.ownerId).find(r=>r.diff.revisionId===revisionId);
      if (!revision) throw new Error('That published version is unavailable.');
      draft.pieces=copy(revision.diff.pieces);
    });
  }

  async publish(roomKey,lens) {
    const result=await this.transaction(roomKey,lens,async({data,draft,room,base})=>{
      const head=this.published(data,roomKey,room.ownerId).at(-1);
      if ((head?.diff.revisionId??null)!==draft.baseVersion) throw new Error('The live version changed. Open the latest draft.');
      if (!draft.preview) throw new Error('Preview the current draft before publishing.');
      if (same(draft.pieces,head?.diff.pieces??[])) throw new Error('There are no draft changes to publish.');
      const budget=estimate(base,draft.pieces);
      if (!budget.valid) throw new Error('Room budget exceeded. '+budget.over.map(use=>use.key+' '+use.actual+'/'+use.limit).join(', '));
      const revisionId=id(), pieces=normalizePieces(copy(draft.pieces),room);
      const retained = new Map((head?.diff.pieces??[]).map(piece=>[piece.id,piece]));
      const authored = pieces.filter(piece=>!piece.kind.startsWith('hosted-'));
      for(const piece of authored){
        const previous=retained.get(piece.id);
        const {recordVersionId, ...material}=piece.block;
        const {recordVersionId:priorVersion, ...priorMaterial}=previous?.block??{};
        const keep=previous&&same(material,priorMaterial)&&same(piece.settings,previous.settings)&&same(piece.behaviors,previous.behaviors);
        piece.block.recordVersionId=keep ? priorVersion : revisionId+'/'+piece.id;
      }
      const receipt=await appendEntry(data.receipts,room.ownerId,'build_published',{
        roomKey,revisionId,priorRevisionId:draft.baseVersion,previewReceiptId:draft.preview.id,pieces,
        ownedRecordVersions:authored.map(piece=>({placeId:room.id,thingId:piece.id,versionId:piece.block.recordVersionId}))
      });
      const projected=stampBuilderProvenance(roomKey,composeBuilderRoom(base,pieces,{recordVersionId:revisionId}),data.receipts);
      Object.assign(draft,{baseVersion:revisionId,pieces,undo:[],redo:[],preview:null});
      return {receipt:receiptView(receipt),draft:this.snapshot(data,roomKey,room),projected};
    });
    this.onPublish(roomKey);
    return {receipt:result.receipt,draft:result.draft};
  }

  vouchTarget(roomKey,lens,thingId,receipts) {
    const room = Object.hasOwn(ROOMS,roomKey) ? ROOMS[roomKey] : null;
    const actor = lens?.profileId??lens?.id;
    if (!room?.ownerId || !lens || lens.preview || lens.isAgent || typeof actor!=='string' || !actor ||
      lens.identity?.backing!=='verified' || !['real','pseudonym'].includes(lens.identity.display)) {
      throw new Error('A named or pseudonymous verified person can vouch.');
    }
    const rights = permission(room,lens);
    const gate = roomEntry(roomKey,lens,EDGES);
    if (rights.visibility!=='public' || !rights.canLook ||
      gate.state==='hidden' || gate.state==='private' || gate.admission?.blocked ||
      (thingId==null && (!rights.canEnter || gate.type==='window'))) {
      throw new Error('You can only vouch for a public record you can read or enter.');
    }
    const view = viewRoom(room,lens);
    const node = thingId==null ? room : selectContent(view,lens).blocks.find(block=>
      block.id===thingId && !block.filtered && !blockNeedsPreview(block,view,lens));
    if (!node) throw new Error('That Thing is unavailable in your view.');
    if (actor===room.ownerId || actor===node.ownerId) throw new Error('An independent person must vouch for this record.');
    const target = builderSubject(room,node);
    const publication = builderPublication(target,builderPublications(roomKey,room,receipts));
    if (!publication) {
      throw new Error('There is no Builder publication Receipt for this version.');
    }
    return {room,target,actor,publication};
  }

  async vouch(roomKey,lens,{thingId=null}={}) {
    const result = await this.write(roomKey,async data=>{
      const {target,actor,publication} = this.vouchTarget(roomKey,lens,thingId,data.receipts);
      const publicationReceiptRef = receiptView(publication).id;
      const prior = submissionFor(target,actor,publicationReceiptRef,data.receipts);
      if (prior) return {receipt:receiptView(prior),target};
      const receipt = await appendEntry(data.receipts,actor,'build_vouched',
        {target,publicationReceiptRef});
      const current = this.vouchTarget(roomKey,lens,thingId,data.receipts);
      if (!same(current.target,target)) throw new Error('The published record changed. Review the current version.');
      return {receipt:receiptView(receipt),target,projected:stampBuilderProvenance(roomKey,current.room,data.receipts)};
    });
    if (result.projected) this.onPublish(roomKey);
    return {receipt:result.receipt,target:result.target};
  }

  async recover(lens,{arrivalRecords,loadArrivalSeed}={}) {
    if (!lens || lens.preview || !await this.ready) return;
    await this.loadPublicClaims(lens,arrivalRecords,loadArrivalSeed);
    for (const [roomKey,room] of Object.entries(ROOMS)) {
      if (!room.ownerId || !room.layout) continue;
      const head = this.published(this.data,roomKey,room.ownerId).at(-1);
      if (!head) continue;
      const owner = !lens.isAgent && room.ownerId===personId(lens);
      const base = this.base.get(roomKey)??authoredBases.get(room)??room;
      const incoming = EDGES.find(edge=>edge.to===roomKey);
      if (!owner && !publicContainment(roomKey,lens,ROOMS,incoming?.host)) {
        if (base!==room && room.recordVersionId===head.diff.revisionId) ROOMS[roomKey]=copy(base);
        continue;
      }
      if (!this.base.has(roomKey)) this.base.set(roomKey,copy(base));
      const pieces = normalizePieces(copy(head.diff.pieces),room);
      const projected = stampBuilderProvenance(roomKey,composeBuilderRoom(base,pieces,
        {recordVersionId:head.diff.revisionId}),this.data.receipts);
      authoredBases.set(projected,base);
      ROOMS[roomKey]=projected;
    }
  }

  async loadPublicClaims(lens,arrivalRecords,loadArrivalSeed) {
    if (!arrivalRecords || typeof loadArrivalSeed!=='function' || !await Promise.resolve(arrivalRecords.ready).catch(()=>false) ||
      !Array.isArray(arrivalRecords.data?.starters) || !Array.isArray(arrivalRecords.data?.receipts)) return;
    for (const starter of arrivalRecords.data.starters) {
      const root = starter?.projection?.rootPlaceId;
      if (!root || Object.hasOwn(ROOMS,root) || !Array.isArray(starter.changes) || !Array.isArray(starter.projection.rooms) ||
        !arrivalRecords.data.receipts.some(receipt=>
        receipt.action==='starter_claimed_local' && receipt.actor===starter.holderId &&
        receipt.diff.draftId===starter.id && receipt.diff.rootPlaceId===root)) continue;
      const rooms = claimedRooms(starter);
      const eligible = Object.keys(rooms).some(roomKey=>
        this.published(this.data,roomKey,starter.holderId).length && publicContainment(roomKey,lens,rooms));
      if (!eligible) continue;
      try {
        // Use Arrival's verified claim with its ordinary registration path.
        // The visitor pass below overlays only currently public Builder heads.
        loadArrivalSeed(starter);
      } catch {
        this.warning ||= 'A saved public Place could not be restored.';
      }
    }
  }
}
