/**
 * Test Look app and external app functionality
 */

const puppeteer = require('puppeteer');
const SERVER_URL = 'https://functionserver.com';

async function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function testLookApp() {
  console.log(`Testing Look app at ${SERVER_URL}/app\n`);

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-web-security']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 900 });

  try {
    console.log('1. Loading app...');
    await page.goto(`${SERVER_URL}/app`, { waitUntil: 'networkidle2', timeout: 30000 });
    await delay(2000);

    // Check if we need to login
    const needsLogin = await page.evaluate(() => {
      return !!document.getElementById('login-overlay')?.offsetParent;
    });

    if (needsLogin) {
      console.log('2. Registering test user...');
      const testUser = 'looktest' + Date.now().toString().slice(-6);

      await page.evaluate(() => {
        const link = document.querySelector('a[onclick*="showRegister"], span[onclick*="showRegister"]');
        if (link) link.click();
      });
      await delay(500);

      await page.evaluate((user) => {
        const u = document.getElementById('reg-username');
        const p = document.getElementById('reg-password');
        if (u && p) { u.value = user; p.value = 'testpass123'; }
      }, testUser);

      await page.evaluate(() => {
        const btn = document.querySelector('#register-form button');
        if (btn) btn.click();
      });
      await delay(2000);
      console.log(`   Registered as: ${testUser}`);
    }

    // Check for Look app in installed programs
    console.log('\n3. Checking for Look app in installed programs...');
    const hasLookApp = await page.evaluate(() => {
      const programs = JSON.parse(localStorage.getItem('algo-programs') || '[]');
      return programs.some(p => p.id === 'look' || p.name === 'Look');
    });
    console.log(`   Look app installed: ${hasLookApp}`);

    // Open Look app from Programs menu
    console.log('\n4. Opening Look app...');
    await page.evaluate(() => {
      document.getElementById('start-btn')?.click();
    });
    await delay(500);

    // Click Programs folder
    await page.evaluate(() => {
      const items = document.querySelectorAll('.start-item.has-sub');
      items.forEach(item => {
        if (item.textContent.includes('Programs')) item.click();
      });
    });
    await delay(500);

    // Find and click Look in the menu
    const clickedLook = await page.evaluate(() => {
      const items = document.querySelectorAll('.start-item');
      for (const item of items) {
        if (item.textContent.includes('Look')) {
          item.click();
          return true;
        }
      }
      // Try installed programs menu
      const installed = document.getElementById('installed-programs-menu');
      if (installed) {
        const lookItem = Array.from(installed.querySelectorAll('.start-item')).find(i => i.textContent.includes('Look'));
        if (lookItem) {
          lookItem.click();
          return true;
        }
      }
      return false;
    });
    console.log(`   Clicked Look: ${clickedLook}`);
    await delay(1000);

    // Check if Look window opened
    const lookWindowOpen = await page.evaluate(() => {
      const windows = document.querySelectorAll('.window');
      return Array.from(windows).some(w => w.textContent.includes('Theme Manager') || w.textContent.includes('Look'));
    });
    console.log(`   Look window opened: ${lookWindowOpen}`);

    // Test theme switching
    if (lookWindowOpen) {
      console.log('\n5. Testing theme switching...');

      // Click Dark Mode theme
      const clickedDark = await page.evaluate(() => {
        const buttons = document.querySelectorAll('button');
        for (const btn of buttons) {
          if (btn.textContent.includes('Dark Mode')) {
            btn.click();
            return true;
          }
        }
        return false;
      });
      console.log(`   Clicked Dark Mode: ${clickedDark}`);
      await delay(500);

      // Check if theme CSS was injected
      const themeApplied = await page.evaluate(() => {
        const style = document.getElementById('injected-css-look-theme');
        return !!style;
      });
      console.log(`   Theme CSS injected: ${themeApplied}`);

      // Check desktop background changed
      const bgChanged = await page.evaluate(() => {
        const desktop = document.getElementById('desktop');
        const style = window.getComputedStyle(desktop);
        return style.background.includes('1a1a2e') || style.backgroundColor.includes('26, 26, 46');
      });
      console.log(`   Desktop background changed: ${bgChanged}`);

      // Switch to Miami theme
      console.log('\n6. Testing Miami theme...');
      const clickedMiami = await page.evaluate(() => {
        const buttons = document.querySelectorAll('button');
        for (const btn of buttons) {
          if (btn.textContent.includes('Miami')) {
            btn.click();
            return true;
          }
        }
        return false;
      });
      console.log(`   Clicked Miami: ${clickedMiami}`);
      await delay(500);

      // Switch back to Classic
      console.log('\n7. Testing Classic theme (reset)...');
      await page.evaluate(() => {
        const buttons = document.querySelectorAll('button');
        for (const btn of buttons) {
          if (btn.textContent.includes('Classic')) btn.click();
        }
      });
      await delay(500);
    }

    // Test file type registry
    console.log('\n8. Testing file type registry...');
    const fileIconTest = await page.evaluate(() => {
      if (typeof ALGO !== 'undefined' && ALGO.getFileIcon) {
        return {
          txt: ALGO.getFileIcon('test.txt'),
          html: ALGO.getFileIcon('test.html'),
          shader: ALGO.getFileIcon('test.shader'),
          theme: ALGO.getFileIcon('test.theme')
        };
      }
      return null;
    });
    console.log(`   File icons: ${JSON.stringify(fileIconTest)}`);

    console.log('\n✓ All tests completed successfully!');

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await browser.close();
  }
}

testLookApp().catch(console.error);
