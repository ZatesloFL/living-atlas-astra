import {ROOMS} from './data.js';
import {roomVisible} from './rules.js';
import {permission, personId} from './permissions.js';
import {viewRoom} from './audience.js';
import {esc} from './block-renderer.js';
import {ai} from './ai.js';
import {SourcesUI} from './sources-ui.js';
import {GALLERY_PLACE, recordUploadInventory} from './source-catalog.js';
import {uploadClient} from './source-session.js';
import {proposeUploadScores} from './upload-scores.js';
import {contentStore} from './content.js';
import {AXES,DIMENSIONS,scores,scoreText} from './scores.js';
import {BUILDER_PIECES,describeBuilderBehavior} from './builder-pieces.js';
import {LOOKS} from './item-style.js';
import {artURL} from './kit-art.js';

const panels = [['ask','Ask the Atlas'],['kit','Kit'],['inspect','Inspector'],['outline','Outline'],['audience','Preview the audience'],['sources','Sources']];
const cameras = [['orbit','Orbit'],['fly','Fly'],['top-down','Top-down']];
const metricNames = {drawCalls:'Draw calls',instances:'Instances',atlasTiles:'Atlas tiles',liveTextures:'Live textures',behaviors:'Behaviors'};
const positions = ['East / west','Height','North / south'];
const mediaFields = {
  slides:[['title','Slide title',160],['caption','Caption',600],['scene','Illustration']],
  photos:[['title','Photo title',160],['caption','Caption',600],['alt','Description',400],['credit','Credit',240],['scene','Illustration']],
  seats:[['label','Seat label',100],['caption','Seat story',600]]
};
const degrees = angle => Math.round(angle * 180 / Math.PI);
const radians = angle => angle * Math.PI / 180;
const title = piece => piece?.block?.title ?? piece?.settings?.title ?? BUILDER_PIECES[piece?.kind]?.label ?? piece?.kind ?? 'Thing';
const click = (label,action,value,extra = '') =>
  `<button type="button" data-builder-action="${action}"${value === undefined ? '' : ` data-value="${esc(value)}"`} ${extra}>${esc(label)}</button>`;
const option = (label,value,selected) => `<option value="${esc(value)}"${selected ? ' selected' : ''}>${esc(label)}</option>`;

function loadStyleSheet() {
  if (document.querySelector('[data-builder-style]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = new URL('../builder.css', import.meta.url).href;
  link.dataset.builderStyle = '';
  document.head.append(link);
}

function kitEntries() {
  return Object.values(BUILDER_PIECES).filter(piece => ['Thing','Place'].includes(piece.recordKind));
}

function measureNames(cost = {}) {
  return Object.keys(cost).filter(key => metricNames[key]);
}

function renderedScores(value) {
  const declaration = scores(value);
  return DIMENSIONS.map(([key,label]) => `<div class="builder-score-row"><span>${esc(label)}</span>${
    AXES.map(axis => `<label>${axis === 'amount' ? 'Amount' : 'Graphicness'}<select name="score.${key}.${axis}" aria-label="${esc(label)} ${axis}">${[0,1,2,3].map(value=>option(value,value,value===declaration[key][axis])).join('')}</select></label>`).join('')
  }</div>`).join('');
}

function changesIn(draft) {
  const before = new Map((draft.basePieces ?? []).map(piece => [piece.id,piece]));
  const after = new Map(draft.pieces.map(piece => [piece.id,piece]));
  const result = [];
  for (const [id,piece] of after) {
    const old = before.get(id);
    if (!old) {
      const declaration=scores(piece.block?.content);
      const changed= DIMENSIONS.filter(([key])=>AXES.some(axis=>declaration[key][axis]!==0));
      const details=changed.map(([key,label])=>label+' '+scoreText(declaration[key]));
      if (changed.length<DIMENSIONS.length) details.push((changed.length?'Other dimensions':'All dimensions')+' '+scoreText());
      result.push({label:'Added',piece,details:details.join(' · ')});
    }
    else {
      const changes = [];
      if (JSON.stringify(old.transform)!==JSON.stringify(piece.transform)) changes.push('Position, rotation or size');
      if (JSON.stringify(old.settings)!==JSON.stringify(piece.settings) || old.block?.title!==piece.block?.title) changes.push('Settings');
      if (JSON.stringify(old.block?.style)!==JSON.stringify(piece.block?.style)) changes.push('Style');
      if (JSON.stringify(old.behaviors)!==JSON.stringify(piece.behaviors)) changes.push('Behaviors');
      const dials = DIMENSIONS.filter(([key])=>JSON.stringify(old.block?.content?.[key])!==JSON.stringify(piece.block?.content?.[key]));
      if (dials.length) changes.push(dials.map(([key,label])=>label+' '+scoreText(old.block?.content?.[key])+
        ' → '+scoreText(piece.block?.content?.[key])).join(' · '));
      if (changes.length) result.push({label:'Changed',piece,details:changes.join(' · ')});
    }
  }
  for (const [id,piece] of before) if (!after.has(id)) result.push({label:'Removed from layout',piece,details:''});
  return result;
}

export class BuildUI {
  constructor(ui, profiles, api) {
    this.ui = ui;
    this.profiles = profiles;
    this.api = api;
    this.builder = api.builder;
    this.draft = null;
    this.active = false;
    this.panel = 'ask';
    this.camera = 'orbit';
    this.left = null;
    this.right = 'seed-child';
    this.split = false;
    this.diff = false;
    this.fraction = .5;
    this.track = [];
    this.sources = new SourcesUI({
      uploads: uploadClient,
      proposeScores: input => proposeUploadScores(ai,input),
      onChange: ({type,items,room,lens}) => {
        if (type==='uploads-listed') recordUploadInventory(items,lens);
        else if (type==='sources-changed' && this.api.sourceChanged) this.api.sourceChanged(room.id);
        else contentStore.emit(room.id);
      }
    });
    this.mount();
  }

  mount() {
    loadStyleSheet();
    const root = document.createElement('aside');
    root.className = 'builder-hud';
    root.id = 'builder-hud';
    root.hidden = true;
    root.setAttribute('aria-label','Build mode');
    root.innerHTML = `<header class="builder-top"></header><p class="builder-status" aria-live="polite" role="status" hidden></p>
      <section class="builder-dock"><nav class="builder-tabs" aria-label="Build tools"></nav>
      <div class="builder-panel" id="builder-panel"></div></section>`;
    this.root = root;
    this.header = root.querySelector('.builder-top');
    this.statusLine = root.querySelector('.builder-status');
    this.tabs = root.querySelector('.builder-tabs');
    this.drawer = root.querySelector('.builder-panel');
    root.addEventListener('click',event=> {
      const button = event.target.closest('button[data-builder-action]');
      if (button && root.contains(button)) this.command(button.dataset.builderAction,button.dataset.value);
    });
    root.addEventListener('submit',event=>{
      event.preventDefault();
      this.submit(event.target);
    });
    root.addEventListener('change',event=>this.changed(event.target));
    root.addEventListener('pointerdown',event=>this.startKitDrag(event));
    root.addEventListener('pointerup',event=>this.finishKitDrag(event));
    root.addEventListener('pointercancel',()=>{this.kitDrag=null;});
    document.body.append(root);

    this.hud = document.createElement('aside');
    this.hud.id = 'preview-hud';
    this.hud.hidden = true;
    this.hud.innerHTML = '<span></span><button data-controls>Controls</button><button data-exit>Exit preview</button>';
    if (this.api.hud) this.api.hud.mount(this.hud,80);
    else document.body.append(this.hud);
    this.hud.querySelector('[data-controls]').onclick = () => this.open();
    this.hud.querySelector('[data-exit]').onclick = () => this.exit();

    this.divider = document.createElement('div');
    this.divider.id = 'compare-divider';
    this.divider.hidden = true;
    this.divider.innerHTML = '<button aria-label="Swipe comparison divider" role="slider" aria-valuemin="10" aria-valuemax="90" aria-valuenow="50">↔</button>';
    document.body.append(this.divider);
    const grip = this.divider.querySelector('button');
    grip.onpointerdown = event => {grip.setPointerCapture(event.pointerId);event.preventDefault();};
    grip.onpointermove = event => {
      if (grip.hasPointerCapture(event.pointerId)) this.setDivider(event.clientX/innerWidth);
    };
    grip.onkeydown = event => {
      if (!['ArrowLeft','ArrowRight'].includes(event.key)) return;
      event.preventDefault();
      this.setDivider(this.fraction+(event.key==='ArrowRight'?.05:-.05));
    };
  }

  get placing() {
    return this.active && !this.previewState && !!this.placementKind;
  }

  open() {
    if (this.active) {
      this.root.hidden = false;
      if (!this.panel) this.panel = this.draft ? 'ask' : 'audience';
      this.render();
      return;
    }
    if (this.legacyPreview) {
      this.active=true;
      this.panel='audience';
      this.updateMode();
      this.render();
      return;
    }
    const {context,lens} = this.ui.api.state();
    this.entry = {roomKey:context.room,lens};
    this.lens = lens;
    this.active = true;
    this.panel = 'outline';
    this.ui.close();
    this.updateMode();
    const places = this.builder?.list(lens) ?? [];
    const choice = places.find(place=>place.roomKey===context.room);
    if (choice) {
      this.openPlace(choice.roomKey);
    } else {
      // The existing audience inspector remains available on the Place being visited.
      this.panel = 'audience';
      this.render();
    }
  }

  openPlace(roomKey) {
    this.run(async()=>{
      const draft = await this.builder.open(roomKey,this.lens);
      this.draft = draft;
      this.panel = 'ask';
      this.selectedId = null;
      this.previewState = null;
      this.proposal = draft.proposals?.findLast(proposal=>proposal.status==='pending')??null;
      this.left = this.profiles.profiles.some(profile=>profile.id==='seed-visitor')?'seed-visitor':this.profiles.activeId;
      this.track = [];
      this.placementKind = null;
      this.status('');
      this.renderStage();
    });
  }

  updateMode() {
    this.root.hidden = !this.active;
    document.body.classList.toggle('build-mode',this.active);
    document.body.classList.toggle('build-preview',this.active && !!this.previewState);
    this.updatePreviewChrome();
  }

  status(value,error=false) {
    this.statusLine.textContent = value ?? '';
    this.statusLine.hidden = !value;
    this.statusLine.classList.toggle('builder-error',error);
  }

  async run(action) {
    if (this.busy) return;
    this.busy = true;
    this.root.setAttribute('aria-busy','true');
    this.drawer.inert = true;
    try {
      return await action();
    } catch(error) {
      this.status(error?.message ?? 'Build could not complete that action.',true);
    } finally {
      this.busy = false;
      this.root.removeAttribute('aria-busy');
      this.drawer.inert = false;
      if (this.active) this.render();
    }
  }

  renderStage() {
    if (!this.draft) return;
    this.api.stage?.({
      roomKey: this.draft.roomKey, draft: this.draft, selectedId: this.selectedId,
      camera: this.camera, preview: this.previewState, lens: this.lens
    });
    this.updateMode();
  }

  render() {
    const oldScroll = this.drawer.scrollTop;
    this.root.dataset.camera = this.camera;
    const name = this.draft?.title ?? ROOMS[this.entry?.roomKey]?.title ?? 'Places you can edit';
    this.header.innerHTML = `<div class="builder-ribbon"><div class="builder-title">
      <h2>${this.previewState ? 'Visitor preview' : 'Build'}</h2>
      <p>${esc(name)}${this.draft?.dirty && !this.previewState ? ' · Draft' : ''}</p></div>
      ${click('Back to visiting','exit',undefined,'class="builder-exit"')}</div>
      ${this.draft ? `<nav class="builder-camera" aria-label="Build camera">${cameras.map(([key,label])=>
        click(label,'camera',key,`aria-pressed="${this.camera===key}"`)).join('')}
        ${this.previewState ? click('Return to draft','return-draft') : click('Review & publish','review',undefined,'class="builder-primary"')}
      </nav>` : ''}`;
    const available = this.draft ? panels : panels.filter(([id])=>['outline','audience','sources'].includes(id));
    this.tabs.innerHTML = available.map(([key,label])=>click(label,'panel',key,`aria-pressed="${this.panel===key}" aria-controls="builder-panel"`)).join('');
    const renderPanel = {
      ask:()=>this.renderAsk(),kit:()=>this.renderKit(),inspect:()=>this.renderInspector(),outline:()=>this.renderOutline(),
      audience:()=>this.renderAudience(),sources:()=>this.renderSources(),review:()=>this.renderReview()
    }[this.panel];
    this.drawer.hidden = !renderPanel;
    this.drawer.innerHTML = renderPanel?.() ?? '';
    this.drawer.scrollTop = oldScroll;
    this.updatePreviewChrome();
    this.updateLegacyDiff();
  }

  renderAsk() {
    return `<header class="builder-panel-head"><h3>Ask the Atlas</h3>${click('Hide panel','hide-panel')}</header>
      <form data-builder-form="ask" class="builder-ask">
        <label for="builder-question">What would you like to change?</label>
        <textarea id="builder-question" name="prompt" rows="2" maxlength="260" required placeholder="Add a lantern beside the reading area"></textarea>
        <button type="submit" class="builder-primary"${this.proposal?' disabled':''}>Ask the Atlas</button>
      </form>
      ${this.proposal ? `<article class="builder-proposal">
        <strong>Scripted proposal</strong><p>${esc(this.proposal.summary ?? this.proposal.text)}</p>
        <div class="builder-actions">${click('Keep in draft','keep-proposal',this.proposal.id,'class="builder-primary"')}${click('Dismiss','dismiss-proposal',this.proposal.id)}</div>
      </article>` : ''}
      ${this.track.length ? `<ul class="builder-track">${this.track.slice(-3).map(message=>`<li>${esc(message)}</li>`).join('')}</ul>` : ''}`;
  }

  renderBudget() {
    const budget = this.builder?.budget(this.draft.roomKey,this.lens);
    if (!budget) return '';
    return `<section class="builder-budget" aria-label="Room budget"><strong>Room budget</strong><div class="builder-budget-values">${measureNames(budget.cost).map(key=>
      `<span>${esc(metricNames[key])} <b>${budget.cost[key]} / ${budget.limit[key]}</b></span>`).join('')}</div>
      ${budget.over?.length ? `<p class="builder-error">${budget.over.map(({key,actual,limit})=>`${esc(metricNames[key]??key)} ${actual} exceeds ${limit}`).join(' · ')}</p>` : ''}
    </section>`;
  }

  renderKit() {
    const group = Object.groupBy(kitEntries(),piece=>piece.category);
    const selected = BUILDER_PIECES[this.placementKind];
    return `<header class="builder-panel-head"><h3>Kit</h3>${click('Hide panel','hide-panel')}</header>
      ${selected ? `<div class="builder-actions"><p>Placing ${esc(selected.label)}. Tap the Blueprint to place it.</p>${click('Place at center','place-center')}${click('Cancel placement','cancel-placement')}</div>` : ''}
      ${Object.entries(group).map(([category,definitions])=>`<section class="builder-kit-group"><h4>${esc(category)}</h4><div class="builder-kit-grid">
        ${definitions.map(definition=>`<button type="button" class="builder-tile" data-builder-action="choose-kit" data-value="${esc(definition.kind)}" aria-pressed="${this.placementKind===definition.kind}">
          <strong>${esc(definition.label)}</strong><small>${definition.cost.drawCalls} draws · ${definition.cost.instances} instances</small></button>`).join('')}
      </div></section>`).join('')}
      ${this.renderBudget()}`;
  }

  renderSettings(piece,definition) {
    return (definition?.settingsFields ?? []).map(field=>{
      if (field.key==='title' && piece.block) return '';
      const value = piece.settings?.[field.key];
      if (field.type==='list') return this.renderListSetting(field,value);
      const name = `settings.${field.key}`;
      if (Array.isArray(field.options)) {
        return `<label>${esc(field.label)}<select name="${esc(name)}">${field.options.map(item=>option(item,item,item===value)).join('')}</select></label>`;
      }
      return field.type==='number'
        ? `<label>${esc(field.label)}<input type="number" name="${esc(name)}" value="${esc(value)}" min="${esc(field.min??'')}" max="${esc(field.max??'')}" step="any"></label>`
        : `<label>${esc(field.label)}<input maxlength="${esc(field.maxLength??160)}" name="${esc(name)}" value="${esc(value)}"></label>`;
    }).join('');
  }

  renderListSetting(field,value=[]) {
    return `<details class="builder-record"><summary>${esc(field.label)}</summary>${value.map((item,index)=>{
      const name='settings.'+field.key+'.'+index;
      if (typeof item==='string') return `<label>Item ${index+1}<textarea name="${esc(name)}" maxlength="1500" rows="2" required>${esc(item)}</textarea></label>`;
      return `<fieldset><legend>Item ${index+1}</legend>${(mediaFields[field.key]??[]).map(([key,label,maxLength])=>key==='scene'
        ? `<label>${label}<select name="${esc(name+'.'+key)}">${[0,1,2,3,4,5].map(scene=>option('Illustration '+(scene+1),scene,item.scene===scene)).join('')}</select></label>`
        : `<label>${label}<input name="${esc(name+'.'+key)}" value="${esc(item[key])}" maxlength="${maxLength}" required></label>`
      ).join('')}</fieldset>`;
    }).join('')}</details>`;
  }

  renderInspector() {
    const piece = this.draft.pieces.find(item=>item.id===this.selectedId);
    if (!piece) return `<header class="builder-panel-head"><h3>Inspector</h3>${click('Hide panel','hide-panel')}</header><p>Tap a Thing in the Blueprint or choose one from the outline.</p>${click('Open outline','panel','outline')}`;
    const definition = BUILDER_PIECES[piece.kind];
    const {position,yaw,scale} = piece.transform;
    const choices = this.availableBehaviors(piece);
    return `<header class="builder-panel-head"><h3>${esc(title(piece))}</h3>${click('Hide panel','hide-panel')}</header>
      <form data-builder-form="piece">
        <fieldset><legend>Placement</legend><div class="builder-fields">
          ${positions.map((label,index)=>`<label>${label}<input type="number" inputmode="decimal" name="position.${index}" value="${position[index]}" step=".5" min="-30" max="30" required></label>`).join('')}
          <label>Turn in degrees<input type="number" inputmode="decimal" name="yaw" value="${degrees(yaw)}" step="any" required></label>
          <label>Size<input type="number" inputmode="decimal" name="scale" value="${scale}" min="${definition?.limits?.minScale??.25}" max="${definition?.limits?.maxScale??4}" step="any" required></label>
        </div></fieldset>
        ${piece.block ? `<label>Name<input name="title" value="${esc(title(piece))}" maxlength="120" required></label>` : ''}
        ${piece.block ? `<label>Style<select name="preset" aria-label="Style">
          ${option('Use Place style','',!piece.block.style?.preset)}
          ${Object.keys(LOOKS).map(look=>option(look,look,look===piece.block.style?.preset)).join('')}
        </select></label>` : ''}
        ${this.renderSettings(piece,definition)}
        ${piece.block ? `<details class="builder-record"><summary>Declaration</summary><fieldset><legend>Amount and graphicness</legend>${renderedScores(piece.block.content)}</fieldset></details>` : ''}
        <button type="submit" class="builder-primary">Apply draft edits</button>
      </form>
      <details class="builder-record"><summary>Behaviors${piece.behaviors.length ? ` · ${piece.behaviors.length}` : ''}</summary>
        ${piece.behaviors.length ? `<ul class="builder-behavior-list">${piece.behaviors.map((behavior,index)=>
          `<li><span>${esc(describeBuilderBehavior(behavior))}</span>${click('Remove','remove-behavior',index,`aria-label="Remove behavior ${index+1}"`)}</li>`).join('')}</ul>` : ''}
        ${choices.length ? `<form data-builder-form="behavior">
          <label>When → If → Then<select name="behavior" required>${choices.map((behavior,index)=>option(describeBuilderBehavior(behavior),index,false)).join('')}</select></label>
          <button type="submit">Add behavior</button>
        </form>` : !piece.behaviors.length ? '<p>There are no behaviors for this Thing.</p>' : ''}
      </details>
      <div class="builder-actions">${click('Duplicate','duplicate',piece.id)}${click('Remove from draft','remove',piece.id)}</div>`;
  }

  availableBehaviors(piece) {
    return (BUILDER_PIECES[piece.kind]?.behaviorChoices??[]).filter(rule=>
      !piece.behaviors.some(existing=>existing.when===rule.when&&existing.then===rule.then));
  }

  renderOutline() {
    const places = this.builder?.list(this.lens) ?? [];
    const history = this.draft ? this.builder.history(this.draft.roomKey,this.lens) : [];
    const pieces = this.draft?.pieces ?? [];
    return `<header class="builder-panel-head"><h3>Outline</h3>${click('Hide panel','hide-panel')}</header>
      <label>Places you can edit<select id="builder-places" aria-label="Places you can edit">
        ${option(places.length?'Choose a Place':'No editable Places', '',!this.draft)}
        ${places.map(place=>option(place.title+(place.dirty?' · Draft':''),place.roomKey,place.roomKey===this.draft?.roomKey)).join('')}
      </select></label>
      ${pieces.length ? `<ul class="builder-outline">${pieces.map(piece=>`<li>${click(title(piece),'select',piece.id,`aria-pressed="${piece.id===this.selectedId}"`)}<small>${esc(BUILDER_PIECES[piece.kind]?.label??piece.kind)}</small></li>`).join('')}</ul>`:''}
      ${this.draft ? `<div class="builder-actions">${click('Undo','undo',undefined,this.draft.canUndo?'':'disabled')}${click('Redo','redo',undefined,this.draft.canRedo?'':'disabled')}</div>${this.renderBudget()}` : ''}
      ${history?.length ? `<details class="builder-record"><summary>Published versions and Receipts</summary>
        <ul class="builder-outline">${history.map(revision=>`<li><span>${esc(revision.receipt?.time ?? revision.revisionId)}</span>
          ${click('Restore as draft','restore',revision.revisionId)}</li>`).join('')}</ul></details>` : ''}`;
  }

  readReport(assessment) {
    const checks = assessment?.checks;
    if (!checks) return '';
    return `<section class="builder-crossing" aria-label="Visitor check">
      <strong>${checks.canEnter ? 'Visitor can enter' : 'Visitor cannot enter'}</strong>
      ${checks.description ? `<p>${esc(checks.description)}</p>` : ''}
      ${Array.isArray(checks.reasons) && checks.reasons.length ? `<ul>${checks.reasons.map(reason=>`<li>${esc(reason)}</li>`).join('')}</ul>` : ''}
      ${Array.isArray(checks.shown) && Array.isArray(checks.withheld) ? `<p>${checks.shown.length} shown · ${checks.withheld.length} withheld</p>` : ''}
    </section>`;
  }

  renderAudience() {
    const names = this.profiles.profiles;
    const selected = this.left ?? this.profiles.activeId;
    return `<header class="builder-panel-head"><h3>Preview the audience</h3>${click('Hide panel','hide-panel')}</header>
      <span class="builder-note">Preview as · left view</span>
      <div class="builder-actions">${names.map(profile=>`<button type="button" data-builder-action="preview-profile" data-value="${esc(profile.id)}" data-preview-profile="${esc(profile.id)}" aria-pressed="${profile.id===selected}">${esc(profile.name)}</button>`).join('')}</div>
      <label>Compare with<select id="compare-profile">${names.map(profile=>option(profile.name,profile.id,profile.id===this.right)).join('')}</select></label>
      <label class="builder-check"><input type="checkbox" id="split-compare" ${this.split?'checked':''}> Split compare · swipe divider</label>
      <label class="builder-check"><input type="checkbox" id="lens-diff" ${this.diff?'checked':''}> Lens diff · show visible differences</label>
      <p class="builder-note">Preview uses the visitor’s Lens and door terms without changing the saved profile or recording a visit.</p>
      ${this.readReport(this.previewState?.assessment)}
      <div id="lens-diff-list"></div>
      <div class="builder-actions">
        <button type="button" id="build-view" data-builder-action="view-preview" class="builder-primary">View scene</button>
        <button type="button" id="build-exit" data-builder-action="${this.draft?'return-draft':'exit'}">${this.draft?'Return to draft':'Exit preview'}</button>
      </div>`;
  }

  renderSources() {
    const current = ROOMS[this.draft?.roomKey ?? this.entry?.roomKey];
    const owner = current?.ownerId===personId(this.lens) && !this.lens.preview && !this.lens.isAgent;
    return `<header class="builder-panel-head"><h3>Sources</h3>${click('Hide panel','hide-panel')}</header>
      <div class="builder-actions">${owner ? click('Connected sources','open-sources') : ''}${click('Visit the simulated gallery','gallery')}</div>`;
  }

  renderReview() {
    const changes = changesIn(this.draft);
    const budget = this.builder.budget(this.draft.roomKey,this.lens);
    return `<header class="builder-panel-head"><h3>Review publication</h3>${click('Back to draft','panel','outline')}</header>
      ${changes.length ? `<ul class="builder-review-list">${changes.map(({label,piece,details})=>`<li>
        ${this.reviewImage(piece)}
        <span class="builder-review-kind">${esc(BUILDER_PIECES[piece.kind]?.label??piece.kind)}</span>
        <strong>${esc(label)} · ${esc(title(piece))}</strong>${details?`<p>${esc(details)}</p>`:''}</li>`).join('')}</ul>` : '<p>No changes from the published version.</p>'}
      ${this.readReport(this.assessment)}
      ${this.renderBudget()}
      ${click('Publish this draft','publish',undefined,`class="builder-primary"${!budget?.valid||!this.draft.dirty?' disabled':''}`)}
    `;
  }

  reviewImage(piece) {
    const sample=piece.settings?.photos?.[0]??piece.settings?.slides?.[0];
    return Number.isInteger(sample?.scene)
      ? `<img class="builder-review-image" src="${esc(artURL(sample.scene,title(piece)))}" alt="${esc(sample.alt??sample.title)}">` : '';
  }

  selectPiece(id) {
    if (!this.active || !this.draft || this.previewState || !this.draft.pieces.some(piece=>piece.id===id)) return false;
    this.selectedId = id;
    this.panel = 'inspect';
    this.renderStage();
    this.render();
    return true;
  }

  chooseKit(kind) {
    if (this.previewState) this.returnToDraft();
    this.placementKind = kind;
    this.panel = 'kit';
    this.status('Tap the Blueprint to place '+BUILDER_PIECES[kind].label+'.');
    this.render();
  }

  startKitDrag(event) {
    const tile = event.target.closest('[data-builder-action=choose-kit]');
    if (!tile || this.busy || !this.api.pickBuildPosition || event.button!==0) return;
    this.kitDrag={kind:tile.dataset.value,x:event.clientX,y:event.clientY,tile};
    tile.setPointerCapture?.(event.pointerId);
  }

  finishKitDrag(event) {
    const drag=this.kitDrag;
    this.kitDrag=null;
    if (!drag || Math.hypot(event.clientX-drag.x,event.clientY-drag.y)<12) return;
    const target=document.elementFromPoint(event.clientX,event.clientY);
    if (target?.closest('#builder-hud') || !target) return;
    const position=this.api.pickBuildPosition({x:event.clientX,y:event.clientY});
    if (!position) return;
    this.ignoreKitClick=true;
    this.placementKind=drag.kind;
    this.placeAt(position);
  }

  placeAt(point) {
    if (!this.placing) return false;
    const kind = this.placementKind;
    const [x,y,z] = Array.isArray(point) ? (point.length===2 ? [point[0],0,point[1]] : point) : [point?.x,point?.y??0,point?.z];
    if (![x,y,z].every(Number.isFinite)) return false;
    this.run(async()=>{
      const draft = await this.builder.add(this.draft.roomKey,this.lens,kind,{position:[x,y,z]});
      this.placementKind = null;
      this.applyDraft(draft);
      this.selectedId = draft.pieces.at(-1)?.id ?? null;
      if (this.selectedId) this.panel = 'inspect';
      this.status('Placed in draft.');
      this.renderStage();
    });
    return true;
  }

  applyDraft(draft) {
    if (draft?.pieces) this.draft=draft;
    if (!this.draft.pieces.some(piece=>piece.id===this.selectedId)) this.selectedId=null;
    this.assessment=null;
    this.previewState=null;
  }

  async edit(method,...args) {
    return this.run(async()=>{
      const draft = await this.builder[method](this.draft.roomKey,this.lens,...args);
      this.applyDraft(draft);
      if (method==='duplicate') this.selectedId=this.draft.pieces.at(-1)?.id;
      this.status(method==='restore' ? 'Version restored as a draft.' : 'Draft saved.');
      this.renderStage();
    });
  }

  command(action,value) {
    if (this.busy) return;
    if (action==='exit') {this.exit();return;}
    if (action==='hide-panel') {this.panel=null;this.render();return;}
    if (action==='panel') {
      if (!['audience','outline','sources'].includes(value) && !this.draft) return;
      this.panel=this.panel===value ? null : value;
      this.render();
      return;
    }
    if (action==='camera') {this.camera=value;this.renderStage();this.render();return;}
    if (action==='choose-kit') {
      if (this.ignoreKitClick) {this.ignoreKitClick=false;return;}
      this.chooseKit(value);
      return;
    }
    if (action==='cancel-placement') {this.placementKind=null;this.status('');this.render();return;}
    if (action==='place-center') {this.placeAt({x:0,z:0});return;}
    if (action==='select') {this.selectPiece(value);return;}
    if (['undo','redo'].includes(action)) {this.edit(action);return;}
    if (['remove','duplicate','restore'].includes(action)) {this.edit(action,value);return;}
    if (action==='remove-behavior') {
      const piece=this.draft.pieces.find(item=>item.id===this.selectedId);
      if (piece) this.edit('update',piece.id,{behaviors:piece.behaviors.filter((rule,index)=>index!==Number(value))});
      return;
    }
    if (action==='open-sources') {
      const room=ROOMS[this.draft?.roomKey??this.entry.roomKey];
      if (room) this.sources.open({room,lens:this.lens});
      return;
    }
    if (action==='gallery') {this.exit();this.ui.api.travel(GALLERY_PLACE);return;}
    if (action==='preview-profile') {this.left=value;this.preview();return;}
    if (action==='view-preview') {this.preview(true);return;}
    if (action==='return-draft') {this.returnToDraft();return;}
    if (action==='review') {
      this.run(async()=>{
        this.assessment=await this.builder.preview(this.draft.roomKey,this.lens,this.selectedLens());
        this.panel='review';
        this.status('');
      });
      return;
    }
    if (action==='publish') {
      this.run(async()=>{
        const {draft,receipt}=await this.builder.publish(this.draft.roomKey,this.lens);
        this.applyDraft(draft);
        this.panel='outline';
        this.status(receipt?.id ? 'Published · Receipt '+receipt.id : 'Published.');
        this.renderStage();
      });
      return;
    }
    if (['keep-proposal','dismiss-proposal'].includes(action)) {
      this.run(async()=>{
        const keep=action==='keep-proposal';
        const draft = await this.builder[keep?'accept':'reject'](this.draft.roomKey,this.lens,value);
        this.applyDraft(draft);
        this.proposal=null;
        this.track.push(keep?'Kept in the draft.':'Proposal dismissed.');
        this.status(keep?'Proposal kept in the draft.':'Proposal dismissed.');
        this.renderStage();
      });
    }
  }

  submit(form) {
    const values = new FormData(form);
    if (form.dataset.builderForm==='ask') {
      this.run(async()=>{
        const text=String(values.get('prompt')??'').trim();
        if (!text) throw new Error('Tell the Atlas what you want to change.');
        this.proposal=await this.builder.propose(this.draft.roomKey,this.lens,text);
        this.track.push(text);
        this.status('The Atlas proposed a draft edit. Review it before keeping it.');
      });
      return;
    }
    const piece=this.draft?.pieces.find(item=>item.id===this.selectedId);
    if (!piece) return;
    const definition=BUILDER_PIECES[piece.kind];
    if (form.dataset.builderForm==='behavior') {
      const rule=this.availableBehaviors(piece)[Number(values.get('behavior'))];
      if (!rule) return;
      this.edit('update',piece.id,{behaviors:[...piece.behaviors,rule]});
      return;
    }
    const position=positions.map((label,index)=>Number(values.get('position.'+index)));
    const settings={...(piece.settings??{})};
    for (const field of definition?.settingsFields ?? []) {
      const name='settings.'+field.key;
      if (field.type==='list') {
        settings[field.key]=settings[field.key].map((item,index)=>{
          if(typeof item==='string')return values.get(name+'.'+index);
          return Object.fromEntries(Object.entries(item).map(([key,original])=>{
            const value=values.get(name+'.'+index+'.'+key);
            return [key,value===null?original:key==='scene'?Number(value):value];
          }));
        });
        continue;
      }
      const value=values.get(field.key==='title' && piece.block?'title':name);
      if (value!==null) settings[field.key]=field.type==='number' ? Number(value) : value;
    }
    const turn=Number(values.get('yaw'));
    const yaw=turn===degrees(piece.transform.yaw)?piece.transform.yaw:radians(turn);
    const patch={transform:{position,yaw,scale:Number(values.get('scale'))},settings};
    if (piece.block) patch.block={
      title:String(values.get('title')??''),
      content:Object.fromEntries(DIMENSIONS.map(([key])=>[key,Object.fromEntries(AXES.map(axis=>[axis,Number(values.get('score.'+key+'.'+axis))]))]))
    };
    const preset=values.get('preset');
    if (piece.block && preset!==(piece.block.style?.preset??'')) {
      patch.block.style=preset ? {preset} : null;
    }
    if (piece.block && typeof settings.text==='string' &&
      (settings.text!==piece.settings.text || (!settings.text && piece.block.body===piece.block.title && patch.block.title!==piece.block.title))) {
      patch.block.body=settings.text || patch.block.title;
    }
    this.edit('update',piece.id,patch);
  }

  changed(target) {
    if (target.id==='builder-places') {if(target.value)this.openPlace(target.value);return;}
    if (target.id==='compare-profile') this.right=target.value;
    else if (target.id==='split-compare') this.split=target.checked;
    else if (target.id==='lens-diff') this.diff=target.checked;
    else return;
    this.preview();
  }

  selectedLens(id=this.left??this.profiles.activeId) {
    return this.api.previewLens?.(id) ?? this.api.lenses()?.left ?? this.lens;
  }

  preview(viewScene=false) {
    this.left ??= this.profiles.activeId;
    if (!this.draft) {
      this.legacyPreview=true;
      this.api.apply({left:this.left,right:this.right,split:this.split,diff:this.diff,fraction:this.fraction});
      if (viewScene) {
        this.active=false;
        this.panel='audience';
        this.updateMode();
      } else this.render();
      return;
    }
    this.run(async()=>{
      const left=this.selectedLens(),right=this.selectedLens(this.right);
      const assessment=await this.builder.preview(this.draft.roomKey,this.lens,left);
      this.previewState={left,right,split:this.split,diff:this.diff,fraction:this.fraction,assessment};
      this.placementKind=null;
      this.status('');
      if (viewScene) this.panel=null;
      this.renderStage();
    });
  }

  returnToDraft() {
    if (!this.draft) {this.exit();return;}
    this.previewState=null;
    this.panel='outline';
    this.status('');
    this.renderStage();
    this.render();
  }

  setDivider(position) {
    this.fraction=Math.max(.1,Math.min(.9,position));
    if (this.previewState) this.previewState.fraction=this.fraction;
    this.api.split?.(this.fraction);
    this.divider.style.left=this.fraction*100+'%';
    this.divider.querySelector('button').setAttribute('aria-valuenow',Math.round(this.fraction*100));
  }

  updatePreviewChrome() {
    const legacyVisible=this.legacyPreview && !this.active;
    this.hud.hidden=!legacyVisible;
    const split=legacyVisible && this.split || this.active && this.previewState?.split;
    this.divider.hidden=!split;
    document.body.classList.toggle('comparing',!!split);
    this.setDivider(this.fraction);
    if (legacyVisible) {
      const names = id=>this.profiles.profiles.find(profile=>profile.id===id)?.name ?? 'Profile';
      this.hud.querySelector('span').textContent=`PREVIEW · ${names(this.left)}${this.split?` ← | → ${names(this.right)}`:this.diff?' · diff '+names(this.right):''}`;
    }
  }

  updateLegacyDiff() {
    const root=this.drawer.querySelector('#lens-diff-list');
    if (!root || !this.legacyPreview || !this.diff || !this.api.lenses) return;
    const {left,right}=this.api.lenses();
    const rows=Object.entries(ROOMS).filter(([id,room])=>permission(room,left).visibility==='public' &&
      (roomVisible(id,left)!==roomVisible(id,right)||viewRoom(room,left).version?.id!==viewRoom(room,right).version?.id))
      .map(([id,room])=>`${room.title} · ${roomVisible(id,left)?viewRoom(room,left).version?.name??'Visible':'Hidden'} / ${roomVisible(id,right)?viewRoom(room,right).version?.name??'Visible':'Hidden'}`);
    root.innerHTML=`<p class="builder-note">${rows.map(esc).join('<br>')||'No public Place differences at these settings.'}</p>`;
  }

  exit() {
    const legacy=this.legacyPreview;
    const staged=!!this.draft;
    if (this.busy) return;
    this.active=false;
    this.draft=null;
    this.legacyPreview=false;
    this.previewState=null;
    this.placementKind=null;
    this.left=null;
    this.split=this.diff=false;
    this.status('');
    this.updateMode();
    if (legacy) this.api.exit();
    if (staged) this.api.endStage?.();
    this.ui.close();
  }
}
