import assert from 'node:assert/strict';
import test from 'node:test';
import * as plugin from '../dist/index.mjs';

const detailUrl = 'https://www.wogg.net/voddetail/fixture.html';
const html = `
<div class="module-search-item"><div class="video-cover"><div class="module-item-cover"><div class="module-item-pic"><img data-src="/cover.jpg" alt="玩偶测试片"><div class="loading"></div></div></div></div><div class="video-info"><div class="video-info-header"><a class="video-serial" href="/voddetail/fixture.html" title="玩偶测试片">更新至 2 集</a><h3><a href="/voddetail/fixture.html" title="玩偶测试片">玩偶测试片</a></h3></div></div></div>
<h1 class="page-title">玩偶测试片</h1><div id="download-list"><a class="fzlj" href="https://pan.quark.cn/s/fixture01">夸克</a><a class="fzlj" href="https://pan.baidu.com/s/fixture02">百度</a></div>`;

test('projects Wogg listing, share files and a user-login action through public APIs', async () => {
  const requests = []; let current = '';
  const page = {
    async navigate(url) { current = url; }, async show() { requests.push(`show:${current}`); },
    async getHtml() { return html; },
    async fetch(request) {
      requests.push(request.url);
      if (request.url.includes('/token?')) return { body: { data: { stoken: 'fixture-token' } }, headers: {}, status: 200, url: request.url };
      if (request.url.includes('pan.baidu.com/share/list')) return { body: { list: [{ fs_id: 'file-2', server_filename: '第二集.mp4', size: 2048, isdir: 0, path: '/第二集.mp4' }] }, headers: {}, status: 200, url: request.url };
      return { body: { data: { list: [{ fid: 'file-1', file_name: '第一集.mp4', size: 1024, file: true, share_fid_token: 'share-token' }] } }, headers: {}, status: 200, url: request.url };
    },
    async executeJavaScript() { return 'https://media.example/fixture.mp4'; },
  };
  const resources = [];
  await plugin.activate({ dataDir: 'fixture-data', cacheDir: 'fixture-cache', app: { runtimeVersion: 'test', nodeVersion: process.versions.node, pluginApi: 1 }, plugin: { id: 'org.mgread.wanou-wangpan', version: '1.0.0' }, log: { debug() {}, info() {}, warn() {}, error() {} }, webview: { async open() { return page; } }, resource: { proxy(request) { resources.push(request); return `http://127.0.0.1/resource/${resources.length}`; } }, http: { async fetch(url) { assert.ok(String(url).includes('wogg.net')); return new Response(html); } } });
  const search = await plugin.search({ query: '测试', cursor: null, pageSize: 10 });
  assert.equal(search.items.length, 1);
  const detail = await plugin.getDetail({ id: search.items[0].id });
  const chapters = await plugin.getChapters({ id: detail.id });
  assert.deepEqual(chapters.groups.map((group) => group.title), ['夸克网盘 1', '百度网盘 2']);
  assert.equal(chapters.items[0].title, '第一集.mp4');
  assert.deepEqual(chapters.items.map((chapter) => chapter.order), [0, 1]);
  assert.deepEqual(chapters.groups.map((group) => group.episodes.map((chapter) => chapter.order)), [[0], [1]]);
  const content = await plugin.getContent({ id: detail.id, chapterId: chapters.items[0].id });
  assert.equal(content.media.resourceType, 'video');
  assert.equal(resources.at(-1).url, 'https://media.example/fixture.mp4');
  await plugin.discover({ target: 'login:quark', cursor: null, collectionId: null, pageSize: 10 });
  assert.ok(requests.includes('show:https://pan.quark.cn/'));
});

test('login discovery uses icons from the public vocabulary', async () => {
  await plugin.activate({ log: { info() {} } });
  const result = await plugin.discover({ target: null, cursor: null, collectionId: null, pageSize: 10 });
  const icons = [];
  const visit = (component) => {
    if (component.icon !== undefined) icons.push(component.icon);
    for (const child of component.children ?? []) visit(child);
    for (const category of component.categories ?? []) if (category.icon !== undefined) icons.push(category.icon);
  };
  for (const component of result.document.components) visit(component);
  assert.ok(icons.length > 0);
  assert.equal(icons.includes('account'), false);
});
