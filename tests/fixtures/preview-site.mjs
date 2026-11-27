// ybs-old 的本機預覽；可共用 Console 的 Python 靜態站，所有請求仍由各測試攔截。
import {readFileSync} from 'node:fs';
export const previewOrigin = process.env.YBS_TEST_BASE_URL || 'http://127.0.0.1/ybs-old';
export const previewPath = path => path.replace(/^\/ybs-old(?=\/)/, '');
export async function previewBase(server, {external = true} = {}) {
  if (external && process.env.YBS_TEST_BASE_URL) return process.env.YBS_TEST_BASE_URL;
  const handlers = server.listeners('request');
  server.removeAllListeners('request');
  server.on('request', (req, res) => {
    req.url = previewPath(req.url);
    for (const handler of handlers) handler(req, res);
  });
  await new Promise((ok, no) => {server.once('error', no); server.listen(0, '127.0.0.1', ok);});
  return 'http://127.0.0.1:' + server.address().port + '/ybs-old';
}
export async function readPreview(route, file) {
  if (!process.env.YBS_TEST_BASE_URL) return readFileSync(file);
  const response = await route.fetch({maxRedirects: 0});
  if (response.status() !== 200) throw Error('本機資源 ' + response.status() + ': ' + route.request().url());
  return response.body();
}
export async function cleanPreview(route) {
  if (!process.env.YBS_TEST_BASE_URL) return route.continue();
  const response = await route.fetch({maxRedirects: 0});
  const type = response.headers()['content-type'] || '';
  let body = await response.body();
  if (type.includes('text/html')) body = Buffer.from(body.toString().replace(/<link[^>]+https:\/\/fonts\.googleapis\.com[^>]*>/g, ''));
  if (type.includes('text/css')) body = Buffer.from(body.toString().replace(/^@import.*$/gm, ''));
  return route.fulfill({response, body});
}
