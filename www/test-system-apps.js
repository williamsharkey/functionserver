const puppeteer = require('puppeteer-core');

async function test() {
  const browser = await puppeteer.launch({ headless: true,
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  
  page.on('console', msg => {
    if (msg.type() === 'error' && !msg.text().includes('404') && !msg.text().includes('403')) {
      console.log('ERR:', msg.text());
    }
  });

  console.log('1. Loading app...');
  await page.goto('https://functionserver.com/app', { waitUntil: 'networkidle2', timeout: 30000 });
  await new Promise(r => setTimeout(r, 2000));

  // Register and login
  const needsLogin = await page.evaluate(() => {
    const overlay = document.getElementById('login-overlay');
    return overlay && !overlay.classList.contains('hidden');
  });

  if (needsLogin) {
    console.log('2. Registering...');
    await page.evaluate(() => {
      const tab = document.querySelector('.tab[data-tab="register"]');
      if (tab) tab.click();
    });
    await new Promise(r => setTimeout(r, 300));
    
    const user = 'sysapptest' + Date.now().toString().slice(-6);
    await page.evaluate((u) => {
      document.getElementById('reg-username').value = u;
      document.getElementById('reg-password').value = 'test123';
      document.getElementById('reg-confirm').value = 'test123';
      document.querySelector('#register-form button').click();
    }, user);
    await new Promise(r => setTimeout(r, 3000));
  }

  // Wait for system apps to load
  await new Promise(r => setTimeout(r, 2000));

  // Check system apps
  console.log('3. Checking system apps...');
  const result = await page.evaluate(() => {
    return {
      systemAppsCount: typeof systemApps !== 'undefined' ? systemApps.length : 0,
      systemApps: typeof systemApps !== 'undefined' ? systemApps.map(a => ({ id: a.id, name: a.name, icon: a.icon })) : [],
      uninstalledCount: typeof uninstalledSystemApps !== 'undefined' ? uninstalledSystemApps.length : 0
    };
  });

  console.log('   System apps:', result.systemAppsCount);
  result.systemApps.forEach(a => console.log('   -', a.icon, a.name));

  // Run Ticket Manager directly
  if (result.systemAppsCount > 0) {
    console.log('4. Running Ticket Manager...');
    await page.evaluate(() => {
      const app = systemApps.find(a => a.id === 'ticket-manager');
      if (app) runApp(app);
    });
    await new Promise(r => setTimeout(r, 1500));

    const windowOpen = await page.evaluate(() => {
      const windows = document.querySelectorAll('.window');
      return Array.from(windows).some(w => w.textContent.includes('Ticket Manager'));
    });
    console.log('   Window opened:', windowOpen);

    // Check if the app UI loaded
    const appUI = await page.evaluate(() => {
      const hasRefresh = !!document.querySelector('button[onclick*="_tm_refresh"]');
      const hasList = !!document.getElementById('tm-list');
      return { hasRefresh, hasList };
    });
    console.log('   App UI loaded:', appUI.hasRefresh && appUI.hasList);
  }

  // Test fork functionality
  console.log('5. Testing fork...');
  await page.evaluate(() => {
    forkSystemApp('ticket-manager');
  });
  await new Promise(r => setTimeout(r, 500));

  const forked = await page.evaluate(() => {
    return installedPrograms.some(p => p.name.includes('Ticket Manager') && p.name.includes('Copy'));
  });
  console.log('   Forked successfully:', forked);

  // Test uninstall
  console.log('6. Testing uninstall...');
  await page.evaluate(() => {
    uninstallSystemApp('ticket-manager');
  });
  await new Promise(r => setTimeout(r, 500));

  const uninstalled = await page.evaluate(() => {
    return uninstalledSystemApps.includes('ticket-manager');
  });
  console.log('   Uninstalled:', uninstalled);

  // Test reinstall
  console.log('7. Testing reinstall...');
  await page.evaluate(() => {
    reinstallSystemApp('ticket-manager');
  });
  await new Promise(r => setTimeout(r, 500));

  const reinstalled = await page.evaluate(() => {
    return !uninstalledSystemApps.includes('ticket-manager');
  });
  console.log('   Reinstalled:', reinstalled);

  await browser.close();
  console.log('\n✓ System apps test complete!');
}

test().catch(e => console.error('Error:', e.message));
