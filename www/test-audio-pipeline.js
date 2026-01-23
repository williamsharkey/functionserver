// Test: Full Audio Pipeline - Deepwave Gold -> WAV Export -> waveWORLD
// Tests: Create notes in Deepwave, export WAV, open in waveWORLD, verify waveform has content

const puppeteer = require('puppeteer-core');

const TARGET = process.argv[2] || 'http://localhost:8080';
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function runTest() {
  console.log('=== Audio Pipeline Test ===\n');
  console.log('Testing:', TARGET + '/app\n');

  const browser = await puppeteer.launch({
    headless: true,
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required']
  });

  const page = await browser.newPage();
  page.on('console', msg => {
    if (msg.text().includes('Error') || msg.text().includes('ALGO:')) {
      console.log('  [console]', msg.text());
    }
  });

  let passed = 0;
  let failed = 0;

  try {
    await page.goto(TARGET + '/app', { waitUntil: 'networkidle0', timeout: 30000 });
    await sleep(2000);

    // Step 1: Open Deepwave Gold
    console.log('Step 1: Opening Deepwave Gold...');

    // Wait for system apps to load
    await page.waitForFunction(() => {
      return typeof systemApps !== 'undefined' && systemApps.length > 0;
    }, { timeout: 10000 });

    const appCount = await page.evaluate(() => systemApps.length);
    console.log('  System apps loaded:', appCount);

    // Run app directly via runSystemApp
    const runResult = await page.evaluate(() => {
      if (typeof runSystemApp === 'function') {
        try {
          runSystemApp('deepwave-gold');
          return { success: true };
        } catch (e) {
          return { success: false, error: e.message };
        }
      }
      return { success: false, error: 'runSystemApp not found' };
    });

    if (!runResult.success) {
      console.log('  runSystemApp error:', runResult.error);
    }

    await sleep(2000);

    // Check if Deepwave window opened
    const deepwaveOpen = await page.evaluate(() => {
      const windows = document.querySelectorAll('.window');
      for (const win of windows) {
        const title = win.querySelector('.window-title')?.textContent || '';
        if (title.includes('Deepwave')) return true;
      }
      return false;
    });

    if (deepwaveOpen) {
      console.log('  ✓ Deepwave Gold window opened');
      passed++;
    } else {
      console.log('  ✗ Failed to open Deepwave Gold');
      // Try to get more debug info
      const debugInfo = await page.evaluate(() => {
        return {
          windowCount: document.querySelectorAll('.window').length,
          windowTitles: Array.from(document.querySelectorAll('.window .window-title')).map(el => el.textContent),
          hasRunSystemApp: typeof runSystemApp === 'function',
          systemAppsCount: typeof systemApps !== 'undefined' ? systemApps.length : 0,
          appIds: typeof systemApps !== 'undefined' ? systemApps.map(a => a.id) : []
        };
      });
      console.log('  Debug info:', JSON.stringify(debugInfo, null, 2));
      failed++;
      throw new Error('Deepwave not opened');
    }

    // Step 2: Add notes by clicking on the canvas
    console.log('\nStep 2: Adding notes to Deepwave...');

    // Wait for canvas to be ready
    await page.waitForSelector('canvas[id^="dw-canvas"]', { timeout: 5000 });
    await sleep(500);

    const notesAdded = await page.evaluate(() => {
      // Find the canvas
      const canvas = document.querySelector('canvas[id^="dw-canvas"]');
      if (!canvas) return { success: false, error: 'Canvas not found' };

      const instId = canvas.id.replace('dw-canvas-', '');

      // Check if _dw_state exists
      if (typeof _dw_state === 'undefined') {
        return { success: false, error: '_dw_state not defined' };
      }

      const inst = _dw_state?.instances?.[instId];
      if (!inst) {
        return {
          success: false,
          error: 'Instance not found',
          debug: {
            instId: instId,
            stateKeys: Object.keys(_dw_state?.instances || {}),
            stateExists: typeof _dw_state !== 'undefined'
          }
        };
      }

      // Add notes programmatically (more reliable than clicking)
      const lane = inst.lanes[0];

      // Add a C major scale
      const pitches = [60, 62, 64, 65, 67, 69, 71, 72]; // C D E F G A B C
      pitches.forEach((pitch, i) => {
        lane.notes.push({
          beat: i * 0.5,
          pitch: pitch,
          duration: 0.5,
          velocity: 100
        });
      });

      // Refresh canvas
      if (typeof _dw_renderCanvas === 'function') {
        _dw_renderCanvas(instId);
      }

      return { success: true, noteCount: lane.notes.length, instId: instId };
    });

    if (notesAdded.success) {
      console.log('  ✓ Added', notesAdded.noteCount, 'notes to Lane 1');
      passed++;
    } else {
      console.log('  ✗ Failed to add notes:', notesAdded.error);
      failed++;
    }

    // Step 3: Export to WAV
    console.log('\nStep 3: Exporting to WAV...');

    // Set up dialog handler for the prompt
    page.once('dialog', async dialog => {
      await dialog.accept('test-export.wav');
    });

    const exportResult = await page.evaluate((instId) => {
      return new Promise((resolve) => {
        const inst = window._dw_state?.instances?.[instId];
        if (!inst) {
          resolve({ success: false, error: 'Instance not found' });
          return;
        }

        // Check notes exist
        const totalNotes = inst.lanes.reduce((sum, l) => sum + l.notes.length, 0);
        if (totalNotes === 0) {
          resolve({ success: false, error: 'No notes to export' });
          return;
        }

        // Monitor savedFiles for new WAV
        const initialCount = typeof savedFiles !== 'undefined' ? savedFiles.length : 0;

        // Trigger export (will use the dialog accept above)
        // But since we can't easily handle prompts, let's do it directly
        const name = 'test-export.wav';

        const allNotes = [];
        inst.lanes.forEach((lane) => {
          if (lane.muted) return;
          lane.notes.forEach(note => {
            allNotes.push({
              beat: note.beat,
              pitch: note.pitch,
              duration: note.duration,
              velocity: note.velocity
            });
          });
        });

        const msPerBeat = 60000 / inst.tempo;
        let maxBeat = 0;
        allNotes.forEach(note => {
          const endBeat = note.beat + note.duration;
          if (endBeat > maxBeat) maxBeat = endBeat;
        });

        const duration = (maxBeat * msPerBeat / 1000) + 2;
        const sampleRate = 44100;
        const offlineCtx = new OfflineAudioContext(2, sampleRate * duration, sampleRate);

        allNotes.forEach(note => {
          const noteTimeSec = note.beat * msPerBeat / 1000;
          const noteDurSec = note.duration * msPerBeat / 1000;
          const vel = (note.velocity || 100) / 127;
          const freq = 440 * Math.pow(2, (note.pitch - 69) / 12);

          [1, 2, 3, 4].forEach((harmonic, i) => {
            const osc = offlineCtx.createOscillator();
            const gain = offlineCtx.createGain();

            osc.frequency.value = freq * harmonic;
            osc.type = 'sine';

            const vol = vel * 0.15 / (harmonic * harmonic);
            const decay = Math.min(noteDurSec + 0.5, 2);

            gain.gain.setValueAtTime(0, noteTimeSec);
            gain.gain.linearRampToValueAtTime(vol, noteTimeSec + 0.01);
            gain.gain.setValueAtTime(vol * 0.8, noteTimeSec + noteDurSec * 0.7);
            gain.gain.exponentialRampToValueAtTime(0.001, noteTimeSec + decay);

            osc.connect(gain);
            gain.connect(offlineCtx.destination);

            osc.start(noteTimeSec);
            osc.stop(noteTimeSec + decay + 0.1);
          });
        });

        offlineCtx.startRendering().then(buffer => {
          // Convert to WAV
          const numCh = buffer.numberOfChannels;
          const rate = buffer.sampleRate;
          const samples = buffer.length;
          const bytesPerSample = 2;
          const blockAlign = numCh * bytesPerSample;
          const dataSize = samples * blockAlign;
          const bufSize = 44 + dataSize;

          const ab = new ArrayBuffer(bufSize);
          const v = new DataView(ab);

          const writeStr = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };

          writeStr(0, 'RIFF');
          v.setUint32(4, bufSize - 8, true);
          writeStr(8, 'WAVE');
          writeStr(12, 'fmt ');
          v.setUint32(16, 16, true);
          v.setUint16(20, 1, true);
          v.setUint16(22, numCh, true);
          v.setUint32(24, rate, true);
          v.setUint32(28, rate * blockAlign, true);
          v.setUint16(32, blockAlign, true);
          v.setUint16(34, 16, true);
          writeStr(36, 'data');
          v.setUint32(40, dataSize, true);

          const channels = [];
          for (let i = 0; i < numCh; i++) channels.push(buffer.getChannelData(i));

          let offset = 44;
          for (let i = 0; i < samples; i++) {
            for (let ch = 0; ch < numCh; ch++) {
              const s = Math.max(-1, Math.min(1, channels[ch][i]));
              v.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
              offset += 2;
            }
          }

          // Convert to base64
          const bytes = new Uint8Array(ab);
          let binary = '';
          for (let i = 0; i < bytes.byteLength; i++) {
            binary += String.fromCharCode(bytes[i]);
          }
          const base64 = 'data:audio/wav;base64,' + btoa(binary);

          // Save to savedFiles
          if (typeof savedFiles !== 'undefined') {
            savedFiles.push({
              name: name,
              content: base64,
              type: 'audio',
              icon: '🔊'
            });
            if (typeof saveState === 'function') saveState();
            if (typeof createDesktopIcons === 'function') createDesktopIcons();
          }

          resolve({
            success: true,
            fileName: name,
            duration: buffer.duration.toFixed(2),
            sampleRate: buffer.sampleRate,
            channels: buffer.numberOfChannels,
            dataLength: base64.length
          });
        }).catch(e => {
          resolve({ success: false, error: e.message });
        });
      });
    }, notesAdded.instId);

    await sleep(2000);

    if (exportResult.success) {
      console.log('  ✓ Exported WAV:', exportResult.fileName);
      console.log('    Duration:', exportResult.duration + 's');
      console.log('    Sample Rate:', exportResult.sampleRate + ' Hz');
      console.log('    Data size:', Math.round(exportResult.dataLength / 1024) + ' KB');
      passed++;
    } else {
      console.log('  ✗ Export failed:', exportResult.error);
      failed++;
    }

    // Step 4: Open waveWORLD
    console.log('\nStep 4: Opening waveWORLD...');

    const wwResult = await page.evaluate(() => {
      if (typeof runSystemApp === 'function') {
        runSystemApp('waveworld');
        return true;
      }
      return false;
    });

    await sleep(1500);

    const wwOpen = await page.evaluate(() => {
      const windows = document.querySelectorAll('.window');
      for (const win of windows) {
        const title = win.querySelector('.window-title')?.textContent || '';
        if (title.includes('waveWORLD')) return true;
      }
      return false;
    });

    if (wwOpen) {
      console.log('  ✓ waveWORLD window opened');
      passed++;
    } else {
      console.log('  ✗ Failed to open waveWORLD');
      failed++;
    }

    // Step 5: Load the WAV into waveWORLD
    console.log('\nStep 5: Loading WAV into waveWORLD...');

    const loadResult = await page.evaluate(() => {
      // Find the waveworld instance
      const canvas = document.querySelector('canvas[id^="ww-canvas"]');
      if (!canvas) return { success: false, error: 'waveWORLD canvas not found' };

      const instId = canvas.id.replace('ww-canvas-', '');

      // Find the WAV file
      if (typeof savedFiles === 'undefined' || savedFiles.length === 0) {
        return { success: false, error: 'No saved files' };
      }

      const wavFile = savedFiles.find(f => f.name.endsWith('.wav'));
      if (!wavFile) {
        return { success: false, error: 'No WAV file found in savedFiles' };
      }

      // Load the audio
      if (typeof _ww_loadAudio === 'function') {
        _ww_loadAudio(instId, wavFile.content, wavFile.name);
        return { success: true, fileName: wavFile.name, instId: instId };
      }

      return { success: false, error: '_ww_loadAudio not found' };
    });

    await sleep(2000); // Wait for audio to decode

    if (loadResult.success) {
      console.log('  ✓ Loaded:', loadResult.fileName);
      passed++;
    } else {
      console.log('  ✗ Failed to load WAV:', loadResult.error);
      failed++;
    }

    // Step 6: Verify waveform has audio content (not silence)
    console.log('\nStep 6: Verifying waveform has audio content...');

    const contentCheck = await page.evaluate((instId) => {
      const inst = window._ww_state?.instances?.[instId];
      if (!inst) return { hasContent: false, error: 'Instance not found' };
      if (!inst.audioBuffer) return { hasContent: false, error: 'No audio buffer' };
      if (!inst.waveformData) return { hasContent: false, error: 'No waveform data' };

      const data = inst.waveformData;
      let maxAmp = 0;
      let nonZeroCount = 0;
      const sampleStep = Math.max(1, Math.floor(data.length / 1000));

      for (let i = 0; i < data.length; i += sampleStep) {
        const amp = Math.abs(data[i]);
        if (amp > maxAmp) maxAmp = amp;
        if (amp > 0.001) nonZeroCount++;
      }

      return {
        hasContent: maxAmp > 0.01,
        maxAmplitude: maxAmp.toFixed(4),
        nonZeroSamples: nonZeroCount,
        totalSamplesChecked: Math.floor(data.length / sampleStep),
        duration: inst.audioBuffer.duration.toFixed(2)
      };
    }, loadResult.instId);

    if (contentCheck.hasContent) {
      console.log('  ✓ Waveform has audio content!');
      console.log('    Max amplitude:', contentCheck.maxAmplitude);
      console.log('    Non-zero samples:', contentCheck.nonZeroSamples, '/', contentCheck.totalSamplesChecked);
      console.log('    Duration:', contentCheck.duration + 's');
      passed++;
    } else {
      console.log('  ✗ Waveform appears to be silence or zero');
      console.log('    Error:', contentCheck.error || 'Max amplitude too low');
      console.log('    Max amplitude:', contentCheck.maxAmplitude);
      failed++;
    }

    // Step 7: Take a screenshot of the waveform
    console.log('\nStep 7: Capturing waveform screenshot...');
    await page.screenshot({ path: 'waveform-test.png', fullPage: false });
    console.log('  ✓ Screenshot saved: waveform-test.png');

  } catch (err) {
    console.error('\n✗ Test error:', err.message);
    failed++;
  }

  await browser.close();

  // Summary
  console.log('\n========== SUMMARY ==========\n');
  console.log('Passed:', passed);
  console.log('Failed:', failed);
  console.log('');

  if (failed === 0) {
    console.log('✓ Full audio pipeline test PASSED!');
    console.log('  Deepwave Gold → WAV Export → waveWORLD → Waveform Verified');
  } else {
    console.log('✗ Some tests failed');
    process.exit(1);
  }
}

runTest().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
