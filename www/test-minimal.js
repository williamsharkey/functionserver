const puppeteer = require('puppeteer-core');

async function test() {
  const browser = await puppeteer.launch({
    headless: true,
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    args: ['--no-sandbox', '--disable-web-security', '--disable-features=IsolateOrigins,site-per-process']
  });

  const page = await browser.newPage();

  page.on('console', msg => {
    const type = msg.type();
    if (type === 'error' || type === 'warning') {
      console.log('Console:', type, msg.text());
    }
  });
  page.on('pageerror', err => console.log('Page error:', err.message));
  page.on('requestfailed', req => console.log('Failed request:', req.url()));

  console.log('Loading page...');
  try {
    await page.goto('https://functionserver.com/app', {
      waitUntil: 'load',
      timeout: 60000
    });

    // Wait a bit for scripts to execute
    await new Promise(r => setTimeout(r, 3000));

    // Check if basic variables exist
    const result = await page.evaluate(() => {
      return {
        API_BASE: typeof API_BASE !== 'undefined' ? API_BASE : 'undefined',
        ALGO: typeof ALGO !== 'undefined' ? 'exists' : 'undefined',
        winId: typeof winId !== 'undefined' ? winId : 'undefined',
        documentTitle: document.title,
        bodyChildCount: document.body ? document.body.childNodes.length : 0,
        hasDesktop: !!document.getElementById('desktop'),
        hasTaskbar: !!document.getElementById('taskbar'),
        scriptTags: document.querySelectorAll('script').length
      };
    });

    console.log('Result:', JSON.stringify(result, null, 2));

  } catch (e) {
    console.log('Error:', e.message);
  }

  await browser.close();
}

test();
