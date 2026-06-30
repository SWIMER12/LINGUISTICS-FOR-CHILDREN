import { chromium } from 'playwright';

const OUT = process.argv[2] || 'before';
const base = 'http://127.0.0.1:5000';
const browser = await chromium.launch();

async function shot(path, file, mobile, full=true) {
  const ctx = await browser.newContext(
    mobile ? { viewport: { width: 412, height: 900 }, deviceScaleFactor: 2 }
           : { viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(base + path, { waitUntil: 'networkidle' });
  await page.waitForTimeout(900);
  await page.screenshot({ path: `shots_${OUT}/${file}.png`, fullPage: full });
  await ctx.close();
}

await shot('/reviews', 'reviews_mobile', true);
await shot('/reviews', 'reviews_desktop', false);
await shot('/projects', 'projects_mobile', true);
await shot('/projects', 'projects_desktop', false);
await shot('/news', 'news_mobile', true);
await shot('/courses', 'courses_mobile', true);

await browser.close();
console.log('done');
