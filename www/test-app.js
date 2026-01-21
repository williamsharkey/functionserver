/**
 * Test Function Server OS functionality
 */

const puppeteer = require('puppeteer');

const SERVER_URL = process.argv[2] || 'http://146.190.210.18';

async function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function testApp() {
  console.log(`Testing Function Server at ${SERVER_URL}/app\n`);

  const browser = await puppeteer.launch({
    headless: false, // Show browser for debugging
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

  // Enable console logging from the page
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  page.on('pageerror', err => console.log('PAGE ERROR:', err.message));

  try {
    console.log('1. Loading app...');
    await page.goto(`${SERVER_URL}/app`, { waitUntil: 'networkidle2' });
    await delay(1000);

    // Take screenshot of initial state
    await page.screenshot({ path: 'test-screenshots/01-initial.png' });
    console.log('   Screenshot: 01-initial.png');

    // Check what's on the page
    const pageContent = await page.evaluate(() => {
      return {
        title: document.title,
        hasLoginDialog: !!document.querySelector('.window, .dialog, [class*="login"]'),
        hasDesktop: !!document.querySelector('#desktop'),
        buttons: Array.from(document.querySelectorAll('button')).map(b => b.textContent.trim()),
        inputs: Array.from(document.querySelectorAll('input')).map(i => ({ type: i.type, placeholder: i.placeholder })),
        windowTitles: Array.from(document.querySelectorAll('.title-bar, .window-title, [class*="title"]')).map(t => t.textContent.trim())
      };
    });
    console.log('   Page state:', JSON.stringify(pageContent, null, 2));

    // Try to register a test user
    console.log('\n2. Attempting registration...');

    // Look for register/create account link or button
    const hasRegisterLink = await page.evaluate(() => {
      const links = Array.from(document.querySelectorAll('a, button, span'));
      const registerLink = links.find(el =>
        el.textContent.toLowerCase().includes('register') ||
        el.textContent.toLowerCase().includes('create') ||
        el.textContent.toLowerCase().includes('sign up')
      );
      if (registerLink) {
        registerLink.click();
        return true;
      }
      return false;
    });

    if (hasRegisterLink) {
      console.log('   Clicked register link');
      await delay(500);
      await page.screenshot({ path: 'test-screenshots/02-register-form.png' });
    }

    // Fill in registration form
    const usernameInput = await page.$('input[type="text"], input[name="username"], input[placeholder*="user"]');
    const passwordInput = await page.$('input[type="password"]');

    if (usernameInput && passwordInput) {
      const testUser = 'testuser' + Date.now().toString().slice(-4);
      console.log(`   Registering user: ${testUser}`);

      await usernameInput.type(testUser);
      await passwordInput.type('testpass123');

      await page.screenshot({ path: 'test-screenshots/03-filled-form.png' });

      // Click register/submit button
      const submitted = await page.evaluate(() => {
        const btns = Array.from(document.querySelectorAll('button'));
        const registerBtn = btns.find(b =>
          b.textContent.toLowerCase().includes('register') ||
          b.textContent.toLowerCase().includes('create') ||
          b.textContent.toLowerCase().includes('sign up') ||
          b.textContent.toLowerCase().includes('submit')
        );
        if (registerBtn) {
          registerBtn.click();
          return registerBtn.textContent;
        }
        return null;
      });

      if (submitted) {
        console.log(`   Clicked: "${submitted}"`);
        await delay(2000);
        await page.screenshot({ path: 'test-screenshots/04-after-register.png' });
      }
    }

    // Check if we're logged in / see desktop
    console.log('\n3. Checking desktop state...');
    await delay(1000);

    const desktopState = await page.evaluate(() => {
      return {
        icons: Array.from(document.querySelectorAll('[class*="icon"], .desktop-icon')).map(i => i.textContent.trim()),
        windows: Array.from(document.querySelectorAll('.window')).length,
        taskbar: !!document.querySelector('[class*="taskbar"], [class*="start"]'),
      };
    });
    console.log('   Desktop state:', JSON.stringify(desktopState, null, 2));

    await page.screenshot({ path: 'test-screenshots/05-desktop.png' });

    // Try clicking Terminal icon
    console.log('\n4. Opening Terminal...');
    const clickedTerminal = await page.evaluate(() => {
      const icons = Array.from(document.querySelectorAll('[class*="icon"], .desktop-icon, div'));
      const terminal = icons.find(i =>
        i.textContent.includes('Terminal') ||
        i.textContent.includes('💻')
      );
      if (terminal) {
        terminal.click();
        return true;
      }
      return false;
    });

    if (clickedTerminal) {
      console.log('   Clicked terminal icon');
      await delay(1000);
      await page.screenshot({ path: 'test-screenshots/06-terminal-open.png' });

      // Try typing a command
      console.log('\n5. Testing terminal input...');
      const terminalInput = await page.$('input[class*="terminal"], input[type="text"]:last-of-type, .terminal input');
      if (terminalInput) {
        await terminalInput.type('ls -la');
        await terminalInput.press('Enter');
        await delay(1000);
        await page.screenshot({ path: 'test-screenshots/07-terminal-command.png' });

        // Check output
        const terminalOutput = await page.evaluate(() => {
          const outputs = document.querySelectorAll('.terminal-output, .output, pre, [class*="output"]');
          return Array.from(outputs).map(o => o.textContent).join('\n');
        });
        console.log('   Terminal output:', terminalOutput.slice(0, 200));
      } else {
        console.log('   No terminal input found');
      }
    }

    // Try Files
    console.log('\n6. Opening Files...');
    const clickedFiles = await page.evaluate(() => {
      const icons = Array.from(document.querySelectorAll('[class*="icon"], .desktop-icon, div'));
      const files = icons.find(i =>
        i.textContent.includes('Files') ||
        i.textContent.includes('📁')
      );
      if (files) {
        files.click();
        return true;
      }
      return false;
    });

    if (clickedFiles) {
      await delay(1000);
      await page.screenshot({ path: 'test-screenshots/08-files-open.png' });
    }

    console.log('\n7. Final state...');
    await page.screenshot({ path: 'test-screenshots/09-final.png' });

    // Network requests made
    console.log('\nTest complete. Check test-screenshots/ folder.');

  } catch (error) {
    console.error('Error:', error);
    await page.screenshot({ path: 'test-screenshots/error.png' });
  } finally {
    console.log('\nKeeping browser open for 60 seconds for manual inspection...');
    await delay(60000); // Keep browser open to inspect
    await browser.close();
  }
}

// Create screenshots dir
const fs = require('fs');
const path = require('path');
const screenshotsDir = path.join(__dirname, 'test-screenshots');
if (!fs.existsSync(screenshotsDir)) {
  fs.mkdirSync(screenshotsDir, { recursive: true });
}

testApp().catch(console.error);
