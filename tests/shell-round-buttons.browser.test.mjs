import {previewOrigin, previewPath, readPreview} from './fixtures/preview-site.mjs';
// 實際活動頁／CSS；所有 HTTP 請求由本機檔案或合成替身回覆，不啟動伺服器、不連外。
import {test, before, after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, readdirSync, mkdirSync} from 'node:fs';
import {resolve, extname, sep} from 'node:path';
import {fileURLToPath} from 'node:url';

const {chromium} = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = fileURLToPath(new URL('../', import.meta.url));
const origin = previewOrigin;
const shots = process.env.ROUNDBTN_SHOTS_DIR || '/tmp/ybs-roundbtn-shots';
const activities = readdirSync(resolve(root, '115-g9')).filter(dir => /^u\d+-\d+$/.test(dir))
  .filter(dir => readFileSync(resolve(root, '115-g9', dir, 'index.html'), 'utf8').includes('assets/shell.js'));
const examples = new Set(['u2-04', 'u2-05', 'u2-06', 'u2-07']);
let browser;
before(async () => {
  mkdirSync(shots, {recursive:true});
  browser = await chromium.launch({headless:true});
});
after(async () => { await browser?.close(); });

async function openPage(width, touch = false) {
  const context = await browser.newContext({viewport:{width, height:1000}, hasTouch:touch,
    isMobile:touch, reducedMotion:'reduce', serviceWorkers:'block'});
  const outside = [], errors = [];
  await context.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin !== new URL(origin).origin) { outside.push(url.href); return route.abort(); }
    if (['/assets/login.js', '/assets/lock.js', '/assets/fullrev-config.js'].includes(previewPath(url.pathname)))
      return route.fulfill({contentType:'text/javascript', body:'// offline: no login, cloud, or release boundary'});
    if (previewPath(url.pathname) === '/assets/teacher.js')
      return route.fulfill({contentType:'text/javascript', body:'window.TEACHER={remembered:()=>false,remember(){}};'});
    try {
      const path = resolve(root, '.' + previewPath(url.pathname) + (previewPath(url.pathname).endsWith('/') ? 'index.html' : ''));
      assert.ok(path.startsWith(resolve(root) + sep));
      const ext = extname(path);
      let body = await readPreview(route,path);
      if (ext === '.html') body = Buffer.from(body.toString().replace(/<link[^>]+href=["']https?:\/\/[^>]+>/g, ''));
      if (ext === '.css') body = Buffer.from(body.toString().replace(/^@import.*$/gm, ''));
      return route.fulfill({contentType:({'.html':'text/html; charset=utf-8', '.js':'text/javascript',
        '.css':'text/css', '.svg':'image/svg+xml', '.png':'image/png'})[ext] || 'application/octet-stream', body});
    } catch { return route.fulfill({status:404, body:''}); }
  });
  await context.addInitScript(() => {
    // 只還原 999 班 1 號的合成第二關紀錄，使目前／已過關／一般同時出現。
    const progress = JSON.stringify({mask:2, tries:Array(6).fill(0), time:1});
    for (let week = 0; week <= 30; week++) for (const suffix of ['', ':sheet-v2'])
      localStorage.setItem(`it9:w${week}:999-1${suffix}`, progress);
  });
  const page = await context.newPage();
  page.setDefaultTimeout(7000);
  page.on('pageerror', error => errors.push(error.message));
  return {context, page, outside, errors};
}

async function visit(page, dir) {
  await page.goto(`${origin}/115-g9/${dir}/`);
  await page.locator('#in-cls').fill('999');
  await page.locator('#in-seat').fill('1');
  await page.locator('#g-next').click();
  await page.locator('#g-go').click();
  await page.evaluate(() => APP.load(0));
  await page.mouse.move(0, 0);
  assert.equal(await page.locator('#rounds .passed').count(), 1, dir + ' 合成紀錄還原');
}

async function screenshot(page, name) {
  const box = await page.locator('#rounds').boundingBox();
  const x = Math.max(0, box.x - 8), y = Math.max(0, box.y - 8);
  await page.screenshot({path:resolve(shots, name + '.png'), clip:{x, y,
    width:Math.min(page.viewportSize().width - x, box.width + 16), height:box.height + 16}});
}

async function geometry(button) {
  return button.evaluate(el => {
    const style = getComputedStyle(el), side = getComputedStyle(el.querySelector('.round-depth'));
    const box = el.getBoundingClientRect(), matrix = new DOMMatrixReadOnly(style.transform);
    return {y:box.y, height:box.height, travel:matrix.m42,
      baseY:box.y + new DOMMatrixReadOnly(side.transform).m42};
  });
}

async function waitForTravel(page, fraction) {
  // 驗證實際繪製位移，不把 UA 的 :active 判定當成觸控回饋。
  await page.waitForFunction(fraction => {
    const el = document.querySelector('#rounds button[data-i="2"]');
    const travel = new DOMMatrixReadOnly(getComputedStyle(el).transform).m42;
    return Math.abs(travel - el.getBoundingClientRect().height * fraction) < .1;
  }, fraction);
}

async function checkFocus(button) {
  const focus = await button.evaluate(el => {
    const s = getComputedStyle(el);
    return {focused:el === document.activeElement && el.matches(':focus-visible'),
      width:s.outlineWidth, color:s.outlineColor, style:s.outlineStyle, offset:s.outlineOffset};
  });
  assert.deepEqual(focus, {focused:true, width:'3px', color:'rgb(111, 214, 232)', style:'solid', offset:'-5px'});
}

for (const width of [360, 560, 1280]) test(`全站關卡 B 版 ${width}px：狀態、換行、鍵盤、滑過及按下`, {timeout:120000}, async () => {
  const {context, page, outside, errors} = await openPage(width);
  try {
    assert.equal(activities.length, 30);
    for (const dir of activities) {
      await visit(page, dir);
      const buttons = page.locator('#rounds button');
      const labels = await buttons.allTextContents();
      const layout = await buttons.evaluateAll(elements => elements.map(el => {
        const s = getComputedStyle(el), face = getComputedStyle(el, '::before'),
          side = getComputedStyle(el.querySelector('.round-depth')), box = el.getBoundingClientRect(), m = new DOMMatrixReadOnly(s.transform);
        return {font:s.fontStyle, family:s.fontFamily, skew:[m.m12, m.m21], clip:s.clipPath,
          color:s.color, border:face.borderTopWidth, face:face.backgroundImage,
          side:side.backgroundImage, shadow:side.filter, depth:parseFloat(s.getPropertyValue('--key-depth')),
          left:box.left, right:box.right, height:box.height, fits:[...el.childNodes].filter(n=>n.nodeType===3).every(node=>{
            const range=document.createRange();range.selectNodeContents(node);
            return [...range.getClientRects()].every(r=>r.left>=box.left-1&&r.right<=box.right+1&&r.top>=box.top-1&&r.bottom<=box.bottom+1);
          })};
      }));
      for (const item of layout) {
        assert.equal(item.font, 'normal', dir + ' 非斜體');
        assert.ok(item.family.includes('Noto Sans TC'), dir + ' 使用正文字體');
        assert.deepEqual(item.skew, [0, 0]);
        assert.equal(item.clip, 'none', dir + ' 按鈕焦點框不受切角裁切');
        assert.equal(item.border, '2px');
        assert.ok(item.face.includes('rgb(37, 44, 58)') && item.face.includes('linear-gradient'));
        assert.ok(item.side.includes('linear-gradient') && item.shadow.includes('drop-shadow'));
        assert.equal(item.depth, width <= 560 ? 3 : 6);
        assert.ok(item.left >= 0 && item.right <= width && item.fits, dir + ' 文字與按鈕不溢出');
        // 17px × 1.4 × 兩行 + 12px 內距 + 4px 邊框 = 63.6px。
        if (width === 360) assert.ok(item.height <= 64, dir + ' 手機單鍵至多兩行');
      }
      assert.equal(layout[0].color, 'rgb(255, 107, 61)');
      assert.ok(layout[0].face.includes('rgb(255, 107, 61)'));
      assert.equal(layout[1].color, 'rgb(111, 214, 232)');
      assert.ok(layout[1].face.includes('rgb(111, 214, 232)'));
      assert.equal(layout[2].color, 'rgb(230, 233, 239)');
      assert.ok(layout[2].face.includes('rgb(59, 69, 92)'));
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      if (width === 360) {
        const nav = await page.locator('#rounds').boundingBox();
        assert.ok(nav.height <= 130, dir + ' 手機關卡列含厚度不超過 130px');
      }
      if (examples.has(dir)) await screenshot(page, `${dir}-${width}-states`);

      // Tab 實際移動焦點，Space／Enter 沿用原生按鈕切關。
      await buttons.nth(0).focus();
      await page.keyboard.press('Tab');
      await page.keyboard.press('Shift+Tab');
      await checkFocus(buttons.nth(0));
      await page.keyboard.press('Tab');
      await checkFocus(buttons.nth(1));
      if (examples.has(dir)) await screenshot(page, `${dir}-${width}-focus`);
      await page.keyboard.press('Space');
      assert.equal(await page.evaluate(() => APP.ri), 1);
      assert.equal(await buttons.nth(1).getAttribute('aria-pressed'), 'true');
      const passedCurrent = await buttons.nth(1).evaluate(el => ({color:getComputedStyle(el).color,
        face:getComputedStyle(el, '::before').backgroundImage}));
      assert.equal(passedCurrent.color, 'rgb(111, 214, 232)');
      assert.ok(passedCurrent.face.includes('rgb(255, 107, 61)'), dir + ' 已過且目前為 ember 框');
      await buttons.nth(2).focus();
      await checkFocus(buttons.nth(2));
      await page.keyboard.press('Enter');
      assert.equal(await page.evaluate(() => APP.ri), 2);
      assert.deepEqual(await buttons.allTextContents(), labels, dir + ' 文字及已過關標記不變');
      assert.equal(await page.locator('#rounds [aria-pressed="true"]').count(), 1);

      if (examples.has(dir)) {
        await page.mouse.move(0, 0);
        const rest = await geometry(buttons.nth(2));
        await buttons.nth(2).hover();
        const hover = await geometry(buttons.nth(2));
        assert.ok(Math.abs(hover.travel - rest.height * .04) < .1, '滑過下沉 4%');
        assert.ok(Math.abs(hover.baseY - rest.baseY) < .1, '底座保持原位');
        await page.mouse.down();
        const active = await geometry(buttons.nth(2));
        assert.ok(Math.abs(active.travel - rest.height * .08) < .1, '按下下沉 8%');
        assert.ok(Math.abs(active.baseY - rest.baseY) < .1);
        await screenshot(page, `${dir}-${width}-pressed`);
        await page.mouse.up();
        await page.mouse.move(0, 0);
        assert.equal((await geometry(buttons.nth(2))).travel, 0);
      }
    }
    assert.deepEqual(outside, [], '不得送出外網請求');
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

for (const dir of examples) test(`${dir} 360px 觸控：按下有效、放開不殘留滑過下沉`, async () => {
  const {context, page, outside, errors} = await openPage(360, true);
  try {
    await visit(page, dir);
    assert.equal(await page.evaluate(() => matchMedia('(hover:hover)').matches), false);
    const target = page.locator('#rounds button').nth(2);
    // CDP 觸控不會像 locator.tap() 自動捲動；新頁首與登入焦點會改變捲動位置。
    await target.scrollIntoViewIfNeeded();
    const box = await target.boundingBox();
    const point = {x:box.x + box.width / 2, y:box.y + box.height / 2};
    assert.equal(await target.evaluate((el, p) => el.contains(document.elementFromPoint(p.x, p.y)), point), true,
      dir + ' 觸控座標必須命中目標按鈕');
    const cdp = await context.newCDPSession(page);
    const rest = await geometry(target);
    await cdp.send('Input.dispatchTouchEvent', {type:'touchStart', touchPoints:[point]});
    await waitForTravel(page, .08);
    console.log(`${dir} CDP touchStart：:active=${await target.evaluate(el => el.matches(':active'))}，實際下沉 8%`);
    const pressed = await geometry(target);
    assert.ok(Math.abs(pressed.travel - box.height * .08) < .1,
      `${dir} 按下 8%：${JSON.stringify({height:box.height,expected:box.height * .08,...pressed})}`);
    assert.ok(Math.abs(pressed.baseY - rest.baseY) < .1, dir + ' 觸控時底座保持原位');
    await screenshot(page, `${dir}-360-touch-pressed`);
    await cdp.send('Input.dispatchTouchEvent', {type:'touchCancel', touchPoints:[]});
    await waitForTravel(page, 0);
    assert.equal(await target.evaluate(el => el.classList.contains('is-pressing')), false);
    assert.equal(await page.evaluate(() => APP.ri), 0, '取消觸控不切換關卡');
    await cdp.send('Input.dispatchTouchEvent', {type:'touchStart', touchPoints:[point]});
    await waitForTravel(page, .08);
    await cdp.send('Input.dispatchTouchEvent', {type:'touchEnd', touchPoints:[]});
    await page.waitForFunction(() => APP.ri === 2);
    await waitForTravel(page, 0);
    assert.equal(await page.evaluate(() => APP.ri), 2);
    assert.equal((await geometry(target)).travel, 0);
    await target.tap();
    assert.equal((await geometry(target)).travel, 0);
    await screenshot(page, `${dir}-360-touch-released`);
    assert.deepEqual(outside, []);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});
