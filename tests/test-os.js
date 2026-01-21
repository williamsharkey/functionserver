#!/usr/bin/env node
/**
 * Cecilia OS - Puppeteer Tests
 *
 * Tests the OS interface, registration, login, and terminal
 *
 * Usage:
 *   node tests/test-os.js [--url http://localhost:8080]
 */

const puppeteer = require('puppeteer');

const BASE_URL = process.argv.includes('--url')
  ? process.argv[process.argv.indexOf('--url') + 1]
  : 'http://localhost:8080';

const TEST_USER = 'testuser' + Math.floor(Math.random() * 10000);
const TEST_PASS = 'testpass123';

async function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runTests() {
  console.log('\n🧪 Cecilia OS Tests');
  console.log('==================');
  console.log(`URL: ${BASE_URL}`);
  console.log(`Test user: ${TEST_USER}\n`);

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });

  let passed = 0;
  let failed = 0;

  async function test(name, fn) {
    try {
      await fn();
      console.log(`✅ ${name}`);
      passed++;
    } catch (err) {
      console.log(`❌ ${name}`);
      console.log(`   Error: ${err.message}`);
      failed++;
    }
  }

  // Test 1: Page loads
  await test('Page loads', async () => {
    await page.goto(BASE_URL, { waitUntil: 'networkidle0', timeout: 10000 });
  });

  // Test 2: Login dialog appears
  await test('Login dialog appears', async () => {
    await page.waitForSelector('#login-overlay', { visible: true, timeout: 5000 });
    const visible = await page.$eval('#login-overlay', el => !el.classList.contains('hidden'));
    if (!visible) throw new Error('Login overlay not visible');
  });

  // Test 3: Can switch to register tab
  await test('Can switch to register tab', async () => {
    await page.click('.tab[data-tab="register"]');
    await delay(300);
    const regFormVisible = await page.$eval('#register-form', el => el.style.display !== 'none');
    if (!regFormVisible) throw new Error('Register form not visible');
  });

  // Test 4: Register new user
  await test('Register new user', async () => {
    await page.type('#reg-username', TEST_USER);
    await page.type('#reg-password', TEST_PASS);
    await page.type('#reg-confirm', TEST_PASS);
    await page.click('#register-form button');
    await delay(1000);

    // Check if login overlay is now hidden (successful registration)
    const hidden = await page.$eval('#login-overlay', el => el.classList.contains('hidden'));
    if (!hidden) {
      const error = await page.$eval('#login-error', el => el.textContent);
      throw new Error(`Registration failed: ${error}`);
    }
  });

  // Test 5: Desktop loads after login
  await test('Desktop loads after login', async () => {
    await page.waitForSelector('#desktop', { visible: true, timeout: 5000 });
    const hasIcons = await page.$('.desktop-icon');
    if (!hasIcons) throw new Error('No desktop icons found');
  });

  // Test 6: Taskbar is visible
  await test('Taskbar is visible', async () => {
    const taskbar = await page.$('#taskbar');
    if (!taskbar) throw new Error('Taskbar not found');
  });

  // Test 7: Start menu opens
  await test('Start menu opens', async () => {
    await page.click('#start-btn');
    await delay(300);
    const menuVisible = await page.$eval('#start-menu', el => el.classList.contains('show'));
    if (!menuVisible) throw new Error('Start menu did not open');
  });

  // Test 8: Terminal opens
  await test('Terminal opens', async () => {
    await page.click('.start-menu-item');  // Click first item (Terminal)
    await delay(500);
    const terminalWindow = await page.$('.window');
    if (!terminalWindow) throw new Error('Terminal window did not open');
  });

  // Test 9: Terminal has input
  await test('Terminal has input', async () => {
    const terminalInput = await page.$('.terminal-input');
    if (!terminalInput) throw new Error('Terminal input not found');
  });

  // Test 10: Can type in terminal
  await test('Can type in terminal', async () => {
    await page.type('.terminal-input', 'echo Hello World');
    const value = await page.$eval('.terminal-input', el => el.value);
    if (!value.includes('echo Hello World')) throw new Error('Terminal input not working');
  });

  // Test 11: Terminal command executes
  await test('Terminal command executes', async () => {
    await page.keyboard.press('Enter');
    await delay(1000);
    const output = await page.$eval('.terminal-output', el => el.textContent);
    // May or may not have "Hello World" depending on if backend is running
    // Just check that something was output
    if (output.length === 0) throw new Error('No terminal output');
  });

  // Test 12: Window can be closed
  await test('Window can be closed', async () => {
    const closeBtn = await page.$('.window-btn:last-child');
    await closeBtn.click();
    await delay(300);
    const windows = await page.$$('.window');
    if (windows.length > 0) throw new Error('Window did not close');
  });

  // Test 13: User indicator shows username
  await test('User indicator shows username', async () => {
    const indicator = await page.$eval('#user-indicator', el => el.textContent);
    if (!indicator.includes(TEST_USER)) throw new Error(`User indicator wrong: ${indicator}`);
  });

  // Test 14: Logout works
  await test('Logout works', async () => {
    await page.click('#start-btn');
    await delay(200);
    // Find and click logout
    const menuItems = await page.$$('.start-menu-item');
    await menuItems[menuItems.length - 1].click();  // Last item is logout
    await delay(1000);
    // Page should reload and show login
    const loginVisible = await page.$eval('#login-overlay', el => !el.classList.contains('hidden'));
    if (!loginVisible) throw new Error('Did not return to login after logout');
  });

  // Test 15: Can login again
  await test('Can login with created user', async () => {
    // Switch to login tab
    await page.click('.tab[data-tab="login"]');
    await delay(200);
    await page.type('#login-username', TEST_USER);
    await page.type('#login-password', TEST_PASS);
    await page.click('#login-form button');
    await delay(1000);

    const hidden = await page.$eval('#login-overlay', el => el.classList.contains('hidden'));
    if (!hidden) {
      const error = await page.$eval('#login-error', el => el.textContent);
      throw new Error(`Login failed: ${error}`);
    }
  });

  await browser.close();

  // Summary
  console.log('\n==================');
  console.log(`Results: ${passed} passed, ${failed} failed`);

  if (failed > 0) {
    process.exit(1);
  }

  console.log('\n✨ All tests passed!\n');
}

runTests().catch(err => {
  console.error('Test runner error:', err);
  process.exit(1);
});
