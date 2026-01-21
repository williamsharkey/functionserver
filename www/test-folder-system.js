/**
 * Test folder system functionality
 */

const puppeteer = require('puppeteer-core');
const SERVER_URL = 'https://functionserver.com';

async function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function testFolderSystem() {
  console.log(`Testing Folder System at ${SERVER_URL}/app\n`);

  const browser = await puppeteer.launch({
    headless: true,
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    args: ['--no-sandbox', '--disable-web-security']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 900 });

  try {
    // Capture console logs
    page.on('console', msg => console.log('PAGE:', msg.type(), msg.text()));
    page.on('pageerror', err => console.log('PAGE ERROR:', err.message));

    console.log('1. Loading app...');
    await page.goto(`${SERVER_URL}/app`, { waitUntil: 'networkidle2', timeout: 30000 });
    await delay(2000);

    // Test basic JS execution
    const basicTest = await page.evaluate(() => {
      return {
        hasAPI_BASE: typeof API_BASE !== 'undefined',
        hasALGO: typeof ALGO !== 'undefined',
        hasCreateWindow: typeof createWindow !== 'undefined',
        winIdValue: typeof winId !== 'undefined' ? winId : null,
        hasCheckSession: typeof checkSession !== 'undefined',
        documentReady: document.readyState
      };
    });
    console.log('Basic JS test:', JSON.stringify(basicTest));

    // Check if we need to login
    const loginState = await page.evaluate(() => {
      const overlay = document.getElementById('login-overlay');
      return {
        hasOverlay: !!overlay,
        hasHiddenClass: overlay ? overlay.classList.contains('hidden') : null,
        display: overlay ? window.getComputedStyle(overlay).display : null,
        offsetParent: overlay ? !!overlay.offsetParent : null
      };
    });
    console.log('Login state:', JSON.stringify(loginState));

    const needsLogin = loginState.hasOverlay && loginState.display !== 'none';

    if (needsLogin) {
      console.log('2. Registering test user...');
      const testUser = 'foldertest' + Date.now().toString().slice(-6);

      // Click the Register tab
      await page.evaluate(() => {
        const tab = document.querySelector('.tab[data-tab="register"]');
        if (tab) tab.click();
      });
      await delay(500);

      // Fill in all register form fields
      await page.evaluate((user) => {
        const u = document.getElementById('reg-username');
        const p = document.getElementById('reg-password');
        const c = document.getElementById('reg-confirm');
        if (u) u.value = user;
        if (p) p.value = 'testpass123';
        if (c) c.value = 'testpass123';
      }, testUser);

      // Click Create Account
      await page.evaluate(() => {
        const btn = document.querySelector('#register-form button');
        if (btn) btn.click();
      });
      await delay(3000);

      // Check login result
      const postLoginState = await page.evaluate(() => {
        const overlay = document.getElementById('login-overlay');
        return {
          overlayHidden: overlay ? overlay.classList.contains('hidden') : null,
          overlayDisplay: overlay ? window.getComputedStyle(overlay).display : null,
          currentUser: typeof currentUser !== 'undefined' ? currentUser : 'undefined',
          sessionToken: typeof sessionToken !== 'undefined' ? (sessionToken ? 'exists' : 'empty') : 'undefined',
          desktopIconCount: document.querySelectorAll('.desktop-icon').length
        };
      });
      console.log(`   Registered as: ${testUser}`);
      console.log(`   Post-login state: ${JSON.stringify(postLoginState)}`);
    }

    // Check for Programs folder icon on desktop
    console.log('\n3. Checking for Programs folder icon...');
    const hasProgramsIcon = await page.evaluate(() => {
      const icon = document.getElementById('icon-programs');
      return !!icon;
    });
    console.log(`   Programs folder icon: ${hasProgramsIcon}`);

    // Check for Recycle Bin icon on desktop
    console.log('\n4. Checking for Recycle Bin icon...');
    const hasRecycleIcon = await page.evaluate(() => {
      const icon = document.getElementById('icon-recycle-bin');
      return !!icon;
    });
    console.log(`   Recycle Bin icon: ${hasRecycleIcon}`);

    // Check for ALGO dolphin as desktop icon
    console.log('\n5. Checking for ALGO dolphin icon...');
    const hasDolphinIcon = await page.evaluate(() => {
      const icon = document.getElementById('icon-algo-dolphin');
      return !!icon;
    });
    console.log(`   ALGO dolphin icon: ${hasDolphinIcon}`);

    // Test opening Programs folder
    console.log('\n6. Testing Programs folder...');
    const openedPrograms = await page.evaluate(() => {
      const icon = document.getElementById('icon-programs');
      if (icon) {
        icon.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
        return true;
      }
      return false;
    });
    console.log(`   Double-clicked Programs: ${openedPrograms}`);
    await delay(1000);

    const programsWindowOpen = await page.evaluate(() => {
      const windows = document.querySelectorAll('.window');
      return Array.from(windows).some(w =>
        w.textContent.includes('AI Wizards') ||
        w.textContent.includes('Media') ||
        w.textContent.includes('Tools')
      );
    });
    console.log(`   Programs window open: ${programsWindowOpen}`);

    // Close Programs window
    await page.evaluate(() => {
      const windows = document.querySelectorAll('.window');
      for (const w of windows) {
        if (w.textContent.includes('AI Wizards') || w.textContent.includes('Programs')) {
          const closeBtn = w.querySelector('.close-btn');
          if (closeBtn) closeBtn.click();
        }
      }
    });
    await delay(500);

    // Test opening Recycle Bin
    console.log('\n7. Testing Recycle Bin...');
    const openedRecycle = await page.evaluate(() => {
      const icon = document.getElementById('icon-recycle-bin');
      if (icon) {
        icon.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
        return true;
      }
      return false;
    });
    console.log(`   Double-clicked Recycle Bin: ${openedRecycle}`);
    await delay(1000);

    const recycleBinOpen = await page.evaluate(() => {
      const windows = document.querySelectorAll('.window');
      return Array.from(windows).some(w =>
        w.textContent.includes('Recycle Bin') ||
        w.textContent.includes('Empty') ||
        w.textContent.includes('Empty Recycle Bin')
      );
    });
    console.log(`   Recycle Bin window open: ${recycleBinOpen}`);

    // Test snap to grid function
    console.log('\n8. Testing snap-to-grid...');
    const snapWorks = await page.evaluate(() => {
      if (typeof snapToGrid === 'function') {
        const test1 = snapToGrid(45, 67);
        const test2 = snapToGrid(120, 200);
        return {
          input1: { x: 45, y: 67 },
          output1: test1,
          input2: { x: 120, y: 200 },
          output2: test2
        };
      }
      return null;
    });
    console.log(`   Snap-to-grid results: ${JSON.stringify(snapWorks)}`);

    // Test folder state variables
    console.log('\n9. Checking folder system variables...');
    const folderVars = await page.evaluate(() => {
      return {
        foldersExists: typeof folders !== 'undefined',
        recycleBinExists: typeof recycleBin !== 'undefined',
        FOLDER_DESKTOP: typeof FOLDER_DESKTOP !== 'undefined' ? FOLDER_DESKTOP : null,
        FOLDER_PROGRAMS: typeof FOLDER_PROGRAMS !== 'undefined' ? FOLDER_PROGRAMS : null,
        FOLDER_RECYCLE: typeof FOLDER_RECYCLE !== 'undefined' ? FOLDER_RECYCLE : null,
        GRID_SIZE: typeof GRID_SIZE !== 'undefined' ? GRID_SIZE : null
      };
    });
    console.log(`   Folder variables: ${JSON.stringify(folderVars)}`);

    // Test context menu New Folder option
    console.log('\n10. Testing context menu...');
    await page.evaluate(() => {
      const desktop = document.getElementById('desktop');
      if (desktop) {
        const event = new MouseEvent('contextmenu', {
          bubbles: true,
          clientX: 300,
          clientY: 300
        });
        desktop.dispatchEvent(event);
      }
    });
    await delay(500);

    const hasNewFolderOption = await page.evaluate(() => {
      const menu = document.getElementById('context-menu');
      if (menu && menu.style.display !== 'none') {
        return menu.textContent.includes('New Folder');
      }
      return false;
    });
    console.log(`   New Folder option in context menu: ${hasNewFolderOption}`);

    console.log('\n✓ All folder system tests completed!');

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await browser.close();
  }
}

testFolderSystem().catch(console.error);
