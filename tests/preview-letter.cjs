const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/Acer/.npm-global/node_modules/playwright');

(async () => {
  const server = http.createServer((req, res) => {
    if (req.url.startsWith('/assets/')) {
      res.setHeader('Content-Type', 'image/png');
      res.end(fs.readFileSync(path.join('.', req.url)));
      return;
    }
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end(fs.readFileSync('index.html'));
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const browser = await chromium.launch();
  fs.mkdirSync('.preview', { recursive: true });
  for (const [name, width, height] of [['desktop',1366,768],['mobile',390,844],['small',320,568]]) {
    const page = await browser.newPage({ viewport: {width,height} });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(`http://127.0.0.1:${server.address().port}/`, { waitUntil:'networkidle' });
    await page.waitForTimeout(600);
    await page.screenshot({ path: `.preview/envelope-${name}.png` });
    // Open the envelope, then freeze animations at the moment the letter has risen.
    await page.locator('#seal').click({ force: true });
    await page.waitForTimeout(300);
    await page.evaluate(() => document.getAnimations().forEach(a => { a.pause(); a.currentTime = 1600; }));
    await page.waitForTimeout(200);
    const logoInfo = await page.evaluate(() => {
      const img = document.querySelector('.school-logo-mark');
      if (!img) return null;
      const b = img.getBoundingClientRect();
      return { natural: img.naturalWidth + 'x' + img.naturalHeight, shown: Math.round(b.width) + 'x' + Math.round(b.height), visible: b.width > 0 && b.height > 0 };
    });
    console.log(name, 'letter logo:', JSON.stringify(logoInfo));
    await page.screenshot({ path: `.preview/letter-${name}.png` });
    // Let it finish and capture the revealed invitation.
    await page.evaluate(() => document.getAnimations().forEach(a => { a.play(); }));
    await page.waitForFunction(() => document.body.classList.contains('is-revealed'));
    await page.waitForTimeout(900);
    await page.screenshot({ path: `.preview/revealed-${name}.png` });
    console.log(name, 'errors:', errors.join('; ') || 'none');
    await page.close();
  }
  await browser.close();
  await new Promise(r => server.close(r));
})().catch(e => { console.error(e); process.exit(1); });
