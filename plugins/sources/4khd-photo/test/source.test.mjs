import assert from 'node:assert/strict';
import test from 'node:test';
import * as plugin from '../dist/index.mjs';

test('4KHD resolves the current origin and proxies paginated originals', async () => {
  const resources = [];
  const requests = [];
  const launcher = `<script>const sites = ['https://current.4khd.example'];</script>`;
  const first = '<a href="/content/15/test.html" title="测试图集"><img src="https://i1.wp.com/pic.4khd.com/cover.jpg"></a><p><a href="https://i1.wp.com/pic.4khd.com/1.jpg"><img src="x"></a></p><link rel="next" href="/content/15/test-2.html">';
  const second = '<p><a href="https://i2.wp.com/pic.4khd.com/2.jpg"><img src="x"></a></p>';
  const post = { id: 15, link: 'https://www.4khd.com/content/15/test.html', title: { rendered: '测试图集' }, jetpack_featured_media_url: 'https://i1.wp.com/pic.4khd.com/cover.jpg' };
  await plugin.activate({
    log: { info() {}, warn() {} },
    resource: { proxy(value) { resources.push(value); return `http://127.0.0.1/resource/${resources.length}`; } },
    http: { async fetch(input) {
      const url = new URL(String(input));
      requests.push(url.toString());
      if (url.host === 'feza.uuss.uk') return new Response(launcher);
      if (url.pathname === '/wp-json/wp/v2/posts') return Response.json([post]);
      if (url.pathname.endsWith('test-2.html')) return new Response(second);
      if (url.pathname === '/content/15/test.html') return new Response(first);
      if (url.pathname.startsWith('/search/')) return new Response('not found', { status: 404 });
      return new Response('not found', { status: 404 });
    } },
  });

  const result = await plugin.search({ query: 'test', cursor: null, pageSize: 5 });
  const item = result.items[0];
  assert.ok(item.id.startsWith('manga:'));
  assert.equal(requests.some((url) => url.startsWith('https://current.4khd.example/search/')), true);
  const chapters = await plugin.getChapters({ id: item.id });
  const content = await plugin.getContent({ id: item.id, chapterId: chapters.items[0].id });
  assert.equal(content.pages.length, 2);
  assert.equal(resources.some((value) => value.url.endsWith('/2.jpg')), true);
});

test('4KHD falls back to the WordPress API when a listing has no parseable cards', async () => {
  const post = { id: 15, link: 'https://www.4khd.com/content/15/test.html', title: { rendered: '测试图集' }, jetpack_featured_media_url: 'https://i1.wp.com/pic.4khd.com/cover.jpg' };
  await plugin.activate({
    log: { info() {}, warn() {} },
    resource: { proxy(value) { return value.url; } },
    http: { async fetch(input) {
      const url = new URL(String(input));
      if (url.host === 'feza.uuss.uk') return new Response(`<script>const sites = ['https://current.4khd.example'];</script>`);
      if (url.pathname === '/wp-json/wp/v2/posts') return Response.json([post]);
      return new Response('<main>No matching cards</main>');
    } },
  });

  const result = await plugin.discover({ target: 'category:recent', cursor: null, collectionId: null, pageSize: 5 });
  assert.equal(result.document.components[0].children[0].items[0].content.id.startsWith('manga:'), true);
});

test('4KHD search finds the stable album when a decorated full title is not indexed', async () => {
  const title = 'Yeha (예하) Pure[269MB-84photos]';
  const post = { id: 15, link: 'https://feza.uuss.uk/content/03/yeha-pure.html', title: { rendered: title }, jetpack_featured_media_url: 'https://i1.wp.com/pic.4khd.com/cover.jpg' };
  const queries = [];
  await plugin.activate({
    log: { info() {} },
    resource: { proxy(value) { return value.url; } },
    http: { async fetch(input) {
      const url = new URL(String(input));
      if (url.pathname === '/wp-json/wp/v2/posts' && !url.searchParams.has('search')) return Response.json([{ id: 1 }]);
      if (url.pathname === '/wp-json/wp/v2/posts') {
        const query = url.searchParams.get('search');
        queries.push(query);
        return Response.json(query === 'Yeha' ? [post] : []);
      }
      return new Response('<html></html>');
    } },
  });
  const result = await plugin.search({ query: title, cursor: null, pageSize: 5 });
  assert.equal(result.items[0].id, 'manga:L2NvbnRlbnQvMDMveWVoYS1wdXJlLmh0bWw');
  assert.deepEqual(queries, [title, 'Yeha']);
});

test('4KHD parses split WordPress cards and the detail twitter cover', async () => {
  const cover = 'https://i1.wp.com/pic.4khd.com/cover.jpg';
  const card = `<li class="wp-block-post post-15 post type-post"><figure><a href="https://www.4khd.com/content/15/test.html"><img src="${cover}"></a></figure><h2><a href="https://www.4khd.com/content/15/test.html">测试图集</a></h2></li>`;
  await plugin.activate({
    log: { info() {}, warn() {} },
    resource: { proxy(value) { return value.url; } },
    http: { async fetch(input) {
      const url = new URL(String(input));
      if (url.host === 'feza.uuss.uk') return new Response(`<script>const sites = ['https://current.4khd.example'];</script>`);
      if (url.pathname === '/wp-json/wp/v2/posts') return Response.json([]);
      if (url.pathname === '/') return new Response(card);
      if (url.pathname === '/content/15/test.html') return new Response(`<title>测试图集 - 4KHD</title><meta name="twitter:image" content="${cover}">`);
      return new Response('not found', { status: 404 });
    } },
  });

  const discovery = await plugin.discover({ target: 'category:recent', cursor: null, collectionId: null, pageSize: 5 });
  const item = discovery.document.components[0].children[0].items[0].content;
  assert.equal(item.coverUrl, cover);
  const detail = await plugin.getDetail({ id: item.id });
  assert.equal(detail.coverUrl, cover);
});
