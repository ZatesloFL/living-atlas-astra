import {AXES, DIMENSIONS} from './scores.js';
import {AREA_LABELS, atlasIntent} from './atlas-intents.js';
import {connectionPlanFingerprint} from './connected-sources.js';
import {SourceConversation, SOURCE_GRANT_COMMAND} from './source-conversation.js';
import {uploadLimitLabel} from './upload-client.js';
import {PHOTO_DESCRIPTION_LIMIT, uploadScoreBasis} from './upload-scores.js';

const entities = {'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'};
const esc = value => String(value ?? '').replace(/[&<>"']/g, character => entities[character]);
const short = input => input.trim().replace(/[.!?]+$/, '').trim();
const normalize = input => short(input).toLowerCase();
const commandText = input => short(input).replace(/^(?:(?:can|could|would) you |please )+/i, '');
const capabilities = 'I can review an attached photo, short WAV with speech or text file, connect a simulated Drive or gallery, and place an existing photo or video in your draft.';
const locationPattern = /\s+(?:on|to|at|near|in|by)\s+(?:the\s+)?(left|right|front|back|cent(?:er|re)|middle|entrance|window)$/i;
const positions = {left:[-2,0,0], right:[2,0,0], front:[0,0,2], back:[0,0,-2], center:[0,0,0], entrance:[0,0,2]};
const numberWords = ['zero','one','two','three'];
const visualKinds = new Set(['mapping','placement','publication']);
const grantRequest = input => /^(?:give|grant|allow|let)\s+(?:the\s+)?atlas\b.*\b(?:sources?|build)\b/i.test(input);

function grantWords(value) {
  const areas = value.areas.map(area => AREA_LABELS[area] ?? area).join(', ');
  const duration = value.durationMs === null ? 'standing' : `for ${value.durationMs / 60000} minutes`;
  const scope = {look:'read',suggest:'propose changes',edit:'apply changes you confirm'};
  return `Give the Atlas permission to ${scope[value.scope]} for ${areas}, ${duration}.`;
}

export function confirmedSourceScores(scores) {
  return `<table class="source-score-table"><thead><tr><th scope="col">Dimension</th><th scope="col">Amount</th><th scope="col">Graphicness</th></tr></thead><tbody>${DIMENSIONS.map(([key,label]) =>
    `<tr><th scope="row">${label}</th>${AXES.map(axis => `<td data-confirmed-dial="${key}.${axis}">${esc(scores[key]?.[axis])}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
}

function drawing(points, label) {
  const bound = Math.max(3, ...points.flatMap(point => [Math.abs(point.x),Math.abs(point.z)]));
  const coordinate = value => (50 + 42 * value / bound).toFixed(1) + '%';
  return `<div class="source-chat-diagram" role="img" aria-label="${esc(label)}">
    ${points.map((point,index) => `<span style="left:${coordinate(point.x)};top:${coordinate(point.z)}" aria-hidden="true">${index + 1}</span>`).join('')}</div>`;
}

function mappingPreview(plan) {
  const mapped = plan.placements.map(placement => ({
    title: plan.items.find(item => item.id === placement.itemId)?.title ?? 'Source item',
    x: placement.position[0], z: placement.position[1],
  }));
  const visualLabel = plan.kind === 'drive' ? 'Alcove' : 'Gallery plinth';
  return `<div class="source-preview-data" data-source-mapping-preview>
    <p><strong>${esc(plan.sourceLabel)}</strong> · Simulated source</p>
    <p>${esc(plan.modeLabel)} · ${esc(plan.recipeLabel)}</p>
    ${mapped.length ? `${drawing(mapped, `${plan.sourceLabel} placement plan`)}<ol>${mapped.map(point => `<li>${esc(point.title)} · ${visualLabel}</li>`).join('')}</ol>` : '<p>No source items are available to place.</p>'}
  </div>`;
}

function placementPreview(visual) {
  const [x,,z] = visual.position;
  return `<div class="source-preview-data" data-source-placement-preview><p><strong>${esc(visual.title)}</strong> · ${esc(visual.location)}</p>
    ${drawing([{x,z}], `${visual.title}, proposed ${visual.location}`)}</div>`;
}

function reviewPreview({checks,budget}) {
  if (!checks) return '';
  const list = entries => entries?.length ? `<ul>${entries.map(entry=>`<li>${esc(entry.title ?? entry.label ?? entry.reason ?? entry)}</li>`).join('')}</ul>` : '';
  return `<div class="source-preview-data" data-source-publication-preview><p>${esc(checks.description)}</p>
    <p>${checks.shown?.length ?? 0} shown · ${checks.withheld?.length ?? 0} withheld</p>${list(checks.reasons)}
    ${budget?.over?.length ? `<p>Placement budget exceeded.</p>${list(budget.over.map(entry=>`${entry.key}: ${entry.actual} of ${entry.limit}`))}` : ''}</div>`;
}

export class SourceConversationUI {
  constructor(host) {
    this.host = host;
    this.conversation = new SourceConversation(host.records);
  }

  begin(room,lens) {
    this.conversation.begin(room,lens);
    this.messages = [];
    this.attachment = null;
    this.pendingTransfer = null;
    this.visual = null;
    this.respond(`${capabilities} I’ll show proposals for ${room.title} and ask before acting. To give me permission, say “${SOURCE_GRANT_COMMAND}.”`);
  }

  async end() {
    this.attachment = null;
    this.pendingTransfer = null;
    const hadPreview = !!this.visual;
    this.visual = null;
    try {
      if (hadPreview) await this.host.emit('source-preview-clear');
    } finally {
      await this.conversation.end();
    }
  }

  respond(text) {
    if (text) this.messages.push({text, owner:false});
  }

  render() {
    const grant = this.conversation.grantProposal;
    const proposal = grant ? null : this.conversation.pending;
    const details = proposal?.kind === 'declaration' ? this.renderDeclaration(proposal) :
      proposal?.kind === 'mapping' && this.visual ? mappingPreview(this.visual) :
      proposal?.kind === 'placement' && this.visual ? placementPreview(this.visual) :
      proposal?.kind === 'publication' && this.visual ? reviewPreview(this.visual) : '';
    return `<section class="source-conversation" aria-label="Ask the Atlas about connected sources">
      <div class="source-chat-log" data-source-chat-log role="log" aria-label="Conversation" aria-relevant="additions text">
        ${this.messages.map(({text,owner})=>`<p class="source-message${owner?' source-message-owner':''}"><strong>${owner?'You':'The Atlas'}</strong> ${esc(text)}</p>`).join('')}
        ${grant ? `<div class="source-chat-proposal" data-source-chat-proposal="grant"><h3>Grant proposal</h3><p>${esc(grantWords(grant.value))}</p><p>Say <strong>yes</strong> to grant access or <strong>no</strong> to dismiss.</p></div>` : ''}
        ${proposal ? `<div class="source-chat-proposal" data-source-chat-proposal="${proposal.kind}"><h3>Proposal for ${esc(this.host.context.room.title)}</h3>${details}<p>Say <strong>yes</strong> to confirm or <strong>no</strong> to dismiss.</p></div>` : ''}
      </div>
      <form data-source-chat class="source-composer">
        <label class="source-composer-label" for="source-chat-text">Message the Atlas</label>
        <input id="source-chat-text" name="message" maxlength="${PHOTO_DESCRIPTION_LIMIT}" autocomplete="off" placeholder="Ask or reply in words" required>
        <button type="submit">Send</button>
        ${this.host.uploadAvailable ? '<button type="button" data-source-attach>Attach file</button>' : ''}
        ${this.host.uploadAvailable ? `<small class="source-chat-usage">${esc(this.host.storageUsageLabel())}</small>` : ''}
      </form>
    </section>`;
  }

  renderDeclaration(proposal) {
    const item = this.host.hostedItem(proposal.data.itemId);
    const review = item && this.host.proposalFor(item);
    if (!review) return '<p>This proposal has expired. Dismiss it and ask for a fresh review.</p>';
    const image = review.basis === 'image';
    const live = image || review.basis === 'audio-transcript';
    return `<div class="source-preview-data"><p><strong>${esc(item.filename)}</strong></p><p>${esc(review.provenance)}</p>
      ${live ? `<p><strong>${image?'What the Atlas saw':'What the Atlas heard'}</strong> ${esc(review.observation)}</p>` : ''}
      ${review.descriptionDisagrees ? `<p class="source-error"><strong>${image?'Image':'Speech'} and description disagree.</strong></p>` : ''}
      <ul class="source-score-lines">${DIMENSIONS.map(([key,label])=>`<li>${label} · ${AXES.map(axis=>`${axis} <strong data-proposed-dial="${key}.${axis}">${esc(proposal.data.scores[key][axis])}</strong>`).join(' · ')}</li>`).join('')}</ul>
      <p>To edit a dial, say “Set violence amount to 2.”</p></div>`;
  }

  async attach(file) {
    if (this.conversation.pending || this.conversation.grantProposal || this.attachment || this.pendingTransfer) throw new Error('Finish or dismiss the current review before attaching another file.');
    await this.conversation.requireScope();
    this.pendingTransfer = {file,id:crypto.randomUUID()};
    return this.uploadAttachment();
  }

  async uploadAttachment() {
    await this.conversation.requireScope();
    const host = this.host;
    const {file,id} = this.pendingTransfer;
    let item;
    try {
      item = host.updateHostedItem(await host.uploads.upload({file,id,placeId:host.context.placeId}));
    } catch (error) {
      throw new Error(`${error?.message ?? 'Upload failed.'} Say “retry upload” or “cancel.”`);
    }
    this.pendingTransfer = null;
    if (item.state !== 'uploaded') {
      this.respond(`${item.filename} was received. Its current state is available in the source inspector.`);
      return;
    }
    this.messages.push({text:`Attached ${item.filename}`, owner:true});
    await this.startReview(item,file);
  }

  async startReview(item,file) {
    await this.conversation.requireScope();
    const basis = uploadScoreBasis(item.contentType);
    if (!basis) {
      this.respond('Live assessment requires a short PCM WAV with speech. This file is uploaded and stays unpublished.');
      return;
    }
    this.attachment = {item,file:basis==='text'?file:null};
    if (basis === 'text') return this.review('');
    this.respond(basis === 'image'
      ? `Describe what is in ${item.filename}, or say “skip.” The Atlas sends its photo bytes to its AI provider for live assessment and uses your description for comparison. The photo limit for assessment is 7 MiB and 8,000 pixels per side.`
      : `Describe what can be heard in ${item.filename}, or say “skip.” The Atlas sends this WAV to its AI provider to transcribe and assess its speech and uses your description for comparison. Audio assessment supports PCM WAV up to 30 seconds.`);
  }

  async review(description) {
    const {item,file} = this.attachment;
    const host = this.host;
    await host.score(item,file,description);
    this.attachment = null;
    const review = host.proposalFor(item);
    await this.conversation.propose('declaration', {
      itemId:item.id, scores:review.scores,
      ...(review.proposalReceiptId ? {assessmentReceiptId:review.proposalReceiptId} : {}),
      ...(review.transcriptionReceiptId ? {transcriptionReceiptId:review.transcriptionReceiptId} : {}),
    }, 'Confirm the upload’s declaration and publish its copy');
    this.respond(`Here is my proposed declaration for ${item.filename}. Confirming will publish this copy to ${host.context.room.title}.`);
  }

  async ask(input) {
    const value = input.trim();
    if (!value) return;
    const words = commandText(value).toLowerCase();
    this.messages.push({text:value,owner:true});
    if (/^(no|cancel|dismiss|stop)(?:,? (?:thank you|thanks))?$/.test(words)) return this.dismiss();
    const proposal = this.conversation.pending;
    const grant = this.conversation.grantProposal;
    if (/^(yes|(?:confirm|approve)(?: it)?|yes,? (?:please|confirm|do it))$/.test(words)) {
      if (grant) {
        const confirmed = await this.conversation.confirmGrant();
        if (proposal) {
          await this.conversation.dismiss();
          if (visualKinds.has(proposal.kind)) await this.host.emit('source-preview-clear');
          this.visual = null;
        }
        this.respond(`Grant confirmed. Receipt ${confirmed.receipt}.${proposal ? ' Ask again to review the source action under this grant.' : ''}`);
        return;
      }
      this.respond(proposal ? await this.confirm() : this.attachment ? 'Give me a description or say “skip” so I can prepare a declaration.' : 'There is no proposal to confirm.');
      return;
    }
    if (grant) {
      this.respond('Please confirm or dismiss the grant proposal first.');
      return;
    }
    if (grantRequest(words)) return this.askGrant(value);
    if (proposal) {
      if (proposal.kind === 'declaration' && /^(set|change|make)\b/.test(words)) return this.edit(words,proposal);
      this.respond('Please confirm or dismiss the open proposal first.');
      return;
    }
    if (this.pendingTransfer) {
      if (/^retry(?: upload)?$/.test(words)) return this.uploadAttachment();
      this.respond('Say “retry upload” to continue this transfer or “cancel” to dismiss it.');
      return;
    }
    if (this.attachment) return this.review(words === 'skip' ? '' : value);
    if (/^connect\b/.test(words) || /^attach\b.*\b(?:drive|gallery)\b/.test(words)) return this.connect(words);
    if (/^(attach|upload)\b/.test(words)) {
      this.respond(this.host.uploadAvailable ? `Choose a photo, text file or audio file. The upload limit is ${uploadLimitLabel} per file. Videos use YouTube or Vimeo links.` : 'Hosted uploads are unavailable in this session.');
      if (this.host.uploadAvailable) this.host.fileInput.click();
      return;
    }
    if (/^(place|hang|put|add)\b/.test(words)) return this.place(commandText(value));
    if (/^(publish|review (?:and )?publish)\b/.test(words)) return this.publication();
    if (/^(review|score)\s+/.test(words)) {
      await this.conversation.requireScope();
      const target = words.replace(/^(review|score)\s+/, '');
      const match = this.find(this.host.hostedItems.filter(item=>item.state==='uploaded').map(item=>({...item,title:item.filename,
        media:item.contentType.startsWith('image/')?'photo':'upload'})),target);
      if (match) return this.startReview(match);
      return;
    }
    this.respond(`${capabilities} Try “Connect my mock Drive in indexed mode” or “Publish draft.”`);
  }

  async askGrant(words) {
    const value = atlasIntent(words);
    if (value.kind === 'clarify') {
      this.respond(`${value.text} For example, “${SOURCE_GRANT_COMMAND}.”`);
      return;
    }
    await this.conversation.proposeGrant(value,words);
  }

  async edit(words, proposal) {
    const match = words.match(/^(?:set|change|make)\s+(?:the\s+)?(.+?)\s+(amount|graphicness)\s*(?:to\s*|=\s*)?([0-3]|zero|one|two|three)$/);
    const dimension = match && DIMENSIONS.find(([key,label])=>match[1]===key||match[1]===label.toLowerCase());
    if (!match || !dimension) {
      this.respond('Name a dimension and one dial with a value from 0 to 3. For example, “Set violence amount to 2.”');
      return;
    }
    const [key,label] = dimension;
    const [, ,axis,spoken] = match;
    const value = numberWords.includes(spoken) ? numberWords.indexOf(spoken) : Number(spoken);
    const data = structuredClone(proposal.data);
    data.scores[key][axis] = value;
    await this.conversation.amend(data,'Confirm the edited declaration and publish its copy');
    this.respond(`${label} ${axis} is now ${value} in the proposal.`);
  }

  async connect(words) {
    const kind = /\bdrive\b/.test(words) ? 'drive' : /\bgallery\b/.test(words) ? 'collection-db' : null;
    if (!kind || !/\b(?:mock|simulated)\b/.test(words)) {
      this.respond('I can connect the simulated Drive or gallery. Say “Connect my mock Drive” or “Connect my mock gallery.”');
      return;
    }
    await this.conversation.requireScope();
    const syncMode = /\bsnapshot\b/.test(words) ? 'snapshot' : /\b(indexed|fed)\b/.test(words) ? 'indexed' : 'live';
    const host = this.host;
    const {placeId,actorId:owner} = host.context;
    const plan = host.sources.planConnection({placeId,owner,kind,syncMode},host.actor);
    await host.emit('source-mapping-preview',{plan});
    await this.proposeVisual('mapping',{sourceId:plan.sourceId,kind,syncMode,recipe:plan.recipe,
      planFingerprint:await connectionPlanFingerprint(plan)},'Attach a simulated source and approve its mapping',plan);
    this.respond(`Here is the proposed ${plan.sourceLabel} connection and mapping for ${host.context.room.title}${syncMode === 'indexed' ? ' in indexed mode' : ''}.`);
  }

  find(items, target) {
    const term = normalize(target).replace(/^(?:the|my)\s+/, '').replace(/^['“"]|['”"]$/g,'');
    const exact = items.filter(item=>normalize(item.title)===term);
    const generic = ['photo','upload','video','file'].includes(term);
    const matches = exact.length ? exact : items.filter(item => generic ? (term === 'file' || item.media === term || term === 'upload' && item.media === 'photo') : item.title.toLowerCase().includes(term));
    if (matches.length === 1) return matches[0];
    this.respond(matches.length > 1 ? `Which item did you mean? ${matches.slice(0,6).map(item=>item.title).join(', ')}.` : 'I couldn’t find that item in this Place. Use the exact filename or video title.');
    return null;
  }

  async place(input) {
    await this.conversation.requireScope('suggest','placement');
    const host = this.host;
    const phrase = short(input).replace(/^(?:place|hang|put|add)\s+/i,'');
    const suffix = phrase.match(locationPattern);
    const target = suffix ? phrase.slice(0,suffix.index) : phrase.replace(/\s+in (?:the|this|my) (?:draft|room|place)$/i,'');
    const photos = host.hostedItems.filter(item=>item.state==='published' && item.contentType.startsWith('image/')).map(item=>({
      title:item.filename,media:'photo',reference:{kind:'upload',sourceId:item.sourceId,itemId:item.id}
    }));
    const videos = host.sources.list(host.context.placeId,host.actor).filter(source=>source.kind==='public-api').flatMap(source=>
      (host.sources.view(source.id,host.actor)?.items ?? []).filter(item=>item.kind==='video' && item.available && !item.excluded).map(item=>({
        title:item.title,media:'video',reference:{kind:'video',sourceId:source.id,itemId:item.id}
      })));
    const match = this.find([...photos,...videos],target);
    if (!match) return;
    const location = suffix?.[1].toLowerCase().replace(/^centre$|^middle$/,'center');
    const position = positions[location];
    if (location === 'window') {
      this.respond('Choose a side of this Place for the proposal: left, right, front or back.');
      return;
    }
    const staged = await host.emit('source-preview',{reference:match.reference,position});
    if (!staged?.piece?.transform?.position) throw new Error('Open the Place in Build to preview a placement.');
    const snapped = staged.piece.transform.position;
    const visual = {title:match.title,location:location ? `near the ${location}` : 'open position in the draft',position:snapped};
    await this.proposeVisual('placement',{reference:match.reference,position:snapped},'Place an existing source item in the draft',visual);
    this.respond(`Here is where I propose placing ${match.title} in the ${host.context.room.title} draft.`);
  }

  async publication() {
    await this.conversation.requireScope('suggest','publication');
    const review = await this.host.emit('source-publish-preview');
    if (!review?.receipt?.id) throw new Error('Open this Place in Build to review its draft before publishing.');
    await this.proposeVisual('publication',{previewReceiptId:review.receipt.id},'Publish the reviewed Place draft',review);
    this.respond(`Here is the preview for publishing the ${this.host.context.room.title} draft.`);
  }

  async proposeVisual(kind,data,summary,visual) {
    try {
      await this.conversation.propose(kind,data,summary);
      this.visual = visual;
    } catch (error) {
      await this.host.emit('source-preview-clear');
      throw error;
    }
  }

  async dismiss() {
    if (this.conversation.grantProposal) {
      await this.conversation.dismiss();
      this.respond('Grant proposal dismissed.');
      return;
    }
    const proposal = this.conversation.pending;
    if (proposal) {
      await this.conversation.dismiss();
      if (visualKinds.has(proposal.kind)) await this.host.emit('source-preview-clear');
      this.visual = null;
      this.respond('Proposal dismissed.');
    } else if (this.attachment) {
      this.attachment = null;
      this.respond('Review stopped. The uploaded copy is still unpublished.');
    } else if (this.pendingTransfer) {
      this.pendingTransfer = null;
      this.respond('Transfer dismissed. Check the Source inspector for any pending upload.');
    } else this.respond('There is no open proposal to dismiss.');
  }

  async confirm() {
    const host = this.host;
    const proposal = this.conversation.pending;
    let confirmed;
    try {
      confirmed = await this.conversation.confirm(async ({kind,data,proposalReceipt,confirmationReceipt}) => {
        if (kind === 'declaration') {
          const declaration = await host.records.verifyExtension(host.context.lens,{
            area:'sources',action:'declare-upload',placeId:host.context.placeId,proposalReceipt,confirmationReceipt
          });
          const item = await host.publishUpload(declaration.itemId,declaration.scores,declaration);
          return {item,receiptId:item.declarationReceiptId};
        }
        if (kind === 'mapping') {
          const {placeId,actorId:owner} = host.context;
          const plan = this.visual;
          if (!plan || plan.placeId !== placeId || plan.owner !== owner || plan.sourceId !== data.sourceId || plan.recipe !== data.recipe) throw new Error('The connection changed. Ask for a fresh proposal.');
          const connected = await host.sources.commitConnection(plan,{lens:host.context.lens,records:host.records,proposalReceipt,confirmationReceipt});
          await host.emit('sources-changed',{sourceId:connected.source.id});
          return connected;
        }
        const event = kind === 'placement' ? 'source-placed' : 'source-publish-confirmed';
        return host.emit(event,{...data,proposalReceipt,confirmationReceipt});
      });
    } finally {
      if (!this.conversation.pending && this.visual && visualKinds.has(proposal.kind)) {
        this.visual = null;
        await host.emit('source-preview-clear');
      }
    }
    const {result,confirmationReceipt,receipt} = confirmed;
    this.visual = null;
    const applied = result?.receipt?.id ?? result?.receiptId;
    const outcome = result?.item ? `Declaration confirmed. ${result.item.filename} is published to this Place.` :
      result?.source ? `${result.source.label} is attached and its mapping is approved.` :
      result?.receipt ? 'Draft published.' : 'Source placed in your draft.';
    return `${outcome} Confirmation Receipt ${confirmationReceipt}. Atlas Receipt ${receipt}.${applied ? ` Applied Receipt ${applied}.` : ''}`;
  }
}
