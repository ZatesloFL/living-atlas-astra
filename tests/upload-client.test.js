import test from 'node:test';
import assert from 'node:assert/strict';
import {UploadClient, directUploadType} from '../src/upload-client.js';

const endpoint = 'https://example.test/functions/v1/atlas-sources';
const holder = 'a'.repeat(64);
const file = (text, name, type) => new File([text], name, {type});

test('the default transport keeps the browser receiver for hosted source requests', async t => {
  const actions = [];
  t.mock.method(globalThis, 'fetch', async function (url) {
    if (this !== globalThis) throw new TypeError('Illegal invocation');
    const action = url.slice(endpoint.length + 1);
    actions.push(action);
    return action === 'media'
      ? new Response('original', {headers:{'Content-Type':'image/jpeg'}})
      : Response.json({usage:{allotmentBytes:1e9,usedBytes:0,reservedBytes:0}});
  });
  const client = new UploadClient({
    endpoint,
    getHolder: () => holder,
    preview: async () => new Blob(['preview'], {type:'image/jpeg'}),
  });

  assert.equal((await client.list()).usage.allotmentBytes, 1e9);
  await client.upload({placeId:'home/dev/drive', file:file('original','north.jpg','image/jpeg')});
  assert.equal(await (await client.media('photo', 'original')).text(), 'original');
  assert.equal((await client.remove('photo')).usage.usedBytes, 0);
  assert.deepEqual(actions, ['list', 'upload', 'media', 'delete']);
});

test('upload client rejects video before getting a holder or making a request', async () => {
  const client = new UploadClient({
    endpoint,
    getHolder: () => assert.fail('Credential fetched for video'),
    fetch: () => assert.fail('Upload called for video'),
  });
  assert.equal(directUploadType(file('video', 'spoofed.txt', 'video/mp4')), null);
  await assert.rejects(client.upload({placeId:'my-place', file:file('video', 'test.mp4', '')}), /video by link/);
  assert.equal(directUploadType(file('audio', 'music.m4a', 'audio/x-m4a')), 'audio/mp4');
});

test('photo request carries byte-accurate metadata, original and sized preview under one retry ID', async () => {
  const calls = [];
  const client = new UploadClient({
    endpoint,
    getHolder: () => holder,
    preview: async () => new Blob(['preview'], {type:'image/jpeg'}),
    fetch: async (url, request) => {
      calls.push([url, request]);
      return Response.json({item:{id:'photo'},usage:{allotmentBytes:1e9,usedBytes:15,reservedBytes:0}});
    },
  });
  const input = {placeId:'home/dev/drive', id:'retry-id', file:file('original','north.jpg','image/jpeg')};
  await client.upload(input);
  await client.upload(input);
  for (const [url, request] of calls) {
    assert.equal(url, endpoint + '/upload');
    assert.equal(request.headers.Authorization, 'Bearer ' + holder);
    assert.equal(request.headers['Content-Type'], 'image/jpeg');
    assert.deepEqual(JSON.parse(decodeURIComponent(request.headers['X-Atlas-Upload'])), {
      id:'retry-id', placeId:'home/dev/drive', filename:'north.jpg', originalBytes:8, previewBytes:7,
    });
    assert.equal(await request.body.text(), 'originalpreview');
  }
});

test('unavailable storage skips the transport and an allotment rejection states the reason', async () => {
  const unavailable = new UploadClient({
    endpoint, getHolder:() => assert.fail('Holder requested off origin'),
    enabled:()=>false, fetch:()=>assert.fail('Transport called off origin'),
  });
  assert.equal(unavailable.available(),false);
  await assert.rejects(unavailable.list(),/unavailable in this session/);

  const client = new UploadClient({
    endpoint,
    getHolder:() => holder,
    fetch:async () => Response.json({code:'ALLOTMENT_EXCEEDED'},{status:409}),
  });
  await assert.rejects(client.upload({placeId:'my-place',file:file('note','note.txt','text/plain')}), {
    code:'ALLOTMENT_EXCEEDED', message:'This file and its preview would exceed your upload allotment.',
  });
});
