/**
 * Test Programs folder visibility in Start Menu
 */

const puppeteer = require('puppeteer');

const SERVER_URL = process.argv[2] || 'http://146.190.210.18';

async function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function testProgramsMenu() {
  console.log(`Testing Programs Menu at ${SERVER_URL}/app\n`);

  const browser = await puppeteer.launch({
    headless: false,
    args: [
      '--no-sandbox',
      '--window-size=1400,900',
      '--allow-insecure-localhost',
      '--disable-web-security',
      '--allow-running-insecure-content',
      '--ignore-certificate-errors'
    ]
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 900 });

  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  page.on('pageerror', err => console.log('PAGE ERROR:', err.message));

  const fs = require('fs');
  const path = require('path');
  const screenshotsDir = path.join(__dirname, 'test-screenshots');
  if (!fs.existsSync(screenshotsDir)) {
    fs.mkdirSync(screenshotsDir, { recursive: true });
  }

  try {
    console.log('1. Loading app...');
    await page.goto(`${SERVER_URL}/app`, { waitUntil: 'networkidle2' });
    await delay(2000);

    // Check if we need to login
    const needsLogin = await page.evaluate(() => {
      return !!document.getElementById('login-overlay')?.offsetParent;
    });

    if (needsLogin) {
      console.log('2. Logging in...');
      // Try to register/login
      const testUser = 'testuser' + Date.now().toString().slice(-6);

      // Click create account link if exists
      await page.evaluate(() => {
        const link = document.querySelector('a[onclick*="showRegister"], span[onclick*="showRegister"]');
        if (link) link.click();
      });
      await delay(500);

      // Fill in registration
      await page.evaluate((user) => {
        const usernameInput = document.getElementById('reg-username');
        const passwordInput = document.getElementById('reg-password');
        if (usernameInput && passwordInput) {
          usernameInput.value = user;
          passwordInput.value = 'testpass123';
        }
      }, testUser);

      // Click register button
      await page.evaluate(() => {
        const btn = document.querySelector('#register-form button[type="submit"], #register-form button');
        if (btn) btn.click();
      });
      await delay(2000);
    }

    await page.screenshot({ path: 'test-screenshots/prog-01-desktop.png' });
    console.log('   Screenshot: prog-01-desktop.png');

    // Click Start button
    console.log('\n3. Clicking Start button...');
    await page.evaluate(() => {
      const startBtn = document.getElementById('start-btn');
      if (startBtn) startBtn.click();
    });
    await delay(500);

    await page.screenshot({ path: 'test-screenshots/prog-02-start-menu.png' });
    console.log('   Screenshot: prog-02-start-menu.png');

    // Check start menu visibility
    const startMenuState = await page.evaluate(() => {
      const menu = document.getElementById('start-menu');
      const computed = window.getComputedStyle(menu);
      return {
        display: computed.display,
        visibility: computed.visibility,
        hasVisibleClass: menu.classList.contains('visible'),
        rect: menu.getBoundingClientRect(),
        items: Array.from(menu.querySelectorAll('.start-item')).slice(0, 5).map(i => i.textContent.trim())
      };
    });
    console.log('   Start menu state:', JSON.stringify(startMenuState, null, 2));

    // Find and hover over Programs item
    console.log('\n4. Looking for Programs folder...');
    const programsItem = await page.evaluate(() => {
      const items = Array.from(document.querySelectorAll('.start-item'));
      const prog = items.find(i => i.textContent.includes('Programs'));
      if (prog) {
        const rect = prog.getBoundingClientRect();
        return {
          found: true,
          text: prog.textContent.trim(),
          hasSubmenu: !!prog.querySelector('.start-submenu'),
          hasSub: prog.classList.contains('has-sub'),
          rect: rect
        };
      }
      return { found: false };
    });
    console.log('   Programs item:', JSON.stringify(programsItem, null, 2));

    if (programsItem.found) {
      // Hover over Programs to show submenu
      console.log('\n5. Hovering over Programs...');
      await page.mouse.move(programsItem.rect.x + 50, programsItem.rect.y + 10);
      await delay(500);

      await page.screenshot({ path: 'test-screenshots/prog-03-hover-programs.png' });
      console.log('   Screenshot: prog-03-hover-programs.png');

      // Check submenu visibility
      const submenuState = await page.evaluate(() => {
        const submenu = document.getElementById('programs-menu');
        if (!submenu) return { error: 'submenu not found' };

        const computed = window.getComputedStyle(submenu);
        const rect = submenu.getBoundingClientRect();

        // Check parent hover state
        const parent = submenu.closest('.start-item');
        const parentHovered = parent?.matches(':hover');

        return {
          display: computed.display,
          visibility: computed.visibility,
          position: computed.position,
          left: computed.left,
          top: computed.top,
          zIndex: computed.zIndex,
          rect: rect,
          isOnScreen: rect.left >= 0 && rect.right <= window.innerWidth,
          parentHovered: parentHovered,
          items: Array.from(submenu.querySelectorAll('.start-item')).slice(0, 5).map(i => i.textContent.trim())
        };
      });
      console.log('   Submenu state:', JSON.stringify(submenuState, null, 2));

      // Try clicking on Programs
      console.log('\n6. Clicking Programs item...');
      await page.click('.start-item.has-sub');
      await delay(500);

      await page.screenshot({ path: 'test-screenshots/prog-04-clicked-programs.png' });
      console.log('   Screenshot: prog-04-clicked-programs.png');

      const afterClickState = await page.evaluate(() => {
        const submenu = document.getElementById('programs-menu');
        if (!submenu) return { error: 'submenu not found' };
        const computed = window.getComputedStyle(submenu);
        return {
          display: computed.display,
          visibility: computed.visibility
        };
      });
      console.log('   After click state:', JSON.stringify(afterClickState, null, 2));
    }

    // Test with touch simulation for mobile
    console.log('\n7. Testing touch behavior...');
    await page.evaluate(() => {
      document.getElementById('start-btn')?.click();
    });
    await delay(300);

    // Touch the Programs item
    const touchResult = await page.evaluate(() => {
      const items = Array.from(document.querySelectorAll('.start-item'));
      const prog = items.find(i => i.textContent.includes('Programs'));
      if (prog) {
        // Simulate touch
        const touch = new Touch({
          identifier: 1,
          target: prog,
          clientX: prog.getBoundingClientRect().x + 50,
          clientY: prog.getBoundingClientRect().y + 10
        });
        prog.dispatchEvent(new TouchEvent('touchstart', { touches: [touch], bubbles: true }));
        prog.dispatchEvent(new TouchEvent('touchend', { touches: [], bubbles: true }));
        return 'touched';
      }
      return 'not found';
    });
    console.log('   Touch result:', touchResult);

    await delay(500);
    await page.screenshot({ path: 'test-screenshots/prog-05-after-touch.png' });
    console.log('   Screenshot: prog-05-after-touch.png');

    console.log('\n8. Final analysis...');
    const finalAnalysis = await page.evaluate(() => {
      const submenu = document.getElementById('programs-menu');
      const style = submenu ? window.getComputedStyle(submenu) : null;
      return {
        submenuExists: !!submenu,
        submenuDisplay: style?.display,
        submenuMaxHeight: style?.maxHeight,
        submenuOverflow: style?.overflow,
        documentWidth: document.documentElement.clientWidth,
        documentHeight: document.documentElement.clientHeight
      };
    });
    console.log('   Final analysis:', JSON.stringify(finalAnalysis, null, 2));

    console.log('\nTest complete. Check test-screenshots/prog-*.png files.');
    console.log('\nKeeping browser open for 30 seconds for manual inspection...');
    await delay(30000);

  } catch (error) {
    console.error('Error:', error);
    await page.screenshot({ path: 'test-screenshots/prog-error.png' });
  } finally {
    await browser.close();
  }
}

testProgramsMenu().catch(console.error);
