import {appendEntry,verifyChain} from './ledger.js';
import {personId} from './permissions.js';

export const SOURCE_CONVERSATION_KEY = 'living-atlas.source-conversation.v1';
const kinds = new Set(['declaration','mapping','placement','publication']);
const reference = receipt => 'source-conversation:'+receipt.hash;
const copy = value => structuredClone(value);

/** Each entered Place gets a scoped grant. Every proposed and confirmed act
 * is bound to that Place and its owner, and the actuators enforce their own law. */
export class ConversationJournal {
  constructor(storage=()=>globalThis.localStorage) {
    this.storage=typeof storage==='function'?storage:()=>storage;
    this.session=null;
    this.pending=null;
    this.queue=Promise.resolve();
  }

  begin(room,lens) {
    if (!room?.id || !room.ownerId || !lens || lens.isAgent || lens.preview || room.ownerId!==personId(lens)) {
      throw new Error('Open a Place you own to ask the Atlas to change its sources.');
    }
    if(this.session?.placeId===room.id && this.session.ownerId===room.ownerId)return;
    this.pending=null;
    this.session={id:crypto.randomUUID(),placeId:room.id,ownerId:room.ownerId,scope:'suggest',granted:false};
  }

  write(operation,{closing=false,session=this.session}={}) {
    const job=this.queue.then(()=>{
      const run=async()=>{
        if(!session || !closing && this.session!==session)throw new Error('The Atlas’s grant for this Place has ended.');
        const storage=this.storage();
        if(!storage)throw new Error('Browser storage is needed to record this conversation.');
        const raw=storage.getItem(SOURCE_CONVERSATION_KEY);
        const state=raw?JSON.parse(raw):{version:1,receipts:[]};
        if(state.version!==1||!Array.isArray(state.receipts)||!(await verifyChain(state.receipts)).valid) {
          throw new Error('Conversation Receipts need recovery before another act can be recorded.');
        }
        const save=()=>storage.setItem(SOURCE_CONVERSATION_KEY,JSON.stringify(state));
        if(!closing && !session.granted){
          await appendEntry(state.receipts,session.ownerId,'source_conversation_granted',{
            grantId:session.id,placeId:session.placeId,scope:session.scope,actions:[...kinds]
          });
          save();
          session.granted=true;
        }
        const record=async(actor,action,diff)=>{
          const receipt=await appendEntry(state.receipts,actor,action,{
            grantId:session.id,placeId:session.placeId,ownerId:session.ownerId,...diff
          });
          save();
          return reference(receipt);
        };
        return operation(record,session);
      };
      return globalThis.navigator?.locks?navigator.locks.request(SOURCE_CONVERSATION_KEY,run):run();
    });
    this.queue=job.catch(()=>{});
    return job;
  }

  propose(kind,data,summary) {
    if(!kinds.has(kind)||typeof summary!=='string'||!summary.trim())throw new Error('A scoped proposal is required.');
    return this.write(async record=>{
      if(this.pending)throw new Error('Confirm or dismiss the open proposal first.');
      const id=crypto.randomUUID();
      const payload=copy(data);
      const receiptId=await record('atlas','source_conversation_proposed',{id,kind,summary,data:payload,supersedes:null});
      this.pending={id,kind,data:payload,summary,receiptId};
      return copy(this.pending);
    });
  }

  amend(data,summary) {
    return this.write(async record=>{
      const prior=this.pending;
      if(!prior)throw new Error('There is no proposal to edit.');
      const payload=copy(data),text=summary??prior.summary;
      const receiptId=await record('atlas','source_conversation_proposed',{
        id:prior.id,kind:prior.kind,summary:text,data:payload,supersedes:prior.receiptId
      });
      this.pending={...prior,data:payload,summary:text,receiptId};
      return copy(this.pending);
    });
  }

  confirm(apply) {
    return this.write(async (record,session)=>{
      const proposal=this.pending;
      if(!proposal)throw new Error('There is no proposal to confirm.');
      const diff={id:proposal.id,kind:proposal.kind,proposalReceiptId:proposal.receiptId};
      const receiptId=await record(session.ownerId,'source_conversation_confirmed',diff);
      let result;
      try {
        result=await apply({...copy(proposal),confirmationReceiptId:receiptId});
      } catch(error) {
        await record(session.ownerId,'source_conversation_outcome',{...diff,confirmationReceiptId:receiptId,outcome:'failed'});
        throw error;
      }
      this.pending=null;
      const appliedReceiptId=result?.receiptId??result?.receipt?.id??null;
      await record(session.ownerId,'source_conversation_outcome',{...diff,confirmationReceiptId:receiptId,appliedReceiptId,outcome:'applied'});
      return {result,receiptId};
    });
  }

  dismiss() {
    return this.write(async (record,session)=>{
      const proposal=this.pending;
      if(!proposal)return null;
      await record(session.ownerId,'source_conversation_declined',{id:proposal.id,kind:proposal.kind,proposalReceiptId:proposal.receiptId});
      this.pending=null;
      return true;
    });
  }

  end() {
    const session=this.session;
    if(!session)return Promise.resolve();
    const proposalReceiptId=this.pending?.receiptId??null;
    this.pending=null;
    this.session=null;
    return this.write(async record=>{
      if(session.granted)await record(session.ownerId,'source_conversation_revoked',{proposalReceiptId});
    },{closing:true,session});
  }
}
