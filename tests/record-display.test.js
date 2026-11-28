import assert from 'node:assert/strict';
import test from 'node:test';
import {formatRecordDate,formatRecordDateTime,placeAddressLabel,shortReceipt} from '../src/record-display.js';
import {ROOMS} from '../src/data.js';
import {SourcesUI} from '../src/sources-ui.js';

const stamp='2026-11-28T05:52:22.990Z';

test('Record dates show a readable day or minute without exposing the stored timestamp',()=>{
  assert.equal(formatRecordDate(stamp,{locale:'en-US'}),'Nov 28, 2026');
  assert.equal(formatRecordDateTime(stamp,{locale:'en-US',timeZone:'UTC'}),'Nov 28, 2026, 5:52 AM');
  for (const invalid of [null,undefined,'0','pending','2026-99-99','2026-02-30']) {
    assert.equal(formatRecordDate(invalid),null);
    assert.equal(formatRecordDateTime(invalid),null);
  }
});

test('Short receipts and place labels use a readable reference without changing the stored identity',()=>{
  assert.equal(shortReceipt('builder:abcdef1234567890'),'abcdef12');
  assert.equal(shortReceipt('01234567-0f18-47fc-809b-aaddc3d0024b'),'01234567');
  assert.equal(shortReceipt(null),null);
  const place={title:'Bird and Bread Hall',address:'local/home/01234567-0f18-47fc-809b-aaddc3d0024b/hall-kit-abcdef'};
  assert.equal(placeAddressLabel(place,['Home']),'Home › Bird and Bread Hall');
  assert.equal(placeAddressLabel({address:place.address}),'Place');
});

test('The snapshot inspector puts exact time and content hash behind the record disclosure',()=>{
  const ui=new SourcesUI({storage:{getItem:()=>null}});
  ui.context={actorId:'owner'};
  const hash='d'.repeat(64);
  const html=ui.renderSource({source:{id:'record-a',owner:'owner',label:'Local archive',kind:'drive',syncMode:'snapshot',lastSync:stamp},
    snapshot:{capturedAt:stamp,hash}});
  const recordStart=html.indexOf('<summary>Snapshot record</summary>');
  assert.ok(recordStart>0);
  const summary=html.slice(0,recordStart);
  assert.ok(summary.includes('Simulated snapshot, as of '+formatRecordDate(stamp)));
  assert.ok(!summary.includes(stamp));
  assert.ok(!summary.includes(hash));
  assert.ok(html.slice(recordStart).includes(stamp));
  assert.ok(html.slice(recordStart).includes(hash));
});

test('Source usage lists readable owned Place and source names with exact lookup keys in the record',t=>{
  const placeId=`home/${crypto.randomUUID()}`,sourceId=`${placeId}/source-drive`;
  ROOMS[placeId]={id:placeId,title:'Study room',ownerId:'owner'};
  t.after(()=>{delete ROOMS[placeId];});
  const ui=new SourcesUI({storage:{getItem:()=>null},sources:{
    meters:()=>[{placeId,sourceId,servedBytes:2000,simulated:true}],
    list:()=>[{id:sourceId,label:'Mock Drive'}]
  }});
  ui.context={actorId:'owner',placeId};
  const html=ui.renderOperator();
  const recordStart=html.indexOf('<summary>Record identifiers</summary>');
  assert.match(html.slice(0,recordStart),/Study room · Mock Drive/);
  assert.ok(!html.slice(0,recordStart).includes(placeId));
  assert.ok(html.slice(recordStart).includes(sourceId));
});
