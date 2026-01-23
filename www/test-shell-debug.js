// Debug Shell App test
const puppeteer = require('puppeteer');

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

(async () => {
  console.log('Starting Shell debug test...');

  const browser = await puppeteer.launch({
    headless: false,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    defaultViewport: { width: 1280, height: 800 }
  });

  const page = await browser.newPage();

  // Capture ALL console messages
  page.on('console', msg => {
    const type = msg.type();
    const text = msg.text();
    if (type === 'error' || text.includes('Shell') || text.includes('PTY') || text.includes('WebSocket')) {
      console.log(`[${type}] ${text}`);
    }
  });
  page.on('pageerror', err => console.log('PAGE ERROR:', err.message));
  page.on('requestfailed', req => console.log('REQUEST FAILED:', req.url(), req.failure().errorText));

  try {
    console.log('1. Loading FunctionServer...');
    await page.goto('https://functionserver.com/app', { waitUntil: 'networkidle2' });
    await delay(2000);

    // Login
    await page.click('#start-btn');
    await delay(300);
    await page.click('#start-menu-auth');
    await delay(300);

    await page.type('#login-username', 'testuser');
    await page.type('#login-password', 'TestPass123');
    await page.click('#login-system-user');
    await delay(200);
    await page.click('#login-form button');
    await delay(2000);

    const userIndicator = await page.$eval('#user-indicator', el => el.textContent);
    console.log('2. Logged in as:', userIndicator);

    // Open Shell directly via runSystemApp
    console.log('3. Opening Shell...');
    await page.evaluate(() => {
      runSystemApp('shell');
    });

    await delay(3000);

    // Check for windows
    const windowCount = await page.evaluate(() => windows.length);
    console.log('4. Open windows:', windowCount);

    // Take screenshot
    await page.screenshot({ path: 'shell-debug.png', fullPage: true });
    console.log('5. Screenshot saved');

    // Check WebSocket status
    const wsStatus = await page.evaluate(() => {
      const termContainer = document.querySelector('[id*="shell-term"]');
      if (termContainer) {
        const status = termContainer.querySelector('[id*="status"]');
        if (status) return status.style.display + ': ' + (status.textContent || 'no text');
      }
      return 'terminal container not found';
    });
    console.log('6. Terminal status:', wsStatus);

    console.log('7. Waiting 15 seconds for inspection...');
    await delay(15000);

  } catch (err) {
    console.error('Test error:', err);
    await page.screenshot({ path: 'shell-debug-error.png', fullPage: true });
  } finally {
    await browser.close();
    console.log('Test complete.');
  }
})();
