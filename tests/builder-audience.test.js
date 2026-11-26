import assert from 'node:assert/strict';
import test from 'node:test';
import {AccessStore} from '../src/access-store.js';
import {Builder} from '../src/builder.js';
import {BuildUI} from '../src/build-ui.js';
import {registerProjection} from '../src/build-projection.js';
import {ROOMS} from '../src/data.js';
import {makeProfile,seedProfiles} from '../src/profiles.js';
import {scores} from '../src/scores.js';

async function fixture(t) {
  const owner=makeProfile('Owner');
  const placeId=`audience-${crypto.randomUUID()}`;
  registerProjection({projection:{schemaVersion:2,rootPlaceId:placeId,rooms:[{
    placeId,parentPlaceId:null,pathIds:[],pieces:[],behaviors:[],layout:{kind:'courtyard'}
  }]},changes:[{op:'create',kind:'Place',ref:{placeId},fields:{
    title:'Private workshop',visibility:'hidden',content:scores(),blocks:[]
  }}]}, {ownerId:owner.id});
  t.after(()=>{delete ROOMS[placeId];});
  const state=new Map();
  const storage=()=>({getItem:key=>state.get(key)??null,setItem:(key,value)=>state.set(key,value)});
  const access=new AccessStore(storage);
  const builder=new Builder({storage});
  const profiles=[owner,...seedProfiles()];
  const previewLens=id=>access.lens({...profiles.find(profile=>profile.id===id),profileId:id,preview:true});
  const lens={...previewLens(owner.id),preview:false};
  const opened=[];
  const view=Object.assign(Object.create(BuildUI.prototype),{
    builder,ui:{api:{accessRoom:key=>opened.push(key)}},api:{previewLens},
    profiles:{profiles,activeId:owner.id},lens,left:'seed-visitor',right:'seed-child',
    split:false,diff:false,renderStage(){},status(){}
  });
  await builder.add(placeId,lens,'bench');
  view.draft=builder.open(placeId,lens);
  return {view,access,owner,lens,placeId,opened};
}

test('Publication review follows real private entry, a named grant, and the Public visibility setting',async t=>{
  const {view,access,owner,lens,placeId,opened}=await fixture(t);
  assert.match(view.renderReview(),/Only you — this place is private/);
  assert.match(view.renderReview(),/Publishes in <strong>Private workshop/);
  assert.match(view.renderReview(),/0 shown · 1 withheld/);
  assert.match(view.renderReview(),/Public<\/strong> under Visibility and select <strong>Save visibility/);
  view.command('manage-access',placeId);
  assert.deepEqual(opened,[placeId]);

  view.setAudiencePreview({},false);
  assert.equal(view.previewState.blocked,true);
  assert.match(view.renderAudience(),/Others see nothing because this Place is private/);
  view.left=owner.id;
  view.setAudiencePreview({},true);
  assert.equal(view.previewState.blocked,false);
  assert.equal(view.previewState.assessment.checks.shown.length,1);

  view.left='seed-visitor';
  const guest=await access.grant(placeId,{person:view.left},'enter',null,lens);
  view.setAudiencePreview({},false);
  assert.equal(view.previewState.blocked,false);
  assert.match(view.renderReview(),/Current access includes Unverified visitor/);
  await access.revoke(guest.id,lens);
  assert.match(view.renderReview(),/Only you — this place is private/);

  await access.policy(placeId,'public',lens);
  assert.match(view.renderReview(),/Visitors who meet this Place’s door terms/);
  assert.doesNotMatch(view.renderReview(),/Save visibility/);
  view.setAudiencePreview({},false);
  assert.equal(view.previewState.blocked,false);
});

test('A grant outside the preview roster and a credential group prevent a claim of owner-only access',async t=>{
  const {view,access,lens,placeId}=await fixture(t);
  const outside=await access.grant(placeId,{person:'not-on-the-preview-roster'},'enter',null,lens);
  assert.match(view.renderReview(),/Other people may qualify/);
  assert.doesNotMatch(view.renderReview(),/Only you/);
  view.setAudiencePreview({},false);
  assert.equal(view.previewState.blocked,true);
  assert.doesNotMatch(view.renderAudience(),/Others see nothing/);
  await access.revoke(outside.id,lens);

  await access.grant(placeId,{group:'tallahassee-resident'},'enter',null,lens);
  assert.match(view.renderReview(),/Other people may qualify/);
  assert.doesNotMatch(view.renderReview(),/Only you/);
});
