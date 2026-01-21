// Quick debug test
const puppeteer = require('puppeteer-core');

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function test() {
  const browser = await puppeteer.launch({
    headless: false, // Show browser for debugging
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    args: ['--no-sandbox'],
    devtools: true
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });
  await page.goto('http://localhost:8080/app', { waitUntil: 'networkidle0' });
  await sleep(2000);

  // Log the actual code being evaluated
  const result = await page.evaluate(() => {
    const app = systemApps[0]; // First app
    console.log('App:', app.name);
    console.log('Code length:', app.code.length);
    console.log('First 200 chars:', app.code.substring(0, 200));

    // Try running it
    try {
      const fullCode = ALGO_API_CODE + '\n' + app.code;
      console.log('Full code length:', fullCode.length);
      console.log('Full code preview:', fullCode.substring(0, 300));
      eval(fullCode);
      return { success: true };
    } catch (e) {
      console.error('Error:', e);
      return { success: false, error: e.message, stack: e.stack };
    }
  });

  console.log('Result:', result);

  // Keep browser open for inspection
  await sleep(30000);
  await browser.close();
}

test().catch(console.error);
