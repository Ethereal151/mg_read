import assert from 'node:assert/strict';
import test from 'node:test';
import * as plugin from '../dist/index.mjs';

test('Fanqie source keeps book/item IDs and formats paragraphs', async () => {
  const proxied = [];
  await plugin.activate({
    log: { info() {}, warn() {} },
    resource: { proxy(value) { proxied.push(value); return 'http://127.0.0.1/r'; } },
    http: { async fetch(input) {
      const url = String(input);
      if (url.includes('book_list')) return Response.json({ code: 0, data: { data: [{ book_id: '12', book_name: '测试书', author: '作者', thumb_url: 'https://img.example/a~tplv.heic' }] } });
      if (url.includes('/info?')) return Response.json({ data: { data: { book_name: '测试书', author: '作者', thumb_url: 'https://img.example/a.jpg' } } });
      if (url.includes('/directory/')) return Response.json({ data: { chapterListWithVolume: [[{ itemId: '34', title: '第一章' }]] } });
      if (url.includes('/content?')) return Response.json({ code: 0, data: { content: '<article><p>第一段</p><p>第二段</p></article>' } });
      throw new Error(url);
    } },
  });
  const home = await plugin.discover({ target: null, cursor: null, collectionId: null, pageSize: 3 });
  const result = await plugin.discover({ target: 'channel:1', cursor: null, collectionId: null, pageSize: 3 });
  const item = result.document.components[0].children[0].items[0].content;
  const chapters = await plugin.getChapters({ id: item.id });
  const content = await plugin.getContent({ id: item.id, chapterId: chapters.items[0].id });
  assert.equal(item.id, 'novel:12');
  assert.equal(home.document.components[0].icon, 'book');
  assert.equal(home.document.components[0].children[0].categories[0].icon, 'book');
  assert.equal(chapters.items[0].id, 'novel:12:34');
  assert.equal(content.text, '第一段\n\n第二段');
  assert.match(proxied[0].url, /p6-novel\.byteimg\.com/u);
});

test('Fanqie chapter order is local and contiguous inside each volume', async () => {
  await plugin.activate({
    log: { info() {}, warn() {} },
    resource: { proxy(value) { return value.url; } },
    http: { async fetch(input) {
      assert.ok(String(input).includes('/directory/'));
      return Response.json({ data: { chapterListWithVolume: [
        [{ itemId: '1', title: '第1章' }, { itemId: '2', title: '第2章' }],
        [{ itemId: '3', title: '第3章' }],
      ] } });
    } },
  });
  const result = await plugin.getChapters({ id: 'novel:12' });
  assert.deepEqual(result.items.map((item) => item.order), [0, 1, 2]);
  assert.deepEqual(result.groups.map((group) => group.episodes.map((item) => item.order)), [[0, 1], [0]]);
});

test('Fanqie login opens WebView, checks status, and imports bookshelf IDs through source details', async () => {
  const calls = [];
  const page = {
    async navigate(url, options) { calls.push(['navigate', url, options]); },
    async show(options) { calls.push(['show', options]); },
  };
  await plugin.activate({
    log: { info() {}, warn() {} },
    resource: { proxy(value) { return value.url; } },
    http: { async fetch(input) {
      const url = String(input);
      const bookId = /book_id=(\d+)/u.exec(url)?.[1];
      if (bookId) return Response.json({ data: { data: { book_id: bookId, book_name: `书${bookId}`, author: '作者' } } });
      throw new Error(`unexpected HTTP request: ${url}`);
    } },
    webview: { async open(options) { calls.push(['open', options]); return page; } },
    browser: { sessionV1: { async request(request) {
      calls.push(['session', request]);
      if (request.url.includes('/api/user/info/v2')) return { version: 1, status: 200, body: JSON.stringify({ code: -1, data: {} }), headers: {}, finalUrl: request.url };
      return { version: 1, status: 200, body: JSON.stringify({ code: 0, data: { book_shelf_info: [{ book_id: '12' }, { book_id: '55' }, { book_id: '12' }] } }), headers: {}, finalUrl: request.url };
    } } },
  });
  const home = await plugin.discover({ target: null, cursor: null, collectionId: null, pageSize: 10 });
  const actions = home.document.components[1].children[0].categories;
  assert.deepEqual(actions.map((action) => action.target), ['login', 'login-status', 'bookshelf']);

  const login = await plugin.discover({ target: 'login', cursor: null, collectionId: null, pageSize: 10 });
  assert.equal(login.document.components[0].title, '番茄网页登录已打开');
  assert.equal(calls[0][0], 'open');
  assert.deepEqual(calls[0][1], { visible: true, timeoutMs: 30_000 });
  assert.deepEqual(calls[1], ['navigate', 'https://fanqienovel.com/', { timeoutMs: 45_000 }]);
  assert.deepEqual(calls[2], ['show', { timeoutMs: 15_000 }]);

  const loggedOut = await plugin.discover({ target: 'login-status', cursor: null, collectionId: null, pageSize: 10 });
  assert.equal(loggedOut.document.components[0].title, '番茄未登录');

  const shelf = await plugin.discover({ target: 'bookshelf', cursor: null, collectionId: null, pageSize: 10 });
  const items = shelf.document.components[0].children[0].items;
  assert.deepEqual(items.map((item) => item.content.id), ['novel:12', 'novel:55']);
  assert.match(shelf.document.components[0].subtitle, /读取 2 本书的 ID/u);
  const sessionCalls = calls.filter(([kind]) => kind === 'session').map(([, request]) => request);
  assert.equal(sessionCalls.length, 2);
  assert.equal(sessionCalls[0].url, 'https://fanqienovel.com/api/user/info/v2');
  assert.equal(sessionCalls[0].transport, 'http');
  assert.equal(sessionCalls[0].presentation, 'hidden');
  assert.equal('cookie' in sessionCalls[0].headers, false);
  assert.equal(sessionCalls[1].url, 'https://fanqienovel.com/reading/bookapi/bookshelf/info/v:version/?aid=1967&iid=0&version_code=57700&update_version_code=57700');
  assert.equal(calls.filter(([kind]) => kind === 'navigate').length, 1);
});

test('Fanqie source migrates legacy search payloads and web detail fallback', async () => {
  const resources = [];
  await plugin.activate({
    log: { info() {}, warn() {} },
    resource: { proxy(value) { resources.push(value); return 'http://127.0.0.1/resource'; } },
    http: { async fetch(input) {
      const url = String(input);
      if (url.includes('fq-book.netsite.cc/search?')) return Response.json({ data: { has_more: false, search_tabs: [{ data: [{ book_data: { 0: { book_id: '55', book_name: '<em>旧版书</em>', author: '<em>旧作者</em>', thumb_url: 'https://img.example/cover~tplv.jpg' } } }] }] } });
      if (url.includes('fq-book.netsite.cc/info?')) return Response.json({ data: { data: {} } });
      if (url.includes('fanqienovel.com/page/66')) return new Response('<html><head><title>网页书_番茄小说</title><meta name="description" content="网页简介"></head><body><script type="application/ld+json">{"headline":"网页书","author":{"name":"网页作者"},"image":"https://img.example/web.jpg"}</script></body></html>');
      throw new Error(url);
    } },
  });
  const result = await plugin.search({ query: '旧版书', cursor: null, pageSize: 5 });
  const detail = await plugin.getDetail({ id: 'novel:66' });
  assert.equal(result.items[0].id, 'novel:55');
  assert.equal(result.items[0].title, '旧版书');
  assert.equal(detail.title, '网页书');
  assert.equal(detail.author, '网页作者');
  assert.equal(detail.description, '网页简介');
  assert.equal(resources.length, 2);
});

test('Fanqie detail reuses a cover field from the same API response', async () => {
  const resources = [];
  let infoCalls = 0;
  await plugin.activate({
    log: { info() {}, warn() {} },
    resource: { proxy(value) { resources.push(value); return 'http://127.0.0.1/resource'; } },
    http: { async fetch(input) {
      const url = String(input);
      if (url.includes('/info?')) {
        infoCalls += 1;
        return Response.json({ data: { data: { book_name: '同响应封面', author: '作者' }, cover: 'https://img.example/reused.jpg' } });
      }
      throw new Error(url);
    } },
  });
  const detail = await plugin.getDetail({ id: 'novel:77' });
  assert.equal(infoCalls, 1);
  assert.equal(detail.title, '同响应封面');
  assert.equal(resources.length, 1);
  assert.equal(resources[0].url, 'https://p6-novel.byteimg.com/origin/reused.jpg');
  assert.equal(resources[0].headers.Referer, 'https://fanqienovel.com/');
});

test('Fanqie source strips legacy inline image blocks from novel text', async () => {
  await plugin.activate({
    log: { info() {} },
    resource: { proxy() { return 'http://127.0.0.1/resource'; } },
    http: { async fetch(input) {
      if (String(input).includes('/content?')) return Response.json({ data: { content: '<article><p idx="0">第一段<img src="https://img.example/in-body.jpg"></p><div data-fanqie-type="image"><img src="https://img.example/only-image.jpg"></div><p idx="1">第二段</p></article>' } });
      throw new Error(String(input));
    } },
  });
  const content = await plugin.getContent({ id: 'novel:12', chapterId: 'novel:12:34' });
  assert.equal(content.text, '第一段\n\n第二段');
  assert.doesNotMatch(content.text, /img\.example/u);
});
