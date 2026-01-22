// Test recur-web on production
const puppeteer = require('puppeteer-core');

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function testRecurWeb() {
  console.log('Testing recur-web on https://functionserver.com\n');

  const browser = await puppeteer.launch({
    headless: false,  // Watch it run
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    args: ['--no-sandbox', '--window-size=1400,900']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 900 });

  try {
    // Go to functionserver.com
    console.log('1. Loading functionserver.com...');
    await page.goto('https://functionserver.com/app', { waitUntil: 'networkidle0', timeout: 30000 });
    await sleep(2000);

    // Wait for guest auto-login
    console.log('2. Waiting for guest login...');
    await page.waitForSelector('#user-indicator', { timeout: 10000 });
    const user = await page.$eval('#user-indicator', el => el.textContent);
    console.log('   Logged in as:', user);

    // Open Programs menu and find recur-web
    console.log('3. Opening Programs menu...');
    await page.click('#start-btn');
    await sleep(500);

    // Run recur-web via console (most reliable)
    console.log('4. Opening recur-web...');
    await page.evaluate(() => {
      if (typeof runSystemApp === 'function') {
        runSystemApp('recur-web');
      }
    });
    await sleep(2000);

    // Check if recur-web window opened
    const windows = await page.$$('.window');
    console.log('   Windows open:', windows.length);

    // Find the recur-web window
    const hasRecurWeb = await page.evaluate(() => {
      const windows = document.querySelectorAll('.window');
      for (const w of windows) {
        if (w.innerText.includes('recur-web')) return true;
      }
      return false;
    });
    if (!hasRecurWeb) {
      throw new Error('recur-web window not found');
    }
    console.log('   ✓ recur-web window opened');

    // Find the script editor and enter a test script
    console.log('5. Entering test script...');
    const scriptEditor = await page.$('textarea[id^="rw-script-"]');
    if (!scriptEditor) {
      throw new Error('Script editor not found');
    }

    // Clear the editor completely and enter test script
    await page.evaluate(() => {
      const editor = document.querySelector('textarea[id^="rw-script-"]');
      if (editor) editor.value = '';
    });
    await sleep(100);

    const testScript = `// recur-web Test Script
await page.goto('https://example.com');
await page.waitFor(1500);

const pageTitle = await page.title();
console.log('Page title:', pageTitle);

const heading = await page.$eval('h1', el => el.textContent);
console.log('H1 text:', heading);

// Test assertions
(await page.expect(pageTitle)).toContain('Example');
console.log('✓ Title assertion passed');

(await page.expect(heading)).toContain('Example');
console.log('✓ H1 assertion passed');

console.log('');
console.log('All tests passed!');`;

    await page.evaluate((script) => {
      const editor = document.querySelector('textarea[id^="rw-script-"]');
      if (editor) editor.value = script;
    }, testScript);

    await sleep(500);

    // Click Run button
    console.log('6. Running automation script...');
    await page.evaluate(() => {
      const buttons = document.querySelectorAll('button');
      for (const btn of buttons) {
        if (btn.innerText.includes('Run')) {
          btn.click();
          break;
        }
      }
    });

    // Wait for script to complete (fetching via proxy can take time)
    await sleep(12000);

    // Check console output
    console.log('7. Checking results...');
    const consoleDiv = await page.$('div[id^="rw-console-"]');
    if (consoleDiv) {
      const consoleText = await page.evaluate(el => el.innerText, consoleDiv);
      console.log('\n--- recur-web Console Output ---');
      console.log(consoleText);
      console.log('--- End Console Output ---\n');

      // Check for success
      if (consoleText.includes('All tests passed')) {
        console.log('✓ recur-web automation test PASSED!');
      } else if (consoleText.includes('Error')) {
        console.log('✗ Script had errors');
      } else {
        console.log('? Script completed (check output above)');
      }
    }

    // Check the browser iframe loaded something
    const iframe = await page.$('iframe[id^="rw-frame-"]');
    if (iframe) {
      const iframeSrc = await page.evaluate(el => el.srcdoc?.length || 0, iframe);
      console.log('   Browser iframe content length:', iframeSrc, 'chars');
    }

    // Take screenshot
    await page.screenshot({ path: '/Users/william/Desktop/functionserver/www/recur-web-test.png', fullPage: false });
    console.log('\n✓ Screenshot saved: www/recur-web-test.png');

    // Keep browser open for a moment to see results
    console.log('\nTest complete! Browser will close in 5 seconds...');
    await sleep(5000);

  } catch (err) {
    console.error('Test failed:', err.message);
    await page.screenshot({ path: '/Users/william/Desktop/functionserver/www/recur-web-error.png' });
    console.log('Error screenshot saved: www/recur-web-error.png');
  }

  await browser.close();
}

testRecurWeb().catch(console.error);
