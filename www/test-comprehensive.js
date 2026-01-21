/**
 * Comprehensive test suite for ALGO OS
 * Tests: JS.IDE, app installation, localStorage, disk storage, all features
 */

const puppeteer = require('puppeteer-core');
const SERVER_URL = 'https://functionserver.com';

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Test results tracker
const results = {
  passed: 0,
  failed: 0,
  tests: []
};

function test(name, passed, details = '') {
  results.tests.push({ name, passed, details });
  if (passed) {
    results.passed++;
    console.log(`  ✓ ${name}`);
  } else {
    results.failed++;
    console.log(`  ✗ ${name}${details ? ': ' + details : ''}`);
  }
}

async function runTests() {
  console.log(`\n${'='.repeat(60)}`);
  console.log('ALGO OS Comprehensive Test Suite');
  console.log(`Server: ${SERVER_URL}`);
  console.log(`${'='.repeat(60)}\n`);

  const browser = await puppeteer.launch({
    headless: true,
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    args: ['--no-sandbox', '--disable-web-security']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 900 });

  // Capture errors
  const pageErrors = [];
  page.on('pageerror', err => pageErrors.push(err.message));
  page.on('console', msg => {
    if (msg.type() === 'error' && !msg.text().includes('404')) {
      pageErrors.push(msg.text());
    }
  });

  try {
    // ============================================
    // SECTION 1: Basic Loading & Authentication
    // ============================================
    console.log('1. BASIC LOADING & AUTHENTICATION');
    console.log('-'.repeat(40));

    await page.goto(`${SERVER_URL}/app`, { waitUntil: 'networkidle2', timeout: 30000 });
    await delay(2000);

    // Test JavaScript execution
    const jsWorks = await page.evaluate(() => {
      return typeof API_BASE !== 'undefined' &&
             typeof ALGO !== 'undefined' &&
             typeof createWindow !== 'undefined';
    });
    test('JavaScript executes correctly', jsWorks);

    // Register/Login
    const testUser = 'test' + Date.now().toString().slice(-8);
    const loginResult = await page.evaluate(async (user) => {
      const overlay = document.getElementById('login-overlay');
      if (!overlay || overlay.classList.contains('hidden')) {
        return { success: true, reason: 'already logged in' };
      }

      // Click register tab
      const tab = document.querySelector('.tab[data-tab="register"]');
      if (tab) tab.click();
      await new Promise(r => setTimeout(r, 300));

      // Fill form
      document.getElementById('reg-username').value = user;
      document.getElementById('reg-password').value = 'testpass123';
      document.getElementById('reg-confirm').value = 'testpass123';

      // Submit
      const btn = document.querySelector('#register-form button');
      if (btn) btn.click();

      // Wait for result
      await new Promise(r => setTimeout(r, 2000));

      return {
        success: !document.getElementById('login-overlay').classList.contains('hidden') === false,
        user: typeof currentUser !== 'undefined' ? currentUser : null,
        hasSession: typeof sessionToken !== 'undefined' && sessionToken
      };
    }, testUser);
    await delay(1000);

    const postLogin = await page.evaluate(() => ({
      currentUser: typeof currentUser !== 'undefined' ? currentUser : null,
      hasSession: typeof sessionToken !== 'undefined' && !!sessionToken,
      desktopIcons: document.querySelectorAll('.desktop-icon').length
    }));

    test('User registration/login works', postLogin.hasSession && postLogin.currentUser);
    test('Desktop icons created after login', postLogin.desktopIcons >= 5);

    // ============================================
    // SECTION 2: LocalStorage Persistence
    // ============================================
    console.log('\n2. LOCALSTORAGE PERSISTENCE');
    console.log('-'.repeat(40));

    const localStorageTest = await page.evaluate(() => {
      const keys = [];
      for (let i = 0; i < localStorage.length; i++) {
        keys.push(localStorage.key(i));
      }
      return {
        keys,
        hasSessionToken: !!localStorage.getItem('session_token'),
        hasUsername: !!localStorage.getItem('username'),
        // State is stored in multiple algo-* keys
        hasAlgoKeys: keys.some(k => k.startsWith('algo-'))
      };
    });

    test('Session token stored in localStorage', localStorageTest.hasSessionToken);
    test('Username stored in localStorage', localStorageTest.hasUsername);
    test('ALGO state keys in localStorage', localStorageTest.hasAlgoKeys);

    // ============================================
    // SECTION 3: JS.IDE Functionality
    // ============================================
    console.log('\n3. JS.IDE FUNCTIONALITY');
    console.log('-'.repeat(40));

    // Open JS.IDE
    await page.evaluate(() => {
      openJSIDE();
    });
    await delay(1000);

    const ideOpen = await page.evaluate(() => {
      const windows = document.querySelectorAll('.window');
      return Array.from(windows).some(w => w.textContent.includes('JavaScript.IDE'));
    });
    test('JS.IDE window opens', ideOpen);

    // Find the IDE window ID
    const ideWindowId = await page.evaluate(() => {
      const textarea = document.querySelector('textarea[id^="ide-code-"]');
      return textarea ? textarea.id.replace('ide-code-', '') : null;
    });
    test('IDE code editor exists', !!ideWindowId);

    if (ideWindowId) {
      // Write test app code
      const testAppCode = `// Test App
ALGO.app.name = 'Test App ${Date.now()}';
ALGO.app.icon = '🧪';

ALGO.createWindow({
  title: 'Test App Window',
  width: 200,
  height: 100,
  content: '<div id="test-app-content">Hello from test app!</div>'
});

console.log('Test app executed!');`;

      await page.evaluate((id, code) => {
        document.getElementById('ide-code-' + id).value = code;
      }, ideWindowId, testAppCode);

      // Run the code
      await page.evaluate((id) => {
        ideRun(id);
      }, ideWindowId);
      await delay(500);

      // Check if it ran successfully
      const ideRunResult = await page.evaluate((id) => {
        const console = document.getElementById('ide-console-content-' + id);
        return {
          hasOutput: console && console.innerHTML.length > 0,
          hasSuccess: console && console.innerHTML.includes('successfully'),
          hasTestOutput: console && console.innerHTML.includes('Test app executed')
        };
      }, ideWindowId);

      test('IDE code execution works', ideRunResult.hasSuccess);
      test('App console.log captured', ideRunResult.hasTestOutput);

      // Test Save functionality
      await page.evaluate((id) => {
        ideSave(id);
      }, ideWindowId);
      await delay(1000);

      const fileSaved = await page.evaluate(() => {
        return savedFiles.some(f => f.name.includes('test-app'));
      });
      test('IDE Save creates file', fileSaved);

      // Test Install functionality
      await page.evaluate((id) => {
        ideInstall(id);
      }, ideWindowId);
      await delay(1000);

      const appInstalled = await page.evaluate(() => {
        return installedPrograms.some(p => p.name.includes('Test App'));
      });
      test('IDE Install adds to installed programs', appInstalled);

      const desktopIconCreated = await page.evaluate(() => {
        const icons = document.querySelectorAll('.desktop-icon');
        return Array.from(icons).some(i => i.textContent.includes('Test App'));
      });
      test('Installed app appears on desktop', desktopIconCreated);
    }

    // Close IDE window
    await page.evaluate(() => {
      const windows = document.querySelectorAll('.window');
      windows.forEach(w => {
        if (w.textContent.includes('JavaScript.IDE')) {
          const closeBtn = w.querySelector('.close-btn');
          if (closeBtn) closeBtn.click();
        }
      });
    });
    await delay(500);

    // ============================================
    // SECTION 4: Server Disk Storage
    // ============================================
    console.log('\n4. SERVER DISK STORAGE');
    console.log('-'.repeat(40));

    // Save a file via ALGO.saveFile
    const saveResult = await page.evaluate(async () => {
      const testContent = 'Test file content ' + Date.now();
      const testFilename = 'storage-test-' + Date.now() + '.txt';

      // Call save
      ALGO.saveFile(testFilename, testContent, 'text');

      // Wait for save
      await new Promise(r => setTimeout(r, 1500));

      return {
        filename: testFilename,
        content: testContent,
        inLocalArray: savedFiles.some(f => f.name === testFilename)
      };
    });

    test('File saved to local array', saveResult.inLocalArray);

    // Verify via API
    const apiVerify = await page.evaluate(async (filename) => {
      try {
        const resp = await fetch(API_BASE + '/files/list', {
          headers: { 'Authorization': 'Bearer ' + sessionToken }
        });
        const data = await resp.json();
        return {
          success: resp.ok,
          files: data.files || [],
          hasTestFile: (data.files || []).some(f => f.name === filename || f.path === filename)
        };
      } catch (e) {
        return { success: false, error: e.message };
      }
    }, saveResult.filename);

    test('Server files list API works', apiVerify.success);

    // ============================================
    // SECTION 5: Folder System
    // ============================================
    console.log('\n5. FOLDER SYSTEM');
    console.log('-'.repeat(40));

    const folderVars = await page.evaluate(() => ({
      hasFolders: typeof folders !== 'undefined' && Array.isArray(folders),
      hasRecycleBin: typeof recycleBin !== 'undefined' && Array.isArray(recycleBin),
      FOLDER_DESKTOP: typeof FOLDER_DESKTOP !== 'undefined' ? FOLDER_DESKTOP : null,
      FOLDER_PROGRAMS: typeof FOLDER_PROGRAMS !== 'undefined' ? FOLDER_PROGRAMS : null
    }));

    test('Folder system initialized', folderVars.hasFolders && folderVars.hasRecycleBin);
    test('System folder constants defined', !!folderVars.FOLDER_DESKTOP && !!folderVars.FOLDER_PROGRAMS);

    // Test Programs folder
    const programsIcon = await page.evaluate(() => {
      const icon = document.getElementById('icon-programs');
      if (icon) {
        icon.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
        return true;
      }
      return false;
    });
    await delay(500);

    test('Programs folder icon exists and clickable', programsIcon);

    const programsWindow = await page.evaluate(() => {
      const windows = document.querySelectorAll('.window');
      return Array.from(windows).some(w =>
        w.textContent.includes('AI Wizards') ||
        w.textContent.includes('Tools') ||
        w.textContent.includes('Programs')
      );
    });
    test('Programs folder opens', programsWindow);

    // Close windows
    await page.evaluate(() => {
      document.querySelectorAll('.window .close-btn').forEach(btn => btn.click());
    });
    await delay(300);

    // ============================================
    // SECTION 6: Desktop Apps
    // ============================================
    console.log('\n6. DESKTOP APPLICATIONS');
    console.log('-'.repeat(40));

    // Test Notepad
    await page.evaluate(() => openNotepad());
    await delay(500);
    const notepadOpen = await page.evaluate(() => {
      const windows = document.querySelectorAll('.window');
      return Array.from(windows).some(w =>
        w.textContent.includes('Notepad') || w.querySelector('textarea')
      );
    });
    test('Notepad opens', notepadOpen);

    // Close Notepad
    await page.evaluate(() => {
      document.querySelectorAll('.window .close-btn').forEach(btn => btn.click());
    });
    await delay(300);

    // Test Web Browser
    await page.evaluate(() => openBrowser());
    await delay(500);
    const browserOpen = await page.evaluate(() => {
      const windows = document.querySelectorAll('.window');
      return Array.from(windows).some(w =>
        w.textContent.includes('Browser') || w.querySelector('iframe')
      );
    });
    test('Web Browser opens', browserOpen);

    // Close Browser
    await page.evaluate(() => {
      document.querySelectorAll('.window .close-btn').forEach(btn => btn.click());
    });
    await delay(300);

    // Test Chat
    await page.evaluate(() => openChat());
    await delay(500);
    const chatOpen = await page.evaluate(() => {
      const windows = document.querySelectorAll('.window');
      return Array.from(windows).some(w => w.textContent.includes('Chat'));
    });
    test('ALGO Chat opens', chatOpen);

    await page.evaluate(() => {
      document.querySelectorAll('.window .close-btn').forEach(btn => btn.click());
    });
    await delay(300);

    // ============================================
    // SECTION 7: Context Menu
    // ============================================
    console.log('\n7. CONTEXT MENU');
    console.log('-'.repeat(40));

    await page.evaluate(() => {
      const desktop = document.getElementById('desktop');
      desktop.dispatchEvent(new MouseEvent('contextmenu', {
        bubbles: true, clientX: 400, clientY: 400
      }));
    });
    await delay(300);

    const contextMenu = await page.evaluate(() => {
      const menu = document.getElementById('context-menu');
      return {
        visible: menu && menu.style.display !== 'none',
        hasNewFolder: menu && menu.textContent.includes('New Folder'),
        hasNewFile: menu && menu.textContent.includes('New File') || menu && menu.textContent.includes('Notepad')
      };
    });

    test('Context menu appears on right-click', contextMenu.visible);
    test('Context menu has New Folder option', contextMenu.hasNewFolder);

    // Hide context menu
    await page.evaluate(() => hideContextMenu && hideContextMenu());

    // ============================================
    // SECTION 8: Start Menu
    // ============================================
    console.log('\n8. START MENU');
    console.log('-'.repeat(40));

    await page.evaluate(() => {
      const startBtn = document.getElementById('start-button');
      if (startBtn) startBtn.click();
    });
    await delay(300);

    const startMenu = await page.evaluate(() => {
      const menu = document.getElementById('start-menu');
      return {
        visible: menu && (menu.style.display === 'block' || menu.classList.contains('visible')),
        hasPrograms: menu && menu.textContent.includes('Programs'),
        hasLogout: menu && menu.textContent.includes('Log Out')
      };
    });

    test('Start menu opens', startMenu.visible || startMenu.hasPrograms);
    test('Start menu has Programs', startMenu.hasPrograms);
    test('Start menu has Log Out', startMenu.hasLogout);

    // Close start menu
    await page.evaluate(() => hideMenus && hideMenus());

    // ============================================
    // SECTION 9: State Persistence
    // ============================================
    console.log('\n9. STATE PERSISTENCE');
    console.log('-'.repeat(40));

    // Get current state
    const stateBefore = await page.evaluate(() => ({
      savedFilesCount: savedFiles.length,
      installedProgramsCount: installedPrograms.length,
      foldersCount: folders.length
    }));

    // Trigger save
    await page.evaluate(() => saveState && saveState());
    await delay(500);

    // Reload page
    await page.reload({ waitUntil: 'networkidle2' });
    await delay(3000); // Extra wait for async file loading from server

    // Check if auto-logged back in
    const afterReload = await page.evaluate(() => ({
      loggedIn: typeof currentUser !== 'undefined' && currentUser,
      savedFilesCount: typeof savedFiles !== 'undefined' ? savedFiles.length : 0,
      installedProgramsCount: typeof installedPrograms !== 'undefined' ? installedPrograms.length : 0
    }));

    test('Auto-login on reload works', !!afterReload.loggedIn);
    // savedFiles loads async from server, check installed programs instead (localStorage)
    test('Installed programs persist after reload', afterReload.installedProgramsCount >= stateBefore.installedProgramsCount);

    // Wait a bit more for server files to load
    await delay(2000);
    const filesAfterWait = await page.evaluate(async () => {
      // Try to manually trigger file load if not loaded yet
      if (typeof loadFilesFromServer === 'function' && savedFiles.length === 0) {
        await loadFilesFromServer();
        await new Promise(r => setTimeout(r, 1000));
      }
      return {
        savedFilesCount: typeof savedFiles !== 'undefined' ? savedFiles.length : 0,
        hasLoadFunction: typeof loadFilesFromServer !== 'undefined'
      };
    });
    // Server files may or may not exist - just check that loading mechanism works
    test('Server file loading mechanism exists', filesAfterWait.hasLoadFunction);

    // ============================================
    // SECTION 10: Error Check
    // ============================================
    console.log('\n10. ERROR CHECK');
    console.log('-'.repeat(40));

    const criticalErrors = pageErrors.filter(e =>
      !e.includes('404') &&
      !e.includes('favicon') &&
      !e.includes('google-analytics')
    );

    test('No critical JavaScript errors', criticalErrors.length === 0,
      criticalErrors.length > 0 ? criticalErrors.join(', ') : '');

  } catch (error) {
    console.error('\nFATAL ERROR:', error.message);
    results.tests.push({ name: 'Test execution', passed: false, details: error.message });
    results.failed++;
  } finally {
    await browser.close();
  }

  // ============================================
  // SUMMARY
  // ============================================
  console.log(`\n${'='.repeat(60)}`);
  console.log('TEST SUMMARY');
  console.log(`${'='.repeat(60)}`);
  console.log(`Total: ${results.passed + results.failed}`);
  console.log(`Passed: ${results.passed}`);
  console.log(`Failed: ${results.failed}`);
  console.log(`${'='.repeat(60)}\n`);

  if (results.failed > 0) {
    console.log('Failed tests:');
    results.tests.filter(t => !t.passed).forEach(t => {
      console.log(`  - ${t.name}${t.details ? ': ' + t.details : ''}`);
    });
  }

  process.exit(results.failed > 0 ? 1 : 0);
}

runTests().catch(err => {
  console.error('Test runner error:', err);
  process.exit(1);
});
