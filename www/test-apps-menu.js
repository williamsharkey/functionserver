// Test all system apps are accessible from Programs menu
const puppeteer = require('puppeteer-core');

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function testAppsMenu() {
  console.log('Testing all system apps are findable in Programs menu...\n');

  const browser = await puppeteer.launch({
    headless: true,
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    args: ['--no-sandbox']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });

  // Test against production
  const baseUrl = process.argv[2] || 'https://functionserver.com';
  console.log('Testing:', baseUrl + '/app\n');

  await page.goto(baseUrl + '/app', { waitUntil: 'networkidle0' });
  await sleep(2000); // Wait for guest login and system apps to load

  // Check we're in guest mode
  const userIndicator = await page.$eval('#user-indicator', el => el.textContent).catch(() => 'unknown');
  console.log('User mode:', userIndicator);

  // Get list of system apps from API
  const apps = await page.evaluate(async () => {
    const r = await fetch('/api/system-apps');
    const data = await r.json();
    return data.apps;
  });

  console.log(`\nFound ${apps.length} system apps to verify:\n`);

  // Click Start button to open menu
  await page.click('#start-btn');
  await sleep(300);

  // Hover over Programs to open submenu
  const programsItem = await page.$('.start-item.has-sub');
  if (programsItem) {
    await programsItem.hover();
    await sleep(500);
  }

  const results = [];

  for (const app of apps) {
    process.stdout.write(`Checking ${app.name} (${app.id})... `);

    try {
      // Look for the app in the Programs menu
      const found = await page.evaluate((appName, appId) => {
        const menuItems = document.querySelectorAll('#installed-programs-menu .start-item, #programs-menu .start-item');
        for (const item of menuItems) {
          const text = item.textContent.trim();
          // Check if item contains the app name
          if (text.includes(appName)) {
            return { found: true, text: text };
          }
        }
        // Also check if there's an onclick with the app id
        for (const item of menuItems) {
          const onclick = item.getAttribute('onclick') || '';
          if (onclick.includes(appId)) {
            return { found: true, text: item.textContent.trim() };
          }
        }
        return { found: false };
      }, app.name, app.id);

      if (found.found) {
        console.log(`✓ Found: "${found.text.substring(0, 30)}"`);
        results.push({ app: app.name, id: app.id, status: 'pass', menuText: found.text });
      } else {
        console.log('✗ NOT FOUND in menu');
        results.push({ app: app.name, id: app.id, status: 'fail', error: 'Not in menu' });
      }
    } catch (e) {
      console.log(`✗ Error: ${e.message}`);
      results.push({ app: app.name, id: app.id, status: 'fail', error: e.message });
    }
  }

  // Now test that clicking each app actually opens a window
  console.log('\n--- Testing app launches ---\n');

  for (const app of apps) {
    process.stdout.write(`Launching ${app.name}... `);

    try {
      // Close any existing windows first
      await page.evaluate(() => {
        document.querySelectorAll('.window').forEach(w => w.remove());
        windows = [];
      });

      // Re-open menu
      await page.click('#start-btn');
      await sleep(200);
      const progItem = await page.$('.start-item.has-sub');
      if (progItem) {
        await progItem.hover();
        await sleep(300);
      }

      // Find and click the app
      const clicked = await page.evaluate((appId) => {
        const menuItems = document.querySelectorAll('#installed-programs-menu .start-item');
        for (const item of menuItems) {
          const onclick = item.getAttribute('onclick') || '';
          if (onclick.includes(appId)) {
            item.click();
            return true;
          }
        }
        return false;
      }, app.id);

      if (!clicked) {
        // Try running directly
        await page.evaluate((appId) => {
          if (typeof runSystemApp === 'function') runSystemApp(appId);
        }, app.id);
      }

      await sleep(600);

      // Check if a window opened
      const windowCount = await page.$$eval('.window', wins => wins.length);
      const windowTitle = windowCount > 0
        ? await page.$eval('.window .window-title', el => el.textContent).catch(() => 'unknown')
        : null;

      if (windowCount > 0) {
        console.log(`✓ Window opened: "${windowTitle}"`);
        const result = results.find(r => r.id === app.id);
        if (result) result.windowOpened = true;
      } else {
        console.log('✗ No window opened');
        const result = results.find(r => r.id === app.id);
        if (result) {
          result.status = 'fail';
          result.windowOpened = false;
        }
      }

      // Close the window
      await page.evaluate(() => {
        document.querySelectorAll('.window').forEach(w => w.remove());
        windows = [];
      });

    } catch (e) {
      console.log(`✗ Error: ${e.message}`);
    }
  }

  await browser.close();

  // Summary
  console.log('\n========== SUMMARY ==========\n');

  const passed = results.filter(r => r.status === 'pass' && r.windowOpened !== false);
  const failed = results.filter(r => r.status === 'fail' || r.windowOpened === false);

  console.log(`Total apps: ${results.length}`);
  console.log(`Passed: ${passed.length}`);
  console.log(`Failed: ${failed.length}`);

  if (failed.length > 0) {
    console.log('\nFailed apps:');
    failed.forEach(r => {
      console.log(`  - ${r.app} (${r.id}): ${r.error || 'window did not open'}`);
    });
    process.exit(1);
  } else {
    console.log('\n✓ All system apps found and launchable!');
    process.exit(0);
  }
}

testAppsMenu().catch(e => {
  console.error('Test failed:', e);
  process.exit(1);
});
