// Test Programs menu visibility
const puppeteer = require('puppeteer-core');

async function runTests() {
  console.log('Testing Programs menu visibility...\n');

  const browser = await puppeteer.launch({
    headless: true,
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    args: ['--no-sandbox']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });

  page.on('console', msg => console.log('PAGE:', msg.text()));
  page.on('pageerror', err => console.log('PAGE ERROR:', err.message));

  await page.goto('http://localhost:8080/app', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await new Promise(r => setTimeout(r, 3000));

  // Click start button
  await page.click('#start-btn');
  await new Promise(r => setTimeout(r, 500));
  console.log('Start menu opened');

  // HOVER on Programs item (should now work with JS)
  const programsItem = await page.$('.start-item.has-sub');
  if (programsItem) {
    await programsItem.hover();
    await new Promise(r => setTimeout(r, 500));

    await page.screenshot({ path: '/tmp/debug-programs-hover-fixed.png' });
    console.log('Screenshot saved to /tmp/debug-programs-hover-fixed.png');

    // Check submenu visibility
    const submenuInfo = await page.evaluate(() => {
      const submenu = document.getElementById('programs-menu');
      if (!submenu) return { error: 'submenu not found' };

      const style = window.getComputedStyle(submenu);
      const rect = submenu.getBoundingClientRect();

      return {
        display: style.display,
        position: style.position,
        zIndex: style.zIndex,
        rect: { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height },
        isVisibleNow: rect.width > 0 && rect.height > 0,
        parentHasSubmenuOpen: submenu.parentElement?.classList.contains('submenu-open')
      };
    });
    console.log('Submenu info after HOVER:', JSON.stringify(submenuInfo, null, 2));

    // Hover to a submenu item and click it
    const itemClicked = await page.evaluate(() => {
      const submenu = document.getElementById('programs-menu');
      if (!submenu) return { error: 'submenu not found' };

      const items = submenu.querySelectorAll('.start-item');
      const jsideItem = Array.from(items).find(i => i.textContent.includes('JavaScript.IDE'));
      if (jsideItem) {
        jsideItem.click();
        return { clicked: 'JavaScript.IDE' };
      }
      return { error: 'Item not found' };
    });
    console.log('Item click:', JSON.stringify(itemClicked));

    await new Promise(r => setTimeout(r, 1000));

    // Check if window opened
    const windows = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('.window')).map(w => w.querySelector('.title')?.textContent);
    });
    console.log('Windows:', JSON.stringify(windows));
  }

  await browser.close();
  console.log('\nTests complete');
}

runTests().catch(console.error);
