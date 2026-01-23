// Test Shell App with System User Login
const puppeteer = require('puppeteer');

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

(async () => {
  console.log('Starting Shell test...');

  const browser = await puppeteer.launch({
    headless: false,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    defaultViewport: { width: 1280, height: 800 }
  });

  const page = await browser.newPage();

  // Enable console logging
  page.on('console', msg => console.log('PAGE:', msg.text()));
  page.on('pageerror', err => console.log('PAGE ERROR:', err.message));

  try {
    console.log('1. Loading FunctionServer...');
    await page.goto('https://functionserver.com/app', { waitUntil: 'networkidle2' });
    await delay(2000);

    console.log('2. Clicking Login button in start menu...');
    // Click Start button
    await page.click('#start-btn');
    await delay(500);

    // Click the login/register item
    await page.click('#start-menu-auth');
    await delay(500);

    console.log('3. Filling login form with system user...');
    // Wait for login overlay
    await page.waitForSelector('#login-overlay', { visible: true });

    // Fill in credentials
    await page.type('#login-username', 'testuser');
    await page.type('#login-password', 'TestPass123');

    // Check the system user checkbox
    await page.click('#login-system-user');
    await delay(300);

    console.log('4. Submitting login...');
    // Click login button
    await page.click('#login-form button');
    await delay(3000);

    // Check for errors
    const error = await page.$eval('#login-error', el => el.textContent).catch(() => '');
    if (error) {
      console.log('Login error:', error);
    }

    // Check if login succeeded
    const userIndicator = await page.$eval('#user-indicator', el => el.textContent).catch(() => '');
    console.log('User indicator:', userIndicator);

    if (userIndicator.includes('testuser')) {
      console.log('5. Login successful! Opening Shell...');

      // Open Start menu
      await page.click('#start-btn');
      await delay(500);

      // Hover over Programs to open submenu
      await page.hover('.start-item.has-sub');
      await delay(800);

      // Click Shell from the menu
      const found = await page.evaluate(() => {
        const items = document.querySelectorAll('.start-item');
        for (const item of items) {
          if (item.textContent.includes('Shell')) {
            item.click();
            return true;
          }
        }
        return false;
      });
      console.log('Found Shell:', found);

      await delay(5000);

      console.log('6. Taking screenshot...');
      await page.screenshot({ path: 'shell-test.png', fullPage: true });
      console.log('Screenshot saved to shell-test.png');

      // Try typing a command in the terminal
      console.log('7. Typing command in terminal...');
      await page.keyboard.type('whoami');
      await page.keyboard.press('Enter');
      await delay(2000);

      await page.screenshot({ path: 'shell-test-command.png', fullPage: true });
      console.log('Command screenshot saved');
    } else {
      console.log('Login may have failed. Taking screenshot...');
      await page.screenshot({ path: 'shell-test-error.png', fullPage: true });
    }

    console.log('8. Waiting for manual inspection (20 seconds)...');
    await delay(20000);

  } catch (err) {
    console.error('Test error:', err.message);
    await page.screenshot({ path: 'shell-test-error.png', fullPage: true });
  } finally {
    await browser.close();
    console.log('Test complete.');
  }
})();
