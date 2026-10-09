import { chromium } from 'playwright';
import { pathToFileURL } from 'node:url';
const [,, hash, out, w = '1280', theme = 'light', layer = 'simple'] = process.argv;
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const p = await b.newPage({ viewport: { width: +w, height: 800 }, colorScheme: theme });
await p.goto(pathToFileURL(process.cwd() + '/index.html').href + hash);
if (layer === 'study') { await p.selectOption('[data-layer-select]', 'study'); }
await p.waitForTimeout(100);
await p.screenshot({ path: out, fullPage: true });
await b.close();
