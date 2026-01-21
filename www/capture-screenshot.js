// Capture marketing screenshots
const puppeteer = require('puppeteer-core');

async function capture() {
  console.log('Capturing screenshots...\n');

  const browser = await puppeteer.launch({
    headless: true,
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    args: ['--no-sandbox']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  await page.goto('http://localhost:8080/app', { waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 3000));

  // Screenshot 1: Desktop with Programs menu
  await page.click('#start-btn');
  await new Promise(r => setTimeout(r, 500));
  const programsItem = await page.$('.start-item.has-sub');
  if (programsItem) await programsItem.hover();
  await new Promise(r => setTimeout(r, 500));
  await page.screenshot({ path: 'screenshots/hero-desktop.png' });
  console.log('Saved: screenshots/hero-desktop.png');

  // Close menu
  await page.click('#desktop');
  await new Promise(r => setTimeout(r, 300));

  // Screenshot 2: IDE with app running
  await page.evaluate(() => {
    const icon = document.getElementById('icon-jsIDE');
    if (icon) icon.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
  });
  await new Promise(r => setTimeout(r, 1500));

  // Load and run calculator
  await page.evaluate(() => {
    const wins = Array.from(document.querySelectorAll('.window'));
    const ideWin = wins.find(w => w.querySelector('.title')?.textContent.includes('JavaScript.IDE'));
    if (ideWin) {
      const select = ideWin.querySelector('select');
      if (select) {
        select.value = 'calculator';
        select.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }
  });
  await new Promise(r => setTimeout(r, 500));

  await page.evaluate(() => {
    const wins = Array.from(document.querySelectorAll('.window'));
    const ideWin = wins.find(w => w.querySelector('.title')?.textContent.includes('JavaScript.IDE'));
    if (ideWin) {
      const runBtn = ideWin.querySelector('button');
      if (runBtn) runBtn.click();
    }
  });
  await new Promise(r => setTimeout(r, 1500));

  await page.screenshot({ path: 'screenshots/ide-app.png' });
  console.log('Saved: screenshots/ide-app.png');

  // Screenshot 3: Multiple apps open
  // Open Shade Station
  await page.evaluate(() => {
    const submenu = document.getElementById('programs-menu');
    const item = submenu?.querySelector('.start-item[onclick*="shade-station"]');
    if (item) item.click();
  });
  await new Promise(r => setTimeout(r, 500));

  // Actually let's open it via runApp
  await page.evaluate(() => {
    if (window.systemApps) {
      const shadeStation = window.systemApps.find(a => a.id === 'shade-station');
      if (shadeStation) window.runApp(shadeStation);
    }
  });
  await new Promise(r => setTimeout(r, 1000));

  await page.screenshot({ path: 'screenshots/multi-app.png' });
  console.log('Saved: screenshots/multi-app.png');

  await browser.close();
  console.log('\nDone!');
}

capture().catch(console.error);
