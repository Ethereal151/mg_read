import assert from 'node:assert/strict';
import test from 'node:test';
import * as plugin from '../dist/index.mjs';

test('Xiaowei native API flow keeps stable IDs and proxies the selected media', async () => {
  const calls = []; const resources = [];
  const episode = { episodeOneId: 'episode-a', playOrder: 1, title: '逆袭人生', vertPoster: 'https://img.example/portrait.jpg', playSetting: JSON.stringify({ normal: 'https://media.example/a.mp4', super: 'https://media.example/a.m3u8' }) };
  const episodeWithGap = { ...episode, episodeOneId: 'episode-b', playOrder: 3 };
  await plugin.activate({ log: { info() {}, warn() {} }, resource: { proxy(value) { resources.push(value); return 'http://127.0.0.1/resource/opaque'; } }, http: { async fetch(input, init = {}) {
    const url = String(input); calls.push({ url, init });
    if (url.includes('/shortVideoTags')) return Response.json({ data: { tags: ['逆袭', '甜宠'] } });
    if (url.includes('/shortVideoDetail')) return Response.json({ oneId: 'show-1', title: '逆袭人生', description: 'fixture', data: [episode, episodeWithGap] });
    const body = JSON.parse(String(init.body));
    assert.match(url, /version_code=1061&version_name=1\.0\.61/u);
    if (!body.subject) assert.equal(body.searchWord, '逆袭');
    return Response.json({ data: { list: [{ oneId: 'show-1', title: '逆袭人生', horzPoster: 'https://img.example/wide.jpg', episodeCount: 1 }] } });
  } } });
  const root = await plugin.discover({ target: null, cursor: null, collectionId: null, pageSize: 5 });
  assert.equal(root.document.components[0].children[0].categories.length, 2);
  const target = root.document.components[0].children[0].categories[0].target;
  const discovery = await plugin.discover({ target, cursor: null, collectionId: null, pageSize: 5 });
  const contentId = discovery.document.components[0].children[0].items[0].content.id; assert.equal(contentId, 'drama:c2hvdy0x');
  const search = await plugin.search({ query: '逆袭', cursor: null, pageSize: 5 }); assert.equal(search.items[0].title, '逆袭人生'); assert.equal(search.items[0].coverOrientation, 'landscape');
  const detail = await plugin.getDetail({ id: contentId }); assert.equal(detail.description, 'fixture');
  const chapters = await plugin.getChapters({ id: contentId }); assert.equal(chapters.items.length, 2); assert.deepEqual(chapters.items.map((item) => item.order), [0, 1]); assert.ok(!chapters.items[0].id.includes('http'));
  const content = await plugin.getContent({ id: contentId, chapterId: chapters.items[0].id });
  assert.equal(content.media.resourceType, 'hls'); assert.equal(resources.find((resource) => resource.kind === 'hls')?.url, 'https://media.example/a.m3u8');
  assert.equal(calls.find((call) => call.url.includes('/search')).init.method, 'POST');
});
