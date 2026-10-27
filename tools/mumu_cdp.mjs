import { execSync } from 'node:child_process';

export async function getWebviewWsUrl() {
  execSync('adb connect 127.0.0.1:16384');
  const sockets = execSync('adb -s 127.0.0.1:16384 shell cat /proc/net/unix').toString();
  const match = sockets.match(/@(webview_devtools_remote_\d+)/);
  if (!match) {
    throw new Error('No webview_devtools_remote socket found in MuMu');
  }
  const socketName = match[1];
  try {
    execSync(`adb -s 127.0.0.1:16384 forward tcp:19222 localabstract:${socketName}`);
  } catch {
    // already forwarded
  }
  
  const res = await fetch('http://localhost:19222/json/list');
  const list = await res.json();
  const page = list.find(item => item.type === 'page' && item.url.includes('127.0.0.1:5000'));
  if (!page) {
    throw new Error('Inspectra WebView page not found in DevTools list: ' + JSON.stringify(list));
  }
  return page.webSocketDebuggerUrl;
}

export async function evalInWebview(expression) {
  const wsUrl = await getWebviewWsUrl();
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    const timeout = setTimeout(() => {
      ws.close();
      reject(new Error('CDP evaluation timed out'));
    }, 10000);

    ws.onopen = () => {
      ws.send(JSON.stringify({
        id: 1,
        method: 'Runtime.evaluate',
        params: {
          expression,
          returnByValue: true,
          awaitPromise: true,
        },
      }));
    };

    ws.onmessage = (event) => {
      clearTimeout(timeout);
      const data = JSON.parse(event.data);
      ws.close();
      if (data.error) {
        reject(data.error);
      } else if (data.result?.exceptionDetails) {
        reject(new Error(data.result.exceptionDetails.text + ': ' + JSON.stringify(data.result.exceptionDetails.exception)));
      } else {
        resolve(data.result?.result?.value);
      }
    };

    ws.onerror = (err) => {
      clearTimeout(timeout);
      reject(err);
    };
  });
}

// CLI usage
if (process.argv[1] && process.argv[1].endsWith('mumu_cdp.mjs')) {
  const expr = process.argv[2] || 'document.title + " | " + window.location.href';
  evalInWebview(expr)
    .then(res => console.log('RESULT:', res))
    .catch(err => {
      console.error('ERROR:', err);
      process.exit(1);
    });
}
