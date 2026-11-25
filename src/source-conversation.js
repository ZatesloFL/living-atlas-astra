import {personId} from './permissions.js';

export const SOURCE_CONVERSATION_KEY = 'living-atlas.source-conversation.v1';
export const SOURCE_GRANT_COMMAND = 'Give Atlas standing edit access for my sources';
const actions = {declaration:'declare-upload',mapping:'connect-and-map',placement:'place-source',publication:'publish-draft'};
const requested = {requested:true};
const needsBuild = kind => kind === 'placement' || kind === 'publication';

export async function requireSourceScope(records,lens,scope = 'suggest',kind) {
  if (!records) throw new Error('Ask the Atlas is unavailable here. You can use the Source inspector.');
  const areas = needsBuild(kind) ? ['sources','build'] : ['sources'];
  const command = needsBuild(kind) ? `${SOURCE_GRANT_COMMAND} and Build` : SOURCE_GRANT_COMMAND;
  for (const area of areas) {
    try { await records.requireInitiative(lens,area,scope,requested); }
    catch (error) {
      if (!String(error.message).includes(`active ${scope} grant`)) throw error;
      throw new Error(`Atlas needs your active ${scope} grant for ${area}. Say “${command}” and confirm the grant. You can also use the Source inspector.`);
    }
  }
}

/** Maps the source panels to the owner's shared Atlas proposals. */
export class SourceConversation {
  constructor(records) {
    this.records = records;
    this.pending = null;
    this.grantProposal = null;
  }

  begin(room,lens) {
    if (!room?.id || !lens || lens.isAgent || lens.preview || room.ownerId !== personId(lens) || !room.ownerId) {
      throw new Error('Open a Place you own to ask the Atlas to change its sources.');
    }
    this.context = {placeId:room.id,lens};
  }

  current() {
    if (!this.context || !this.records) throw new Error('Ask the Atlas is unavailable here. You can use the Source inspector.');
    return this.context;
  }

  requireScope(scope = 'suggest',kind) {
    const {lens} = this.current();
    return requireSourceScope(this.records,lens,scope,kind);
  }

  async propose(kind,data,summary,{supersedes} = {}) {
    if (!Object.hasOwn(actions,kind)) throw new Error('Choose an action for this Place’s sources.');
    if (this.pending && !supersedes) throw new Error('Confirm or dismiss the open proposal first.');
    const {lens,placeId} = this.current();
    const proposal = await this.records.proposeExtension(lens,{area:'sources',action:actions[kind],placeId,payload:data},summary,{...requested,supersedes});
    return this.pending = {id:proposal.id,kind,data:structuredClone(data),summary,receipt:proposal.receipt};
  }

  amend(data,summary) {
    const prior = this.pending;
    if (!prior) throw new Error('There is no proposal to edit.');
    return this.propose(prior.kind,data,summary ?? prior.summary,{supersedes:prior.id});
  }

  async confirm(apply) {
    const proposal = this.pending;
    if (!proposal) throw new Error('There is no proposal to confirm.');
    await this.requireScope('edit',proposal.kind);
    const {lens,placeId} = this.current();
    let result,confirmationReceipt;
    try {
      const confirmed = await this.records.confirm(lens,proposal.id,async (value,refs) => {
        confirmationReceipt = refs.confirmationReceipt;
        if (!this.context || value.area !== 'sources' || value.action !== actions[proposal.kind] || value.placeId !== placeId) {
          throw new Error('The proposal is outside this Place’s active conversation.');
        }
        result = await apply({kind:proposal.kind,data:value.payload,...refs});
        return {appliedReceipt:result?.receipt?.id ?? result?.receiptId ?? null};
      });
      return {result,confirmationReceipt,receipt:confirmed.receipt};
    } finally {
      if (confirmationReceipt) this.pending = null;
    }
  }

  async proposeGrant(value,words) {
    const {lens} = this.current();
    if (value.kind !== 'grant' || !value.areas.some(area => ['sources','build'].includes(area))) throw new Error('Ask for a grant that includes Sources or Build.');
    if (this.grantProposal) throw new Error('Confirm or dismiss the open grant proposal first.');
    this.grantProposal = await this.records.propose(lens,value,words);
  }

  async confirmGrant() {
    const {lens} = this.current();
    const result = await this.records.confirm(lens,this.grantProposal.id);
    this.grantProposal = null;
    return result;
  }

  async dismiss() {
    const {lens} = this.current();
    const next = this.grantProposal ? 'grantProposal' : 'pending';
    if (!this[next]) return;
    await this.records.decline(lens,this[next].id);
    this[next] = null;
  }

  async end() {
    const context = this.context;
    const proposals = [this.grantProposal,this.pending];
    this.context = this.grantProposal = this.pending = null;
    if (!context) return;
    for (const proposal of proposals) {
      if (proposal) await this.records.decline(context.lens,proposal.id);
    }
  }
}
