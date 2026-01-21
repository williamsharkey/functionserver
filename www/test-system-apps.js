// Test all system apps load and run correctly
const puppeteer = require('puppeteer-core');

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function testSystemApps() {
  console.log('Starting system apps test...\n');

  const browser = await puppeteer.launch({
    headless: true,
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    args: ['--no-sandbox']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });

  // Go to app
  await page.goto('http://localhost:8080/app', { waitUntil: 'networkidle0' });
  await sleep(1500); // Wait for guest login

  // Check we're in guest mode
  const userIndicator = await page.$eval('#user-indicator', el => el.textContent);
  console.log('User mode:', userIndicator);

  // Get list of system apps from API
  const apps = await page.evaluate(async () => {
    const r = await fetch('/api/system-apps');
    const data = await r.json();
    return data.apps;
  });

  console.log(`\nFound ${apps.length} system apps to test:\n`);

  const results = [];

  for (const app of apps) {
    process.stdout.write(`Testing ${app.name} (${app.id})... `);

    try {
      // Run the app
      const windowsBefore = await page.$$('.window');

      await page.evaluate((appId) => {
        runSystemApp(appId);
      }, app.id);

      await sleep(500);

      // Check if a window was created
      const windowsAfter = await page.$$('.window');
      const newWindows = windowsAfter.length - windowsBefore.length;

      if (newWindows > 0) {
        // Get window title
        const lastWindow = windowsAfter[windowsAfter.length - 1];
        const title = await lastWindow.$eval('.window-title', el => el.textContent);
        console.log(`✓ Window: "${title}"`);
        results.push({ app: app.name, status: 'pass', window: title });

        // Close the window
        const closeBtn = await lastWindow.$('.win-btn.close');
        if (closeBtn) await closeBtn.click();
        await sleep(100);
      } else {
        // Check for errors
        const hasError = await page.evaluate(() => {
          const toasts = document.querySelectorAll('.algo-toast');
          for (const t of toasts) {
            if (t.textContent.includes('Error')) return t.textContent;
          }
          return null;
        });

        if (hasError) {
          console.log(`✗ Error: ${hasError}`);
          results.push({ app: app.name, status: 'fail', error: hasError });
        } else {
          console.log('✗ No window created');
          results.push({ app: app.name, status: 'fail', error: 'No window' });
        }
      }
    } catch (e) {
      console.log(`✗ Exception: ${e.message}`);
      results.push({ app: app.name, status: 'fail', error: e.message });
    }
  }

  await browser.close();

  // Summary
  console.log('\n=== SUMMARY ===');
  const passed = results.filter(r => r.status === 'pass').length;
  const failed = results.filter(r => r.status === 'fail').length;
  console.log(`Passed: ${passed}/${results.length}`);
  console.log(`Failed: ${failed}/${results.length}`);

  if (failed > 0) {
    console.log('\nFailed apps:');
    results.filter(r => r.status === 'fail').forEach(r => {
      console.log(`  - ${r.app}: ${r.error}`);
    });
    process.exit(1);
  } else {
    console.log('\nAll system apps working!');
    process.exit(0);
  }
}

testSystemApps().catch(e => {
  console.error('Test failed:', e);
  process.exit(1);
});
