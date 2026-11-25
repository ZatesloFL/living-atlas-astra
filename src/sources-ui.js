import {connectedSources} from './connected-sources.js';
import {videoReference} from './source-media.js';
import {AXES, DIMENSIONS, validPair} from './scores.js';
import {uploadAccept, uploadLimitLabel} from './upload-client.js';
import {PHOTO_DESCRIPTION_LIMIT, PHOTO_SCORE_MODEL, uploadScoreBasis, validPhotoObservation, validPhotoRecordId} from './upload-scores.js';
import {SourceConversationUI, confirmedSourceScores} from './source-conversation-ui.js';

const proposalKey = 'living-atlas.upload-proposals.v1';
const modeLabels = {live: 'Live reference', indexed: 'Fed by the source', snapshot: 'Snapshot'};
const recipes = {'collection-db': 'gallery-plinths', drive: 'drive-alcoves'};
const states = {reserved: 'Upload pending', uploaded: 'Unpublished', published: 'Published', deleting: 'Deleting', deleted: 'Hosted copy deleted'};
const escapes = {'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'};
const esc = value => String(value ?? '').replace(/[&<>"']/g, character => escapes[character]);
const pairsValid = scores => scores && DIMENSIONS.every(([key]) => validPair(scores[key]));
const hasLiveReview = proposal => ['image','audio-transcript'].includes(proposal?.basis) && proposal.model === PHOTO_SCORE_MODEL &&
  validPhotoRecordId(proposal.proposalReceiptId) && validPhotoObservation(proposal.observation) &&
  (proposal.basis !== 'audio-transcript' || validPhotoRecordId(proposal.transcriptionReceiptId)) &&
  typeof proposal.descriptionDisagrees === 'boolean';

export function formatSourceBytes(bytes) {
  if (!Number.isSafeInteger(bytes) || bytes < 0) return 'Unavailable';
  const units = [[1e9, 'GB'], [1e6, 'MB'], [1e3, 'kB']];
  const unit = units.find(([size]) => bytes >= size);
  return unit ? (bytes / unit[0]).toLocaleString(undefined, {maximumFractionDigits: 2}) + ' ' + unit[1] : bytes.toLocaleString() + ' B';
}

function createdDate(iso) {
  const date = new Date(iso);
  return Number.isFinite(date.valueOf()) ? date.toISOString().slice(0, 10) : null;
}

function styleSheet() {
  if (document.querySelector('[data-sources-styles]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = new URL('../sources.css', import.meta.url).href;
  link.dataset.sourcesStyles = '';
  document.head.append(link);
}

function ownerContext({room, lens} = {}) {
  const actorId = lens?.profileId ?? lens?.id;
  return room?.id && actorId && actorId === room.ownerId && !lens.isAgent && !lens.preview
    ? {room, lens, actorId, placeId: room.id} : null;
}

function command(name, label, {sourceId, itemId} = {}) {
  return `<button type="button" data-command="${name}"${sourceId ? ` data-source-id="${esc(sourceId)}"` : ''}${itemId ? ` data-item-id="${esc(itemId)}"` : ''}>${esc(label)}</button>`;
}

function rightsLabel(rights) {
  const label = (typeof rights === 'string' ? rights : rights?.label) ?? 'unavailable';
  return {'public-domain': 'Public domain', 'rights-reserved': 'Rights reserved', private: 'Private', unavailable: 'Rights unavailable'}[label] ?? label;
}

function viewStatus(source) {
  if (source.status === 'deleted') return 'Source unavailable';
  const sync = source.lastSync ? 'Last synced ' + (createdDate(source.lastSync) ?? source.lastSync) : 'Awaiting first sync';
  return `${source.simulated ? 'Simulated source · ' : ''}${modeLabels[source.syncMode] ?? 'Source'} · ${sync}`;
}

function scoreInputs(scores) {
  return DIMENSIONS.map(([key, label]) => `<div class="source-score">
    <h5>${esc(label)}</h5>
    ${AXES.map(axis => `<label>${axis === 'amount' ? 'Amount' : 'Graphicness'}
      <select name="${key}.${axis}" aria-label="${esc(label)} ${axis}">
        ${[0, 1, 2, 3].map(value => `<option value="${value}"${value === scores[key][axis] ? ' selected' : ''}>${value}</option>`).join('')}
      </select>
    </label>`).join('')}
  </div>`).join('');
}

function uploadUsage(result) {
  const usage = result?.usage;
  if (!usage || !Number.isSafeInteger(usage.usedBytes) || !Number.isSafeInteger(usage.allotmentBytes) || usage.allotmentBytes <= 0) {
    return '<p class="source-caption">Hosted storage usage is unavailable.</p>';
  }
  const {usedBytes, allotmentBytes, reservedBytes} = usage;
  return `<div class="source-usage"><p>You've used <strong>${formatSourceBytes(usedBytes)}</strong> of your <strong>${formatSourceBytes(allotmentBytes)}</strong> upload allotment.</p>
    <progress value="${usedBytes}" max="${allotmentBytes}" aria-label="Hosted upload space used"></progress>
    ${reservedBytes > 0 ? `<p class="source-caption">${formatSourceBytes(reservedBytes)} reserved for pending uploads.</p>` : ''}
  </div>`;
}

export class SourcesUI {
  constructor({sources = connectedSources, uploads, proposeScores, onChange, storage} = {}) {
    this.sources = sources;
    this.uploads = uploads;
    this.proposeScores = proposeScores;
    this.onChange = onChange;
    this.proposals = {};
    this.openSources = new Set();
    try {
      this.storage = storage ?? globalThis.localStorage;
      const saved = JSON.parse(this.storage?.getItem(proposalKey) ?? '{}');
      if (saved && typeof saved === 'object' && !Array.isArray(saved)) this.proposals = saved;
    } catch { /* Proposals can be recreated from the owner’s upload. */ }
  }

  createDialog() {
    styleSheet();
    const dialog = document.createElement('dialog');
    dialog.className = 'sources-ui sources-dialog';
    dialog.setAttribute('aria-labelledby', 'sources-dialog-title');
    dialog.innerHTML = `<header class="sources-header">
      <div><h2 id="sources-dialog-title">Connected sources</h2><p data-current-place></p></div>
      <button type="button" data-command="close" aria-label="Close connected sources">Close</button>
    </header><nav class="source-nav" aria-label="Connected sources views">
      <button type="button" data-sources-tab="conversation">Ask the Atlas</button>
      <button type="button" data-sources-tab="inspector">Source inspector</button>
    </nav><p class="source-feedback" role="status" aria-live="polite" data-feedback></p>
    <input type="file" data-source-attachment accept="${uploadAccept}" hidden>
    <div class="sources-content"></div>`;
    this.dialog = dialog;
    this.content = dialog.querySelector('.sources-content');
    this.feedback = dialog.querySelector('[data-feedback]');
    this.fileInput = dialog.querySelector('[data-source-attachment]');
    this.fileInput.addEventListener('change', () => {
      const [file] = this.fileInput.files;
      this.fileInput.value = '';
      if (file && this.tab==='conversation' && this.uploadAvailable) {
        void this.runChat(() => this.conversation.attach(file), 'Uploading…');
      }
    });
    dialog.addEventListener('click', event => {
      const tab = event.target.closest('button[data-sources-tab]');
      if (tab && !this.busy && tab.dataset.sourcesTab !== this.tab) {
        this.tab = tab.dataset.sourcesTab;
        this.clearReview();
        this.editor = null;
        this.render();
        return;
      }
      if (event.target.closest('[data-source-attach]')) {
        if (!this.busy && this.uploadAvailable) this.fileInput.click();
        return;
      }
      const button = event.target.closest('button[data-command]');
      if (button && dialog.contains(button)) void this.handleCommand(button);
    });
    dialog.addEventListener('submit', event => {
      event.preventDefault();
      if (event.target.matches('[data-source-chat]')) {
        const message = new FormData(event.target).get('message');
        if (typeof message === 'string' && message.trim()) void this.runChat(() => this.conversation.ask(message));
      } else void this.handleForm(event.target);
    });
    dialog.addEventListener('toggle', event => {
      const sourceId = event.target.dataset?.sourceDetail;
      if (!sourceId) return;
      if (event.target.open) this.openSources.add(sourceId);
      else this.openSources.delete(sourceId);
    }, true);
    dialog.addEventListener('cancel', event => {
      if (this.busy) event.preventDefault();
    });
    dialog.addEventListener('close', () => {
      if (dialog.open) return;
      this.editor = null;
      this.pendingFile = null;
      this.clearReview();
      this.endConversation();
    });
    document.body.append(dialog);
    return dialog;
  }

  open(input) {
    const context = ownerContext(input);
    if (!context) return false;
    if (this.busy) return true;
    const dialog = this.dialog ?? this.createDialog();
    if (dialog.open && this.context?.placeId === context.placeId && this.context?.actorId === context.actorId) return true;
    this.endConversation();
    if (context.actorId !== this.context?.actorId) this.hosted = null;
    this.context = context;
    this.tab = 'conversation';
    this.conversation = new SourceConversationUI(this);
    this.conversation.begin(context.room,context.lens);
    this.editor = null;
    this.pendingFile = null;
    this.clearReview();
    this.status('');
    this.dialog.querySelector('[data-current-place]').textContent = context.room.title;
    this.render();
    if (!dialog.open) dialog.showModal();
    if (this.uploadAvailable) void this.run(async () => {
      await this.refreshUploads();
      return '';
    }, 'Checking hosted storage…');
    return true;
  }

  endConversation() {
    const previous = this.conversation;
    this.conversation = null;
    void previous?.end().catch(() => { /* The session cannot authorize further actions. */ });
  }

  status(message, error = false) {
    this.feedback.textContent = message;
    this.feedback.classList.toggle('source-error', error);
  }

  async run(action, progress = 'Saving…') {
    if (this.busy) return;
    this.busy = true;
    this.content.inert = true;
    this.content.setAttribute('aria-busy', 'true');
    this.status(progress);
    try {
      this.status((await action()) ?? '');
    } catch (error) {
      this.status(error?.message ?? 'The source action could not be completed.', true);
    } finally {
      this.busy = false;
      this.content.inert = false;
      this.content.removeAttribute('aria-busy');
      if (this.dialog.open) this.render();
    }
  }

  async runChat(action, progress = 'The Atlas is working…') {
    const conversation = this.conversation;
    await this.run(async () => {
      try { await action(); }
      catch (error) { conversation.respond(error?.message ?? 'The source action could not be completed.'); }
      return '';
    },progress);
    if (this.dialog.open) this.content.querySelector('[data-source-chat] input[name="message"]')?.focus();
  }

  emit(type, details = {}) {
    return this.onChange?.({type, room: this.context.room, lens: this.context.lens, ...details});
  }

  get actor() {
    return {actorId: this.context.actorId};
  }

  get uploadAvailable() {
    return !!this.uploads && this.uploads.available?.() !== false;
  }

  get hostedItems() {
    return (this.hosted?.items ?? []).filter(item => item.placeId === this.context.placeId);
  }

  hostedItem(id) {
    return this.hostedItems.find(item => item.id === id);
  }

  storageUsageLabel() {
    const {usedBytes,allotmentBytes,reservedBytes} = this.hosted?.usage ?? {};
    if (!Number.isSafeInteger(usedBytes) || !Number.isSafeInteger(allotmentBytes) || allotmentBytes <= 0) return 'Hosted storage usage unavailable';
    return `${formatSourceBytes(usedBytes)} of ${formatSourceBytes(allotmentBytes)} used${reservedBytes > 0 ? ` · ${formatSourceBytes(reservedBytes)} reserved` : ''}`;
  }

  async refreshUploads() {
    this.hosted = await this.uploads.list();
    await this.emit('uploads-listed', {items: this.hosted.items ?? []});
  }

  updateHostedItem(response) {
    if (!response?.item) throw new Error('Hosted storage returned an incomplete upload record.');
    const {item} = response;
    const items = (this.hosted?.items ?? []).filter(candidate => candidate.id !== item.id);
    this.hosted = {...this.hosted, items: [...items, item], usage: response.usage ?? this.hosted?.usage};
    return item;
  }

  saveProposal(id, proposal) {
    if (proposal) this.proposals[id] = {
      actorId: this.context.actorId,
      basis: proposal.basis,
      scores: structuredClone(proposal.scores),
      model: typeof proposal.model === 'string' ? proposal.model : null,
      provenance: typeof proposal.provenance === 'string' ? proposal.provenance.slice(0, 300) : 'Simulated proposal.',
      ...(hasLiveReview(proposal) ? {proposalReceiptId: proposal.proposalReceiptId, observation: proposal.observation,
        descriptionDisagrees: proposal.descriptionDisagrees,
        ...(proposal.basis==='audio-transcript'?{transcriptionReceiptId:proposal.transcriptionReceiptId}:{})} : {}),
    };
    else delete this.proposals[id];
    try { this.storage?.setItem(proposalKey, JSON.stringify(this.proposals)); } catch { /* This tab retains the pending declaration. */ }
  }

  async score(item, file, description = '') {
    if (!this.proposeScores) throw new Error('The proposal is unavailable. Your upload is still unpublished.');
    const proposal = await this.proposeScores({file, item, description, room: this.context.room, lens: this.context.lens});
    if (!pairsValid(proposal?.scores)) throw new Error('The proposal is missing one or more dials. Your upload is still unpublished.');
    const basis=uploadScoreBasis(item.contentType);
    if (basis !== 'text' && (!hasLiveReview(proposal)||proposal.basis!==basis)) {
      throw new Error('A live proposal and its Receipts are required. Your upload is still unpublished.');
    }
    this.saveProposal(item.id, proposal);
  }

  proposalFor(item) {
    const proposal = this.proposals[item.id];
    if (proposal?.actorId !== this.context.actorId || !pairsValid(proposal.scores)) return null;
    const basis = uploadScoreBasis(item.contentType);
    if (basis === 'image' || basis === 'audio-transcript') return proposal.basis===basis && hasLiveReview(proposal) ? proposal : null;
    return basis === 'text' && (proposal.basis ?? 'text') === 'text' ? proposal : null;
  }

  async publishUpload(itemId, scores, {assessmentReceiptId} = {}) {
    const pending = this.hostedItem(itemId);
    const proposal = pending?.state === 'uploaded' && this.proposalFor(pending);
    if (!proposal) throw new Error('Request a score proposal before confirming.');
    if (assessmentReceiptId && proposal.proposalReceiptId !== assessmentReceiptId) throw new Error('The review changed. Request a fresh proposal before publishing.');
    if (!pairsValid(scores)) throw new Error('Choose amount and graphicness for every dimension.');
    let item;
    try {
      const result = proposal.basis !== 'text'
        ? await this.uploads.publish(itemId, scores, {proposalReceiptId:proposal.proposalReceiptId})
        : await this.uploads.publish(itemId, scores);
      item = this.updateHostedItem(result);
    } catch (error) {
      if (proposal.basis !== 'text' && ['PHOTO_ASSESSMENT_REQUIRED','PHOTO_ASSESSMENT_MISMATCH','AUDIO_ASSESSMENT_REQUIRED','AUDIO_ASSESSMENT_MISMATCH'].includes(error?.code)) {
        this.saveProposal(itemId, null);
        throw new Error('Request a fresh proposal before publishing. Your upload is still unpublished.');
      }
      throw error;
    }
    this.saveProposal(item.id,null);
    await this.emit('upload-published',{item});
    // Publishing has committed. Project the returned record even if a usage reload fails.
    await this.emit('uploads-listed',{items:this.hosted.items});
    return item;
  }

  render() {
    const scroll = this.content.scrollTop;
    const conversation = this.tab === 'conversation';
    for (const button of this.dialog.querySelectorAll('[data-sources-tab]')) {
      button.setAttribute('aria-pressed', String(button.dataset.sourcesTab === this.tab));
    }
    this.dialog.classList.toggle('sources-conversation-view',conversation);
    if (conversation) {
      this.content.innerHTML = this.conversation.render();
      const log = this.content.querySelector('[data-source-chat-log]');
      log.scrollTop = log.scrollHeight;
      return;
    }
    if (this.editor) {
      this.content.innerHTML = this.renderEditor();
    } else if (this.review) {
      this.content.innerHTML = this.renderReview();
    } else {
      const views = this.sources.list(this.context.placeId, this.actor)
        .map(source => this.sources.view(source.id, {...this.actor,includeExcluded:true})).filter(Boolean);
      this.content.innerHTML = `${this.renderSources(views)}${this.renderUploads()}${this.renderOperator()}`;
    }
    this.content.scrollTop = scroll;
  }

  renderSources(views) {
    return `<section class="source-panel" aria-labelledby="source-feeds-title">
      <h3 id="source-feeds-title">Sources for this Place</h3>
      <div class="source-actions">${command('add-gallery', 'Connect mock gallery')}${command('add-drive', 'Connect mock Drive')}</div>
      ${views.length ? views.map(view => this.renderSource(view)).join('') : '<p class="source-caption">No sources are attached.</p>'}
      <details class="source-details"><summary>Add a video reference</summary>
        <form data-form="video">
          <label>Video link<input name="url" type="url" inputmode="url" required placeholder="https://www.youtube.com/watch?v=…"></label>
          <label>Title<input name="title" maxlength="100" required></label>
          <button type="submit">Add video reference</button>
          <p class="source-caption">YouTube and Vimeo host these videos. A video reference uses no Atlas upload space.</p>
        </form>
      </details>
    </section>`;
  }

  renderSource({source, mapping, pendingMapping, items = [], snapshot}) {
    const id = source.id;
    const recipe = recipes[source.kind];
    const options = Object.entries(modeLabels).map(([value, label]) =>
      `<option value="${value}"${source.syncMode === value ? ' selected' : ''}>${label}</option>`).join('');
    return `<details class="source-details" data-source-detail="${esc(id)}"${this.openSources.has(id) ? ' open' : ''}>
      <summary>${esc(source.label ?? source.id)}</summary>
      <p class="source-caption">${esc(viewStatus(source))} · ${esc(rightsLabel(source.rightsDefault))}</p>
      ${snapshot ? `<p class="source-caption">Simulated snapshot, as of ${esc(createdDate(snapshot.capturedAt))} · SHA-256 ${esc(snapshot.hash)}</p>` : ''}
      ${recipe && source.status !== 'deleted' ? `
        <form data-form="mode" data-source-id="${esc(id)}" class="source-inline">
          <label>Feeding mode<select name="mode">${options}</select></label>
          <button type="submit"${mapping ? '' : ' disabled'}>Apply mode</button>
          ${mapping && source.syncMode !== 'snapshot' ? command('sync', 'Sync source', {sourceId:id}) : ''}
        </form>
        <p>${mapping ? 'Approved mapping · ' + esc(mapping.recipe === 'gallery-plinths' ? 'One plinth per record' : 'Folders become alcoves') : 'Mapping approval needed.'}</p>
        <div class="source-actions">
          ${!mapping && !pendingMapping ? command('propose-mapping', 'Propose mapping', {sourceId:id}) : ''}
          ${pendingMapping && !mapping ? command('approve-mapping', 'Approve mapping', {sourceId:id}) : ''}
          ${mapping && source.kind === 'drive' && source.syncMode !== 'snapshot' && !source.writeEnabled ? command('grant-write', 'Grant mock write-back for one hour', {sourceId:id}) : ''}
        </div>
        ${pendingMapping && !mapping ? `<p>${recipe === 'gallery-plinths' ? 'One plinth per gallery record.' : 'Folders become alcoves, with file previews inside.'}</p>` : ''}
        ${source.writeEnabled ? '<p class="source-caption">Scoped mock write-back is active. Edits write a Receipt.</p>' : ''}
      ` : ''}
      ${items.length ? `<ul class="source-items">${items.map(item => this.renderItem(source, item, items)).join('')}</ul>` : '<p class="source-caption">No source items are available.</p>'}
      ${source.owner === this.context.actorId ? command('disconnect-source', 'Disconnect source', {sourceId:id}) : ''}
    </details>`;
  }

  renderItem(source, item, items) {
    const folder = items.find(candidate => candidate.id === item.folderId);
    const owner = source.owner === this.context.actorId;
    const reference = {sourceId:source.id,itemId:item.id};
    if (item.excluded) return `<li><strong>${esc(item.title)}</strong>
      <small>Excluded from this Place</small>
      ${owner ? command('include-item', 'Include in this Place', reference) : ''}
    </li>`;
    const permittedEdits = ['rename','move','comment'].filter(op => source.writeOperations?.includes(op));
    return `<li><strong>${esc(item.title)}</strong>
      <small>${esc(folder?.title ?? item.kind ?? '')} · ${esc(rightsLabel(item.rights))}</small>
      ${item.preview ? `<p>${esc(typeof item.preview === 'string' ? item.preview : item.preview?.text)}</p>` : ''}
      ${item.kind==='video' && item.available ? command('place-video','Place in this room',{sourceId:source.id,itemId:item.id}) : ''}
      ${item.editorURL ? command('open-editor', 'Open in Google Docs · simulation', {sourceId: source.id, itemId: item.id}) : ''}
      ${source.simulated && source.syncMode !== 'snapshot' && item.kind !== 'folder' ?
        command('availability', item.available === false ? 'Restore simulated reference' : 'Simulate unavailable reference', {sourceId:source.id,itemId:item.id}) : ''}
      ${owner ? command('exclude-item', 'Exclude from this Place', reference) : ''}
      ${source.kind === 'drive' && permittedEdits.length && item.available !== false && item.kind !== 'folder' && item.editorURL ? `
        <details class="source-details"><summary>Write back to this mock file</summary>
          <form data-form="edit" data-source-id="${esc(source.id)}" data-item-id="${esc(item.id)}">
            <label>Operation<select name="op">${permittedEdits.map(op=>`<option value="${op}">${op[0].toUpperCase()+op.slice(1)}</option>`).join('')}</select></label>
            <label>New name or comment<input name="value" maxlength="280"></label>
            <label>Folder for a move<select name="folder"><option value="">Source root</option>${items.filter(entry=>entry.kind==='folder'&&entry.available!==false).map(entry=>`<option value="${esc(entry.id)}">${esc(entry.title)}</option>`).join('')}</select></label>
            <button type="submit">Apply scoped edit</button>
          </form>
        </details>` : ''}
    </li>`;
  }

  renderEditor() {
    const {sourceId, itemId} = this.editor;
    const view = this.sources.view(sourceId, this.actor);
    const item = view?.items.find(candidate => candidate.id === itemId);
    if (!item?.editorURL) return `<div class="source-panel"><h3>Source unavailable</h3>${command('return-editor', 'Return to room')}</div>`;
    return `<section class="source-panel"><p class="source-caption">Simulated Google Docs editor</p>
      <h3>${esc(item.title)}</h3><p>${esc(typeof item.preview === 'string' ? item.preview : item.preview?.text)}</p>
      ${(item.comments ?? []).map(comment => `<p class="source-caption">${esc(comment.text ?? comment)}</p>`).join('')}
      ${command('return-editor', 'Return to room')}
    </section>`;
  }

  clearReview() {
    if (this.review?.url) URL.revokeObjectURL(this.review.url);
    this.review = null;
  }

  renderReview() {
    const {item, url, text} = this.review;
    const media = item.contentType.startsWith('image/')
      ? `<img class="source-upload-review" src="${esc(url)}" alt="${esc(item.filename)}">`
      : item.contentType.startsWith('audio/')
        ? `<audio controls src="${esc(url)}"></audio>`
        : `<pre class="source-preview-text">${esc(text)}</pre>`;
    return `<section class="source-panel"><h3>${esc(item.filename)}</h3>${media}
      <a href="${esc(url)}" download="${esc(item.filename)}">Save original</a>
      ${command('close-review', 'Return to uploads')}</section>`;
  }

  renderUploads() {
    if (!this.uploadAvailable) return '<section class="source-panel"><h3>Hosted uploads</h3><p>Hosted uploads are unavailable in this session.</p></section>';
    const items = (this.hosted?.items ?? []).filter(item => item.placeId === this.context.placeId);
    return `<section class="source-panel" aria-labelledby="source-upload-title">
      <h3 id="source-upload-title">Hosted uploads</h3>
      <p class="source-caption">Dev storage uses this browser’s holder. Second Look account connection is unavailable in this build.</p>
      ${uploadUsage(this.hosted)}
      ${command('refresh-uploads', 'Refresh storage usage')}
      <form data-form="upload" class="source-upload-form">
        <label>Choose a photo, text or audio file<input type="file" name="file" accept="${uploadAccept}" required></label>
        <label>Photo or audio description <span>(optional)</span><textarea name="description" maxlength="${PHOTO_DESCRIPTION_LIMIT}" rows="3"></textarea></label>
        <p class="source-caption">${uploadLimitLabel} per file. Live assessment sends the photo or audio to the Atlas’s AI providers. Descriptions are used for comparison. Photo assessment supports up to 7 MiB and 8,000 pixels per side. For audio, use a short PCM WAV with speech. Text scoring uses a local sample.</p>
        <button type="submit">Upload and request scores</button>
      </form>
      ${this.pendingFile ? command('retry-upload', 'Retry upload: ' + this.pendingFile.file.name) : ''}
      ${items.length ? `<ul class="source-items">${items.map(item => this.renderUpload(item)).join('')}</ul>` : ''}
    </section>`;
  }

  renderUpload(item) {
    const proposal = this.proposalFor(item);
    const basis = uploadScoreBasis(item.contentType);
    const date = createdDate(item.uploadedAt);
    const readable = ['uploaded','published'].includes(item.state);
    const deletable = ['reserved','uploaded','published','deleting'].includes(item.state);
    const deleteLabel = item.state === 'reserved' ? 'Cancel pending upload' : item.state === 'deleting' ? 'Retry deletion' : 'Delete hosted copy';
    return `<li data-upload-id="${esc(item.id)}">
      <strong>${esc(item.filename)}</strong>
      <small>${esc(states[item.state] ?? 'Upload state unavailable')}${date && item.state!=='deleted' ? ' · uploaded copy, as of ' + date : ''}</small>
      ${item.state !== 'deleted' ? `<p>${formatSourceBytes((item.originalBytes ?? 0) + (item.previewBytes ?? 0))} including preview</p>` : ''}
      ${readable ? command('review-upload', 'Open copy for review', {itemId:item.id}) : ''}
      ${item.state==='published' && item.contentType.startsWith('image/') ? command('place-photo','Place in this room',{itemId:item.id}) : ''}
      ${item.declarationReceiptId && pairsValid(item.scores) ? `<details class="source-details" data-confirmed-declaration><summary>Confirmed declaration</summary>
        ${confirmedSourceScores(item.scores)}<p>Declaration Receipt <code>${esc(item.declarationReceiptId)}</code></p>
      </details>` : ''}
      ${item.state === 'uploaded' ? (proposal ? `
        <form data-form="publish" data-item-id="${esc(item.id)}">
          <fieldset class="source-standing"><legend>Confirm declaration</legend>
            <p class="source-caption">${esc(proposal.provenance)} Review the file and check both dials for each dimension.</p>
            ${basis !== 'text' ? `
              <p><strong>${basis==='image'?'What the Atlas saw':'What the Atlas heard'}</strong> ${esc(proposal.observation)}</p>
              ${proposal.descriptionDisagrees ? `<p class="source-error"><strong>${basis==='image'?'Image':'Speech'} and description disagree.</strong></p>` : ''}
            ` : ''}
            ${scoreInputs(proposal.scores)}
          </fieldset>
          <button type="submit">Confirm declaration and publish</button>
        </form>` : basis ? `
        <form data-form="score" data-item-id="${esc(item.id)}">
          ${basis !== 'text' ? `<label>${basis==='image'?'Photo':'Audio'} description <span>(optional)</span><textarea name="description" maxlength="${PHOTO_DESCRIPTION_LIMIT}" rows="2"></textarea></label>` : ''}
          <button type="submit">${basis !== 'text' ? 'Ask the Atlas to propose a declaration' : 'Request score proposal'}</button>
        </form>` : '<p class="source-caption">Live assessment requires a short PCM WAV with speech. This upload remains unpublished.</p>') : ''}
      ${deletable ? `<details class="source-details"><summary>${deleteLabel}</summary>
        <p>Deletes the stored file and preview. The Thing’s record retains a Receipt of the deletion.</p>
        ${command('delete-upload', item.state === 'reserved' ? 'Cancel upload and release reservation' : 'Delete file and preview', {itemId:item.id})}
      </details>` : ''}
    </li>`;
  }

  renderOperator() {
    const remote = this.hosted?.metrics?.served ?? [];
    const local = this.sources.meters?.(this.actor) ?? [];
    const rows = [...remote, ...local];
    return `<section class="source-panel source-operator">
      <details class="source-details"><summary>Source usage and served bytes</summary>
        ${uploadUsage(this.hosted)}
        <p class="source-caption">Measured by Place and source. Embedded video plays from its host.</p>
        ${rows.length ? `<ul class="source-items">${rows.map(row=>
          `<li><strong>${formatSourceBytes(row.servedBytes)}</strong><small>${esc(row.placeId)} · ${esc(row.sourceId)}${row.simulated ? ' · simulated source' : ''}</small></li>`).join('')}</ul>`
        : '<p class="source-caption">No served bytes have been reported.</p>'}
      </details>
    </section>`;
  }

  async uploadPending() {
    const pending = this.pendingFile;
    if (!pending || !this.uploads) throw new Error('Choose a file to upload.');
    const upload = await this.uploads.upload({file: pending.file, id: pending.id, placeId: this.context.placeId});
    const item = this.updateHostedItem(upload);
    this.pendingFile = null;
    if (item.state !== 'uploaded') return 'Upload received.';
    const basis = uploadScoreBasis(item.contentType);
    if (!basis) return 'Audio uploaded. This copy stays unpublished. Live assessment requires a short PCM WAV with speech.';
    await this.score(item, basis === 'text' ? pending.file : undefined, pending.description);
    return 'Upload received. Review the proposed dials and confirm the declaration.';
  }

  handleCommand(button) {
    const {command: action, sourceId, itemId} = button.dataset;
    if (this.busy) return;
    if (action === 'close') {
      this.dialog.close();
      return;
    }
    if (action === 'close-review') {
      this.clearReview();
      this.render();
      this.content.querySelector('button')?.focus();
      return;
    }
    if (action === 'return-editor') {
      const editedSourceId = this.editor?.sourceId;
      this.dialog.close();
      void this.emit('sources-changed', {sourceId:editedSourceId});
      return;
    }
    if (action === 'open-editor') {
      this.editor = {sourceId, itemId};
      this.render();
      (this.content.querySelector('button') ?? button).focus();
      return;
    }
    return this.run(async () => {
      if (action === 'add-gallery' || action === 'add-drive') {
        const kind = action === 'add-gallery' ? 'collection-db' : 'drive';
        const source = await this.sources.create({
          placeId: this.context.placeId, owner: this.context.actorId, kind,
          label: kind === 'drive' ? 'Mock Drive' : 'Mock gallery',
        }, this.actor);
        this.openSources.add(source.id);
        await this.emit('sources-changed', {sourceId: source.id});
        return 'Simulated source attached. Propose and approve its mapping.';
      }
      if (action === 'propose-mapping') {
        const source = this.sources.view(sourceId,this.actor).source;
        await this.sources.proposeMapping(sourceId, recipes[source.kind], this.actor);
        return 'Review the mapping and approve it to place the source items.';
      }
      if (action === 'approve-mapping') {
        const proposal = this.sources.view(sourceId,this.actor)?.pendingMapping;
        await this.sources.approveMapping(sourceId, proposal?.id, this.actor);
        await this.emit('sources-changed', {sourceId});
        return 'Mapping approved and receipted.';
      }
      if (action === 'sync') {
        await this.sources.sync(sourceId, this.actor);
        await this.emit('sources-changed', {sourceId});
        return 'Source sync checked.';
      }
      if (['exclude-item','include-item','disconnect-source'].includes(action)) {
        const source = this.sources.list(this.context.placeId,this.actor).find(item=>item.id===sourceId);
        if (source?.owner !== this.context.actorId) throw new Error('Choose a source you own in this Place.');
        if (action === 'disconnect-source') {
          await this.sources.remove(sourceId,this.actor);
          this.openSources.delete(sourceId);
        } else {
          await this.sources.setItemExcluded(sourceId,itemId,action==='exclude-item',this.actor);
        }
        await this.emit('sources-changed',{sourceId});
        if (action === 'disconnect-source') return 'Source disconnected. A Receipt records the change.';
        return action === 'exclude-item' ? 'Item excluded from this Place.' : 'Item included in this Place.';
      }
      if (action === 'availability') {
        const item = this.sources.view(sourceId,this.actor)?.items.find(candidate=>candidate.id===itemId);
        if (!item) throw new Error('The simulated item is unavailable.');
        await this.sources.setMockAvailability(sourceId,itemId,item.available === false,this.actor);
        await this.emit('sources-changed', {sourceId});
        return item.available === false ? 'Simulated reference restored.' : 'Simulated reference is now unavailable.';
      }
      if (action === 'grant-write') {
        await this.sources.grantWrite(sourceId, {
          holderId: this.context.actorId, operations: ['rename','move','comment'],
          expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        }, this.actor);
        return 'A scoped one-hour grant permits mock rename, move and comment.';
      }
      if (action === 'refresh-uploads') {
        await this.refreshUploads();
        return 'Hosted usage refreshed.';
      }
      if (action === 'retry-upload') return this.uploadPending();
      if (action === 'place-photo' || action === 'place-video') {
        const photo=action==='place-photo'&&this.hosted?.items?.find(item=>item.id===itemId&&item.state==='published'&&item.placeId===this.context.placeId);
        if(action==='place-photo'&&!photo)throw new Error('This published photo is unavailable.');
        const reference={kind:photo?'upload':'video',sourceId:photo?photo.sourceId:sourceId,itemId};
        await this.emit('source-placed',{reference});
        return 'Placed in your draft. Review and publish from Build when you are ready.';
      }
      if (action === 'review-upload') {
        const item = this.hosted?.items?.find(candidate => candidate.id === itemId && candidate.placeId === this.context.placeId);
        if (!item || !['uploaded','published'].includes(item.state)) throw new Error('This upload is unavailable.');
        const bytes = await this.uploads.media(item.id, 'original');
        const text = item.contentType === 'text/plain' ? await bytes.slice(0, 128 * 1024).text() : null;
        this.review = {item, url: URL.createObjectURL(bytes), text};
        return '';
      }
      if (action === 'delete-upload') {
        const current = this.hosted?.items?.find(item=>item.id===itemId && item.placeId===this.context.placeId);
        if (!current || !['reserved','uploaded','published','deleting'].includes(current.state)) throw new Error('This upload is unavailable.');
        let item;
        try {
          item = this.updateHostedItem(await this.uploads.remove(itemId));
        } catch(error) {
          await this.refreshUploads().catch(()=>{ /* Keep the failure message from Storage. */ });
          throw error;
        }
        if (this.pendingFile?.id === item.id) this.pendingFile = null;
        this.saveProposal(item.id, null);
        await this.emit('upload-deleted', {item});
        await this.refreshUploads();
        return 'Hosted copy deleted.';
      }
      return '';
    });
  }

  handleForm(form) {
    const {form: action, sourceId, itemId} = form.dataset;
    const values = new FormData(form);
    return this.run(async () => {
      if (action === 'mode') {
        const mode = values.get('mode');
        await this.sources.setMode(sourceId, mode, this.actor);
        await this.emit('sources-changed', {sourceId});
        return mode === 'snapshot' ? 'Simulated snapshot frozen and receipted.' : 'Feeding mode set.';
      }
      if (action === 'edit') {
        const op = values.get('op');
        const value = op === 'move' ? (values.get('folder') || null) : values.get('value').trim();
        await this.sources.patch(sourceId, itemId, {op, value}, this.actor);
        await this.emit('sources-changed', {sourceId});
        return 'Mock file updated and receipted.';
      }
      if (action === 'video') {
        const reference = videoReference(values.get('url'));
        if (!reference) throw new Error('Choose a YouTube or Vimeo video link.');
        const source = await this.sources.addVideoReference({
          placeId:this.context.placeId, owner:this.context.actorId,
          title:values.get('title').trim(), url:reference.url, visibility:'private',
        }, this.actor);
        this.openSources.add(source.id);
        await this.emit('sources-changed', {sourceId:source.id});
        return 'Video reference added. Atlas stores no video bytes.';
      }
      if (action === 'upload') {
        this.pendingFile = {file: values.get('file'), description: values.get('description').trim(), id: crypto.randomUUID()};
        return this.uploadPending();
      }
      if (action === 'score') {
        const item = this.hosted?.items?.find(candidate => candidate.id === itemId && candidate.state === 'uploaded');
        if (!item || item.placeId !== this.context.placeId) throw new Error('This upload is unavailable.');
        const basis = uploadScoreBasis(item.contentType);
        if (!basis) throw new Error('Live assessment requires a short PCM WAV with speech. This upload remains unpublished.');
        const bytes = basis === 'text' ? await this.uploads.media(item.id, 'original') : undefined;
        await this.score(item, bytes, values.get('description')?.trim() ?? '');
        await this.refreshUploads();
        return 'Review both dials for each dimension, then confirm your declaration.';
      }
      if (action === 'publish') {
        const scores = Object.fromEntries(DIMENSIONS.map(([key]) =>
          [key,Object.fromEntries(AXES.map(axis=>[axis,Number(values.get(key+'.'+axis))]))]));
        await this.publishUpload(itemId,scores);
        return 'Declaration confirmed. The uploaded copy is published to this Place.';
      }
      return '';
    });
  }
}
