/**
 * 浏览器端集成测试（Playwright + 系统 Chrome）：
 * 实际加载页面、初始化 WebGL2、跑仿真、点击车钟/舵/拖轮、
 * 切换四个页面并截图，捕获控制台错误与 WebGL 崩溃。
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE = 'http://127.0.0.1:5191';

const errors: string[] = [];
let server: ReturnType<typeof spawn>;

function startServer(): Promise<void> {
  return new Promise((res, rej) => {
    server = spawn('npx', ['vite', 'preview', '--port', '5191', '--strictPort'], {
      cwd: root,
      shell: true,
    });
    let out = '';
    server.stdout?.on('data', (d) => {
      out += d;
      if (out.includes('5191')) res();
    });
    server.stderr?.on('data', (d) => { out += d; if (out.includes('5191')) res(); });
    setTimeout(() => rej(new Error('vite 启动超时: ' + out)), 30000);
  });
}

async function main(): Promise<void> {
  await startServer();
  const browser = await chromium.launch({
    headless: true,
    executablePath: CHROME,
    args: [
      '--use-angle=swiftshader',
      '--enable-unsafe-swiftshader',
      '--ignore-gpu-blocklist',
      '--no-sandbox',
    ],
  });
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push('console.error: ' + msg.text());
  });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));

  // 1. 任务页
  await page.goto(BASE + '/#tasks');
  await page.waitForSelector('.task-card');
  const taskCount = await page.locator('.task-card').count();
  console.log(`任务卡片数: ${taskCount}`);
  await page.screenshot({ path: 'shots/01-tasks.png' });

  // WebGL2 可用性
  const gl2 = await page.evaluate(() => {
    const c = document.createElement('canvas');
    return !!c.getContext('webgl2');
  });
  console.log('WebGL2 支持:', gl2);
  if (!gl2) throw new Error('WebGL2 不可用');

  // 2. 进入第一个任务的驾驶台
  await page.locator('[data-start="task-linlan-cargo"]').click();
  await page.waitForSelector('#glcanvas');
  await page.waitForTimeout(2500); // 等渲染与仿真跑一会儿
  await page.screenshot({ path: 'shots/02-bridge.png' });

  // 3. 操纵交互：进三、右舵 15、首拖轮顶推
  await page.locator('#telegraph [data-level="3"]').click();
  await page.locator('[data-rudder="15"]').click();
  await page.locator('.tug-row[data-tug="0"] [data-act="push"]').click();
  await page.waitForTimeout(2000);
  const sogText = await page.locator('#hud').innerText();
  console.log('HUD 首行:\n' + sogText.split('\n').slice(0, 4).join('\n'));
  await page.screenshot({ path: 'shots/03-bridge-control.png' });

  // 4. 相机切换
  await page.locator('[data-cam="top"]').click();
  await page.waitForTimeout(800);
  const glErr = await page.evaluate(() => {
    const canvas = document.getElementById('glcanvas') as HTMLCanvasElement;
    const gl = canvas.getContext('webgl2')!;
    return gl.getError();
  });
  if (glErr !== 0) throw new Error('WebGL 运行时错误: ' + glErr);
  await page.screenshot({ path: 'shots/04-top-cam.png' });
  await page.locator('[data-cam="orbit"]').click();
  await page.waitForTimeout(600);
  await page.screenshot({ path: 'shots/04b-orbit-cam.png' });
  await page.locator('[data-cam="chase"]').click();

  // 5. 航迹分析页
  await page.evaluate(() => (location.hash = 'analysis'));
  await page.waitForSelector('#ch-sog');
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'shots/05-analysis.png' });

  // 6. 评分页
  await page.evaluate(() => (location.hash = 'score'));
  await page.waitForSelector('.score-hero');
  const score = await page.locator('.score-hero .num').innerText();
  console.log('评分页总分:', score);
  await page.screenshot({ path: 'shots/06-score.png' });

  // 7. 自由操练 + VLCC（验证最大船型渲染不崩）
  await page.evaluate(() => (location.hash = 'tasks'));
  await page.waitForSelector('#practice-start');
  await page.locator('#practice-ships [data-ship="vlcc-300k"]').click();
  await page.locator('#practice-ports [data-port="heishi"]').click();
  await page.locator('#practice-start').click();
  await page.waitForSelector('#glcanvas');
  await page.waitForTimeout(2000);
  await page.screenshot({ path: 'shots/07-vlcc-practice.png' });

  await browser.close();
  server.kill();

  if (errors.length) {
    console.log('\n浏览器错误:');
    errors.forEach((e) => console.log('  ' + e));
    throw new Error('存在浏览器端错误');
  }
  console.log('\n集成测试通过，无控制台错误，截图已保存到 shots/');
}

main().catch((e) => {
  server?.kill();
  console.error(e);
  process.exit(1);
});
