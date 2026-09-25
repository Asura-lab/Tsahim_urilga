const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/Acer/.npm-global/node_modules/playwright');
(async () => {
  const server = http.createServer((req, res) => {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end(fs.readFileSync('index.html'));
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  let browser;
  try {
    browser = await chromium.launch();
    const url = `http://127.0.0.1:${server.address().port}`;
    const errors = [];
    fs.mkdirSync('.preview', { recursive: true });
    for (const [name, width, height] of [['desktop',1366,768],['mobile',390,844],['small',320,568],['landscape',844,390]]) {
      const page = await browser.newPage({ viewport: {width,height} });
      page.on('pageerror', e => errors.push(e.message));
      await page.goto(url, {waitUntil:'domcontentloaded'});
      assert.equal(await page.locator('.delivery .envelope').count(), 1, 'The real envelope must share the flight wrapper');
      assert.equal(await page.locator('.owl-letter').count(), 0, 'No separate miniature envelope');
      assert.equal(await page.locator('#seal').isEnabled(), false, 'Opening waits for delivery');
      // Freeze the coordinated CSS timeline for a deterministic in-flight frame.
      await page.evaluate(() => document.getAnimations().forEach(a => {
        a.pause(); a.currentTime=3350;
        if (a.animationName === 'flap-l' || a.animationName === 'flap-r') a.currentTime=720;
      }));
      const framing = await page.evaluate(() => {
        const caption = document.querySelector('.intro-caption').getBoundingClientRect();
        return [...document.querySelectorAll('.owl,.wing-l,.wing-r')].every(e => {
          const b=e.getBoundingClientRect();
          return b.left>=0 && b.right<=innerWidth && b.top>=caption.bottom+4;
        });
      });
      assert(framing, `${name}: enlarged owl must fit below caption, including raised wings`);
      await page.screenshot({path:`.preview/delivery-${name}.png`});
      const contact = await page.evaluate(() => {
        const svg = document.querySelector('.owl');
        const point = new DOMPoint(220, 213).matrixTransform(svg.getScreenCTM());
        const envelope = document.querySelector('.envelope').getBoundingClientRect();
        return {gap:Math.abs(point.y-envelope.top), centerGap:Math.abs(point.x-(envelope.left+envelope.width/2))};
      });
      assert(contact.gap<14 && contact.centerGap<14, `Owl must hold real envelope: ${JSON.stringify(contact)}`);
      await page.evaluate(() => document.getAnimations().forEach(a => a.play()));
      await page.waitForFunction(() => document.body.classList.contains('delivery-done'));
      assert.equal(await page.locator('.owl-fly').isVisible(), false, 'Owl leaves automatically');
      assert.equal(await page.locator('#seal').isEnabled(), true);
      assert.equal(await page.locator('#skip-intro').isVisible(), false);
      const layout = await page.locator('.stage-inner').evaluate(e => {
        const b=e.getBoundingClientRect();
        return {top:b.top,bottom:b.bottom,overflow:document.documentElement.scrollWidth>innerWidth};
      });
      assert(layout.top>=0 && layout.bottom<=height && !layout.overflow, `${name}: ${JSON.stringify(layout)}`);
      await page.waitForFunction(() => Number(getComputedStyle(document.querySelector('.stage-hint')).opacity) > .95);
      await page.screenshot({path:`.preview/delivered-${name}.png`});
      await page.locator('#seal').click();
      await page.waitForFunction(() => document.body.classList.contains('is-revealed'));
      assert.equal(await page.locator('#seal').getAttribute('aria-expanded'), 'true');
      console.log(`${name}: delivery, contact, owl removal, layout and opening passed`);
      await page.close();
    }
    const page = await browser.newPage();
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(url, {waitUntil:'domcontentloaded'});
    await page.locator('#skip-intro').focus();
    await page.keyboard.press('Enter');
    assert(await page.locator('body').evaluate(e => e.classList.contains('delivery-done')));
    assert.equal(await page.locator('.owl-fly').isVisible(), false);
    assert(await page.locator('#seal').evaluate(e => document.activeElement===e), 'Skip transfers focus to seal');
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => document.body.classList.contains('is-revealed'));
    await page.emulateMedia({reducedMotion:'reduce'});
    await page.goto(url, {waitUntil:'domcontentloaded'});
    assert(await page.locator('body').evaluate(e => e.classList.contains('delivery-done')));
    assert.equal(await page.locator('.owl-fly').isVisible(), false);
    await page.locator('#seal').click();
    await page.waitForFunction(() => document.body.classList.contains('is-revealed'));
    await page.emulateMedia({reducedMotion:'no-preference'});
    await page.goto(url+'/?open', {waitUntil:'domcontentloaded'});
    assert(await page.locator('body').evaluate(e => e.classList.contains('is-revealed')));
    assert.equal(await page.locator('.owl-fly').isVisible(), false);
    assert.deepEqual(errors, []);
    console.log('Skip, keyboard focus, reduced motion, direct opening passed; no page errors.');
  } finally {
    if (browser) await browser.close();
    await new Promise(r => server.close(r));
  }
})().catch(e => { console.error(e); process.exitCode=1; });
