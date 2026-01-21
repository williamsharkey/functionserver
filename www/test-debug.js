// Debug test for counter app and programs menu
const puppeteer = require('puppeteer-core');

async function runTests() {
  console.log('Starting debug tests...\n');

  const browser = await puppeteer.launch({
    headless: true,
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    args: ['--no-sandbox']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });

  // Enable console logging from the page
  page.on('console', msg => console.log('PAGE:', msg.text()));
  page.on('pageerror', err => console.log('PAGE ERROR:', err.message));

  console.log('Navigating to localhost:8080/app...');
  await page.goto('http://localhost:8080/app', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await new Promise(r => setTimeout(r, 3000));

  // Check auto-guest
  const overlayHidden = await page.evaluate(() => {
    return document.getElementById('login-overlay')?.classList.contains('hidden');
  });
  console.log('Login overlay hidden (auto-guest):', overlayHidden);

  // Test 1: Counter App via JS.IDE
  console.log('\n=== TEST: Counter App ===');

  // Check desktop icons
  const desktopIcons = await page.evaluate(() => {
    const icons = document.querySelectorAll('.desktop-icon');
    return Array.from(icons).map(i => ({
      id: i.id,
      text: i.querySelector('span')?.textContent || 'no text'
    }));
  });
  console.log('Desktop icons:', JSON.stringify(desktopIcons.slice(0, 5)));

  // Try to find and open JavaScript.IDE
  const ideOpened = await page.evaluate(() => {
    // Find the jsIDE icon
    const icon = document.getElementById('icon-jsIDE');
    if (!icon) return { error: 'icon-jsIDE not found', icons: Array.from(document.querySelectorAll('.desktop-icon')).map(i => i.id) };

    // Simulate double-click
    const event = new MouseEvent('dblclick', { bubbles: true, cancelable: true });
    icon.dispatchEvent(event);
    return { success: true, iconId: icon.id };
  });
  console.log('IDE opened:', JSON.stringify(ideOpened));

  await new Promise(r => setTimeout(r, 1500));
  await page.screenshot({ path: '/tmp/debug-ide-opened.png' });
  console.log('Screenshot saved to /tmp/debug-ide-opened.png');

  // Check windows
  const windows = await page.evaluate(() => {
    const wins = document.querySelectorAll('.window');
    return Array.from(wins).map(w => ({
      id: w.id,
      title: w.querySelector('.title')?.textContent
    }));
  });
  console.log('Windows:', JSON.stringify(windows));

  // Find the IDE window and its select
  const ideWindow = await page.evaluate(() => {
    const wins = Array.from(document.querySelectorAll('.window'));
    const ideWin = wins.find(w => {
      const title = w.querySelector('.title')?.textContent || '';
      return title.includes('JavaScript.IDE') || title.includes('Untitled');
    });
    if (!ideWin) return { error: 'IDE window not found' };

    // Find select in IDE
    const select = ideWin.querySelector('select');
    if (!select) return { error: 'Select not found in IDE window', windowHTML: ideWin.innerHTML.substring(0, 500) };

    return {
      found: true,
      optionCount: select.options.length,
      options: Array.from(select.options).map(o => ({ value: o.value, text: o.text }))
    };
  });
  console.log('IDE window/select:', JSON.stringify(ideWindow, null, 2));

  if (ideWindow.found) {
    // Load Counter example
    const counterLoaded = await page.evaluate(() => {
      const wins = Array.from(document.querySelectorAll('.window'));
      const ideWin = wins.find(w => {
        const title = w.querySelector('.title')?.textContent || '';
        return title.includes('JavaScript.IDE') || title.includes('Untitled');
      });
      if (!ideWin) return { error: 'IDE window not found' };

      const select = ideWin.querySelector('select');
      if (!select) return { error: 'Select not found' };

      // Find counter option
      const counterOpt = Array.from(select.options).find(o => o.value === 'counter');
      if (!counterOpt) return { error: 'Counter option not found', options: Array.from(select.options).map(o => o.value) };

      select.value = 'counter';
      select.dispatchEvent(new Event('change', { bubbles: true }));
      return { loaded: true };
    });
    console.log('Counter loaded:', JSON.stringify(counterLoaded));

    await new Promise(r => setTimeout(r, 500));

    // Click Run button
    const runClicked = await page.evaluate(() => {
      const wins = Array.from(document.querySelectorAll('.window'));
      const ideWin = wins.find(w => {
        const title = w.querySelector('.title')?.textContent || '';
        return title.includes('JavaScript.IDE') || title.includes('Untitled');
      });
      if (!ideWin) return { error: 'IDE window not found' };

      const runBtn = ideWin.querySelector('button');
      if (runBtn && runBtn.textContent.includes('Run')) {
        runBtn.click();
        return { clicked: true };
      }
      return { error: 'Run button not found' };
    });
    console.log('Run clicked:', JSON.stringify(runClicked));

    await new Promise(r => setTimeout(r, 1500));
    await page.screenshot({ path: '/tmp/debug-counter-running.png' });
    console.log('Screenshot saved to /tmp/debug-counter-running.png');

    // Test Counter buttons
    const counterTest = await page.evaluate(() => {
      const wins = Array.from(document.querySelectorAll('.window'));
      const counterWin = wins.find(w => {
        const title = w.querySelector('.title')?.textContent || '';
        return title.includes('Counter');
      });
      if (!counterWin) return { error: 'Counter window not found', windows: wins.map(w => w.querySelector('.title')?.textContent) };

      const display = counterWin.querySelector('#counter-display');
      const initialValue = display?.textContent.trim();

      // Find and click + button
      const buttons = counterWin.querySelectorAll('button');
      const plusBtn = Array.from(buttons).find(b => b.textContent.trim() === '+');
      if (!plusBtn) return { error: '+ button not found' };

      plusBtn.click();
      const afterPlus = display?.textContent.trim();

      // Click - button
      const minusBtn = Array.from(buttons).find(b => b.textContent.trim() === '-');
      if (minusBtn) minusBtn.click();
      const afterMinus = display?.textContent.trim();

      return {
        found: true,
        initialValue,
        afterPlus,
        afterMinus,
        buttonOnclicks: Array.from(buttons).map(b => b.getAttribute('onclick'))
      };
    });
    console.log('Counter test:', JSON.stringify(counterTest, null, 2));
  }

  await browser.close();
  console.log('\n=== Tests complete ===');
  console.log('Check screenshots in /tmp/debug-*.png');
}

runTests().catch(console.error);
