// debug-cdp-run.mjs —— 用 CDP 真实驱动浏览器，打开页面并注入一段表达式执行
//
// 为什么不用 headless --dump-dom：--virtual-time-budget 会把 setTimeout 加速，
// 真实网络请求（登录、查库）却没走完，dump 出来的永远是半成品。
//
// 用法：
//   1) 起带调试端口的浏览器（--user-data-dir 用临时目录，避免污染常用 profile）
//      msedge --headless=new --remote-debugging-port=9222 --user-data-dir=<tmp> about:blank
//   2) node debug-cdp-run.mjs <页面URL> <表达式文件.txt>
//      表达式文件里写一段 async IIFE，可以真实 await 网络；脚本会连同 console / 异常一起打印。
//
// 注意：脚本内置 Network.setCacheDisabled，防止浏览器拿着旧 assets 反复验证。
import { readFileSync } from 'node:fs';

const base = 'http://127.0.0.1:9222';
const [url, exprFile] = process.argv.slice(2);
const expr = readFileSync(exprFile, 'utf-8');

const t = await (await fetch(`${base}/json/new?${encodeURIComponent(url)}`, { method: 'PUT' })).json();
const ws = new WebSocket(t.webSocketDebuggerUrl);
let id = 0;
const pending = new Map();
const send = (method, params = {}) =>
  new Promise((resolve, reject) => {
    const mid = ++id;
    pending.set(mid, { resolve, reject });
    ws.send(JSON.stringify({ id: mid, method, params }));
  });
const logs = [];
let autoDialog = true;   // headless 下 alert/confirm 会把 Runtime.evaluate 永久卡死，一律自动处理
ws.addEventListener('message', (ev) => {
  const m = JSON.parse(ev.data);
  if (m.method === 'Page.javascriptDialogOpening' && autoDialog) {
    logs.push('[dialog] ' + m.params.type + ' :: ' + m.params.message);
    ws.send(JSON.stringify({ id: ++id, method: 'Page.handleJavaScriptDialog', params: { accept: true } }));
  }
  if (m.method === 'Runtime.consoleAPICalled') {
    logs.push('[console.' + m.params.type + '] ' + (m.params.args || []).map((a) => a.value ?? a.description ?? '').join(' '));
  }
  if (m.method === 'Runtime.exceptionThrown') {
    const d = m.params.exceptionDetails;
    logs.push('[exception] ' + (d.exception?.description || d.text) +
      ' @ ' + (d.url || '?') + ':' + d.lineNumber + ':' + d.columnNumber);
  }
  if (m.id && pending.has(m.id)) {
    const p = pending.get(m.id);
    pending.delete(m.id);
    m.error ? p.reject(new Error(JSON.stringify(m.error))) : p.resolve(m.result);
  }
});
await new Promise((r) => (ws.readyState === 1 ? r() : ws.addEventListener('open', r)));
await send('Page.enable');
await send('Runtime.enable');
await send('Network.enable');
await send('Network.setCacheDisabled', { cacheDisabled: true });   // 别让浏览器缓存旧的 assets
await new Promise((r) => setTimeout(r, 3500));

const guard = new Promise((r) => setTimeout(() => r({ TIMEOUT: true }), 180000));
const res = await Promise.race([
  send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }),
  guard,
]);
if (res.TIMEOUT) console.log('TIMEOUT: 表达式 180 秒没跑完（多半还在等某个 promise / 弹窗）');
else if (res.exceptionDetails) console.log('EXCEPTION', res.exceptionDetails.exception?.description || JSON.stringify(res.exceptionDetails));
else console.log(res.result.value);
if (logs.length) console.log('--- console ---\n' + logs.join('\n'));
ws.close();
process.exit(0);
