const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const PORT = 9222;
const TARGET_URL = 'http://127.0.0.1:8765/';
const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const USER_DATA_DIR = 'C:\\Users\\shint\\Projects\\app-bikin-laporan\\.artifacts\\edge-cdp-profile';
const OUTPUT_SCREENSHOT = 'C:\\Users\\shint\\Projects\\app-bikin-laporan\\.artifacts\\screen_desktop_vision_test.png';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

class CdpClient {
  constructor(wsUrl) {
    this.ws = new WebSocket(wsUrl);
    this.id = 1;
    this.callbacks = new Map();
  }

  init() {
    return new Promise((resolve, reject) => {
      this.ws.onopen = () => resolve();
      this.ws.onerror = (err) => reject(err);
      this.ws.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        if (msg.id && this.callbacks.has(msg.id)) {
          const cb = this.callbacks.get(msg.id);
          this.callbacks.delete(msg.id);
          if (msg.error) cb.reject(new Error(JSON.stringify(msg.error)));
          else cb.resolve(msg.result);
        }
      };
    });
  }

  send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const msgId = this.id++;
      this.callbacks.set(msgId, { resolve, reject });
      this.ws.send(JSON.stringify({ id: msgId, method, params }));
    });
  }

  async eval(expr) {
    const res = await this.send('Runtime.evaluate', {
      expression: expr,
      awaitPromise: true,
      returnByValue: true,
    });
    return res.result?.value;
  }

  async captureScreenshot() {
    const res = await this.send('Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: false,
    });
    return Buffer.from(res.data, 'base64');
  }

  close() {
    this.ws.close();
  }
}

async function main() {
  console.log('1. Starting Edge headless...');
  const edgeProc = spawn(EDGE_PATH, [
    '--headless=new',
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${USER_DATA_DIR}`,
    '--window-size=1280,800',
    '--disable-gpu',
    TARGET_URL,
  ]);

  let wsUrl = null;
  for (let i = 0; i < 30; i++) {
    await sleep(500);
    try {
      const targets = await getJson(`http://127.0.0.1:${PORT}/json`);
      if (targets && targets.length > 0) {
        const pageTarget = targets.find((t) => t.type === 'page') || targets[0];
        wsUrl = pageTarget.webSocketDebuggerUrl;
        console.log('Target found:', pageTarget.url, wsUrl);
        break;
      }
    } catch {
      // waiting for server
    }
  }

  if (!wsUrl) {
    edgeProc.kill();
    throw new Error('Edge CDP target not available after 15s');
  }

  console.log('2. Connecting to WebSocket CDP...');
  const cdp = new CdpClient(wsUrl);
  await cdp.init();

  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');

  // Wait for initial load
  console.log('3. Waiting for Inspectra UI load...');
  for (let i = 0; i < 30; i++) {
    await sleep(500);
    const ready = await cdp.eval('document.readyState');
    const tableRows = await cdp.eval('document.querySelectorAll(".inspection-table tbody tr").length');
    console.log(`ReadyState: ${ready}, Table rows: ${tableRows}`);
    if (tableRows > 0) break;
  }

  // Click on the first inspection row
  console.log('4. Opening first inspection...');
  const clickRes = await cdp.eval(`(() => {
    const link = document.querySelector(".table-link");
    if (link) {
      link.click();
      return 'clicked .table-link: ' + link.innerText;
    }
    const tr = document.querySelector(".inspection-table tbody tr");
    if (tr) {
      tr.click();
      return 'clicked tr';
    }
    return 'not found';
  })()`);
  console.log('Click result:', clickRes);

  await sleep(1500);

  // Switch to Photos tab
  console.log('5. Switching to Photos tab...');
  const tabRes = await cdp.eval(`(() => {
    const tabs = Array.from(document.querySelectorAll(".workspace-tabs button"));
    const photoTab = tabs.find(t => t.innerText.includes("Photos"));
    if (photoTab) {
      photoTab.click();
      return 'clicked photos tab';
    }
    return 'photos tab not found among: ' + tabs.map(t => t.innerText).join(', ');
  })()`);
  console.log('Tab switch result:', tabRes);

  await sleep(1500);

  // Scroll to report-page-card so header with Audit AI is visible at top
  await cdp.eval(`(() => {
    const card = document.querySelector(".report-page-card");
    if (card) {
      card.scrollIntoView({ behavior: 'instant', block: 'start' });
    }
  })()`);
  await sleep(500);

  // Check state of PhotoUploadSection
  const photoState = await cdp.eval(`(() => {
    const auditBtn = document.querySelector(".audit-page-btn");
    const aiBadges = Array.from(document.querySelectorAll(".photo-ai-badge-btn"));
    const photoCards = Array.from(document.querySelectorAll(".photo-card"));
    const pageCards = Array.from(document.querySelectorAll(".report-page-card"));
    return {
      hasAuditBtn: !!auditBtn,
      auditBtnText: auditBtn?.innerText,
      aiBadgesCount: aiBadges.length,
      photoCardsCount: photoCards.length,
      pageCardsCount: pageCards.length,
      headers: Array.from(document.querySelectorAll("h2, h3, h4")).map(h => h.innerText)
    };
  })()`);
  console.log('Photo state:', JSON.stringify(photoState, null, 2));

  // Open the Single Photo Vision Modal
  console.log('6. Opening Single Photo Vision Modal...');
  const openModalRes = await cdp.eval(`(() => {
    const aiBadge = document.querySelector(".photo-ai-badge-btn");
    if (aiBadge) {
      aiBadge.click();
      return 'clicked .photo-ai-badge-btn';
    }
    const slot = document.querySelector(".report-page-slot.filled");
    if (slot) {
      slot.click();
      return 'clicked filled slot';
    }
    return 'no photo button found';
  })()`);
  console.log('Open modal result:', openModalRes);

  await sleep(1500);

  // Check modal contents
  const modalState = await cdp.eval(`(() => {
    const modal = document.querySelector(".photo-lightbox-modal");
    const analyzeBtn = document.querySelector(".photo-analyze-btn");
    return {
      hasModal: !!modal,
      analyzeBtnText: analyzeBtn?.innerText,
      modalTitle: document.querySelector("#photo-modal-title")?.innerText
    };
  })()`);
  console.log('Modal state:', JSON.stringify(modalState, null, 2));

  // Trigger AI Vision scan
  console.log('7. Triggering AI Vision scan...');
  const scanRes = await cdp.eval(`(() => {
    const analyzeBtn = document.querySelector(".photo-analyze-btn");
    if (analyzeBtn) {
      analyzeBtn.click();
      return 'clicked analyze button';
    }
    return 'analyze button not found';
  })()`);
  console.log('Scan result:', scanRes);

  // Wait for scan result to appear
  console.log('8. Waiting for scan result...');
  for (let i = 0; i < 70; i++) {
    await sleep(500);
    const check = await cdp.eval(`(() => {
      const res = document.querySelector(".photo-vision-result");
      const err = document.querySelector(".photo-vision-error");
      const btn = document.querySelector(".photo-analyze-btn");
      if (res) return 'result: ' + res.innerText.replace(/\\n/g, ' ').substring(0, 80);
      if (err) return 'error: ' + err.innerText;
      return null;
    })()`);
    if (check) {
      console.log('Analysis status:', check);
      break;
    }
  }

  await sleep(1000);

  // Capture screenshot
  console.log('9. Capturing screenshot at 1280x800...');
  const pngBuffer = await cdp.captureScreenshot();
  fs.writeFileSync(OUTPUT_SCREENSHOT, pngBuffer);
  console.log(`Saved screenshot to ${OUTPUT_SCREENSHOT} (${pngBuffer.length} bytes)`);

  cdp.close();
  edgeProc.kill();
  console.log('Done!');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
