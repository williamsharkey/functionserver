// Final Shell test with commands
const puppeteer = require('puppeteer');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

(async () => {
  console.log('Running final Shell test...');

  const browser = await puppeteer.launch({
    headless: false,
    args: ['--no-sandbox'],
    defaultViewport: { width: 1280, height: 800 }
  });

  const page = await browser.newPage();

  try {
    await page.goto('https://functionserver.com/app', { waitUntil: 'networkidle2' });
    await delay(1500);

    // Login as system user
    await page.click('#start-btn');
    await delay(300);
    await page.click('#start-menu-auth');
    await delay(300);
    await page.type('#login-username', 'testuser');
    await page.type('#login-password', 'TestPass123');
    await page.click('#login-system-user');
    await page.click('#login-form button');
    await delay(2000);

    // Open Shell
    await page.evaluate(() => runSystemApp('shell'));
    await delay(3000);

    // Type commands
    console.log('Running: ls --color');
    await page.keyboard.type('ls --color');
    await page.keyboard.press('Enter');
    await delay(1500);

    console.log('Running: whoami');
    await page.keyboard.type('whoami');
    await page.keyboard.press('Enter');
    await delay(1500);

    console.log('Running: echo with colors');
    await page.keyboard.type('echo -e "\\e[32mGreen\\e[0m \\e[31mRed\\e[0m \\e[34mBlue\\e[0m"');
    await page.keyboard.press('Enter');
    await delay(1500);

    await page.screenshot({ path: 'shell-final.png', fullPage: true });
    console.log('Screenshot saved to shell-final.png');

    await delay(10000);

  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await browser.close();
    console.log('Done.');
  }
})();
