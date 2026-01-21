/**
 * Capture screenshots of Function Server for the landing page
 *
 * Run: node capture-screenshots.js [server-url]
 * Default: http://146.190.210.18
 */

const puppeteer = require('puppeteer');
const http = require('http');
const path = require('path');

const SERVER_URL = process.argv[2] || 'http://146.190.210.18';
const SCREENSHOTS_DIR = path.join(__dirname, 'screenshots');

function fetchHTML(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let html = '';
      res.on('data', chunk => html += chunk);
      res.on('end', () => resolve(html));
    }).on('error', reject);
  });
}

async function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function captureScreenshots() {
  console.log(`Capturing screenshots from ${SERVER_URL}`);

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });

  try {
    // Fetch and render the HTML
    console.log('1. Fetching HTML...');
    const html = await fetchHTML(SERVER_URL);

    console.log('2. Rendering login screen...');
    await page.setContent(html, { waitUntil: 'domcontentloaded' });
    await delay(1000);
    await page.screenshot({
      path: path.join(SCREENSHOTS_DIR, 'login.png')
    });
    console.log('   - login.png');

    // Simulate clicking "Create Account" by evaluating JS
    console.log('3. Capturing register screen...');
    await page.evaluate(() => {
      const link = document.querySelector('a[href="#"], button');
      if (link && link.textContent.includes('Create')) link.click();
    });
    await delay(500);
    await page.screenshot({
      path: path.join(SCREENSHOTS_DIR, 'register.png')
    });
    console.log('   - register.png');

    // Simulate registration - just show the form state
    console.log('4. Simulating user registration...');
    await page.evaluate(() => {
      const inputs = document.querySelectorAll('input[type="text"], input[type="password"]');
      if (inputs[0]) inputs[0].value = 'demouser';
      if (inputs[1]) inputs[1].value = '••••••••';
    });
    await delay(300);

    // Simulate logged-in state by modifying the DOM
    console.log('5. Showing desktop state...');
    await page.evaluate(() => {
      // Hide login dialog if present
      const dialog = document.querySelector('.login-dialog, #login, .window');
      if (dialog) dialog.style.display = 'none';

      // Make sure desktop is visible
      const desktop = document.querySelector('#desktop');
      if (desktop) desktop.style.display = 'block';
    });
    await delay(500);
    await page.screenshot({
      path: path.join(SCREENSHOTS_DIR, 'desktop.png')
    });
    console.log('   - desktop.png');

    // Show a terminal window
    console.log('6. Adding terminal window...');
    await page.evaluate(() => {
      // Create a mock terminal window
      const desktop = document.querySelector('#desktop');
      if (!desktop) return;

      const terminalHTML = `
        <div class="window" style="position: absolute; top: 50px; left: 100px; width: 600px; height: 400px; background: #c0c0c0; border: 2px outset #fff; z-index: 100;">
          <div style="background: linear-gradient(90deg, #000080, #1084d0); color: white; padding: 4px 8px; display: flex; justify-content: space-between; align-items: center;">
            <span>💻 Terminal</span>
            <div>
              <button style="width: 16px; height: 14px; font-size: 10px;">_</button>
              <button style="width: 16px; height: 14px; font-size: 10px;">□</button>
              <button style="width: 16px; height: 14px; font-size: 10px;">×</button>
            </div>
          </div>
          <div style="background: #1a1a2e; color: #00ff00; padding: 12px; height: calc(100% - 28px); font-family: monospace; font-size: 13px; overflow: auto;">
            <div style="color: #00d4aa;">demouser@functionserver:~$</div>
            <div style="color: #fff; margin-bottom: 8px;">ls -la</div>
            <div style="color: #888;">total 8</div>
            <div style="color: #888;">drwxr-xr-x  3 demouser demouser 4096 Jan 21 10:00 .</div>
            <div style="color: #888;">drwxr-xr-x  5 root     root     4096 Jan 21 10:00 ..</div>
            <div style="color: #00d4aa; margin-top: 8px;">demouser@functionserver:~$</div>
            <div style="color: #fff;">git clone https://github.com/example/project.git</div>
            <div style="color: #888;">Cloning into 'project'...</div>
            <div style="color: #888;">remote: Enumerating objects: 156, done.</div>
            <div style="color: #888;">remote: Counting objects: 100% (156/156), done.</div>
            <div style="color: #888;">Receiving objects: 100% (156/156), 45.2 KiB, done.</div>
            <div style="color: #00d4aa; margin-top: 8px;">demouser@functionserver:~$</div>
            <span style="color: #fff; animation: blink 1s infinite;">_</span>
          </div>
        </div>
      `;
      desktop.insertAdjacentHTML('beforeend', terminalHTML);
    });
    await delay(500);
    await page.screenshot({
      path: path.join(SCREENSHOTS_DIR, 'terminal.png')
    });
    console.log('   - terminal.png');

    console.log('\nScreenshots saved to:', SCREENSHOTS_DIR);

  } catch (error) {
    console.error('Error capturing screenshots:', error);
  } finally {
    await browser.close();
  }
}

// Create install terminal mockup
async function captureInstallTerminal() {
  console.log('Creating install terminal mockup...');

  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  await page.setViewport({ width: 800, height: 500 });

  await page.setContent(`
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body {
          margin: 0;
          padding: 20px;
          background: #1a1a2e;
          font-family: 'SF Mono', Monaco, 'Courier New', monospace;
          font-size: 14px;
          line-height: 1.5;
          color: #e0e0e0;
        }
        .prompt { color: #00d4aa; }
        .command { color: #fff; }
        .output { color: #888; }
        .success { color: #00d4aa; }
        .highlight { color: #ffd700; }
      </style>
    </head>
    <body>
      <div>
        <span class="prompt">root@droplet:~$ </span>
        <span class="command">curl -fsSL https://functionserver.com/install | bash</span>
      </div>
      <br>
      <div class="output" style="color: #00d4aa; white-space: pre;">  ___              _   _            ___
 | __|  _ _ _  __ | |_(_)___ _ _   / __| ___ _ ___ _____ _ _
 | _| || | ' \\/ _||  _| / _ \\ ' \\  \\__ \\/ -_) '_\\ V / -_) '_|
 |_| \\_,_|_||_\\__| \\__|_\\___/_||_| |___/\\___|_|  \\_/\\___|_|</div>
      <br>
      <div class="output">Installing <span class="success">Function Server</span> ⚡</div>
      <div class="output">Platform: <span class="highlight">linux</span> (ubuntu)</div>
      <br>
      <div class="output">Checking dependencies...</div>
      <div class="success">Go already installed: go version go1.22.2 linux/amd64</div>
      <div class="output">Setting up /opt/functionserver...</div>
      <div class="output">Downloading Function Server...</div>
      <div class="output">Building...</div>
      <div class="output">Creating systemd service...</div>
      <br>
      <div class="success">════════════════════════════════════════════════════════════</div>
      <div class="success">  ⚡ Function Server installed successfully!</div>
      <div class="success">════════════════════════════════════════════════════════════</div>
      <br>
      <div class="output">  Start the server:</div>
      <div class="highlight">    sudo systemctl start functionserver</div>
      <br>
      <div class="output">  Access your server at:</div>
      <div class="highlight">    http://146.190.210.18</div>
    </body>
    </html>
  `);

  await page.screenshot({
    path: path.join(SCREENSHOTS_DIR, 'install-terminal.png')
  });
  console.log('   - install-terminal.png');

  await browser.close();
}

async function main() {
  await captureInstallTerminal();
  await captureScreenshots();
}

main().catch(console.error);
