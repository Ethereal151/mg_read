import assert from 'node:assert/strict';
import { createCipheriv } from 'node:crypto';
import test from 'node:test';
import * as plugin from '../dist/index.mjs';

const listing = `<article><meta itemprop="url mainEntityOfPage" content="/archives/12/"><meta itemprop="name" content="作者"><meta itemprop="dateModified" content="2026-09-04"><div class="post-card-title">测试短剧</div><div class="post-card-info">AI剧场</div><script>loadBannerDirect('https://img.example/encrypted.jpeg')</script></article>`;
const detail = `<meta property="og:title" content="测试短剧"><meta itemprop="image" content="https://img.example/encrypted.jpeg"><div class="dplayer" data-video_title="第一集" data-config='{"video":{"url":"https://media.example/1.m3u8","type":"hls"}}'></div>`;
const key = Buffer.from('f5d965df75336270');
const iv = Buffer.from('97b60394abc2fbe1');

test('AI drama source serves bounded, decrypted covers through the resource handler', async () => {
  const coverBytes = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(12_000, 1)]);
  const cipher = createCipheriv('aes-128-cbc', key, iv);
  const encrypted = Buffer.concat([cipher.update(coverBytes), cipher.final()]);
  const proxied = [];
  await plugin.activate({
    log: { info() {} },
    resource: { proxy(request) { proxied.push(request); return `http://127.0.0.1/r/${proxied.length}`; } },
    http: { async fetch(input) {
      const url = String(input);
      if (url.includes('encrypted.jpeg')) return new Response(encrypted);
      return new Response(url.includes('/archives/12') ? detail : listing);
    } },
  });
  const result = await plugin.discover({ target: 'channel:theater', cursor: null, collectionId: null, pageSize: 3 });
  const item = result.document.components[0].children[0].items[0].content;
  const imageRequest = proxied.find((request) => request.kind === 'image');
  assert.ok(imageRequest);
  assert.equal(imageRequest.handler, 'ai-duanju-cover-v1');
  assert.ok(item.coverUrl.startsWith('http://127.0.0.1/r/'));
  const image = await plugin.getResource(imageRequest);
  assert.equal(image.mimeType, 'image/jpeg');
  assert.deepEqual(Buffer.from(image.bytes), coverBytes);
  await assert.rejects(plugin.getResource({ ...imageRequest, url: 'https://evil.example/encrypted.jpeg' }), /origin or path changed/u);
  const chapters = await plugin.getChapters({ id: item.id });
  const content = await plugin.getContent({ id: item.id, chapterId: chapters.items[0].id });
  assert.equal(content.media.resourceType, 'hls');
  assert.equal(proxied.find((request) => request.kind === 'hls')?.url, 'https://media.example/1.m3u8');
});
