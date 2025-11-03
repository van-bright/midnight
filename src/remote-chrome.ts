import * as chrome from 'selenium-webdriver/chrome';
import { Builder, WebDriver, until, By } from "selenium-webdriver";
import { spawn, ChildProcess } from "child_process";
import fs from "fs";
import cron, { ScheduledTask } from 'node-cron';

const countDownCss = "/html/body/div[2]/div/main/div/div[2]/div[3]/div/div[2]/div[1]/div[4]/span[2]";
const startSessionCss = "/html/body/div[2]/div/main/div/div[3]/div/button";

// 存储 keepAliveTask 的定时任务对象
let keepAliveCronTask: ScheduledTask | null = null;

async function makeConnectionAlive(driver: WebDriver, processId: string) {
  //S1: 检查是否已经正确连接到了服务器
  while (true) {
    const countDownElement = await driver.wait(until.elementLocated(By.xpath(countDownCss)), 10000);
    const countDownText = await countDownElement.getText();

    if (countDownText != "00:00:00:00") break;

    console.log(`${processId} : ❌ 连接似乎已经断开了, 刷新并重新连接.....`);
    await driver.navigate().refresh();
    await driver.sleep(10000);
  }
}

async function startSession(driver: WebDriver, processId: string) {
  console.log(`${processId} : 点击开始按钮.....`);
  const startSessionElement = await driver.wait(until.elementLocated(By.xpath(startSessionCss)), 10000);
  let startSessionText = await startSessionElement.getText();
  if (startSessionText == "Start session") {
    await startSessionElement.click();
    await driver.sleep(5000);
  }
}

async function stopSession(driver: WebDriver, processId: string) {
  console.log(`${processId} : 点击停止按钮.....`);
  const startSessionElement = await driver.wait(until.elementLocated(By.xpath(startSessionCss)), 10000);
  let startSessionText = await startSessionElement.getText();
  if (startSessionText == "Stop session") {
    await startSessionElement.click();
    await driver.sleep(5000);
  }
}

async function keepAliveTask(driver: WebDriver, processId: string) {
  try {
    await makeConnectionAlive(driver, processId);
  } catch (error) {
    console.error(`${processId} : 保持连接失败 :`, error);
    throw error;
  }
}

async function keepCalculatingTask(driver: WebDriver, processId: string) {
  const startTimestamp = Date.now();   // ms from epoch
  const targetDuration = 2.5 * 60 * 60 * 1000; // 2.5 hours

  do {
    try {
      await makeConnectionAlive(driver, processId);
      await startSession(driver, processId);
    } catch (error) {
      console.error(`${processId} : 计算任务错误, 重试 :`, error);
    }

    await driver.sleep(120000); // 2 minutes
  } while (Date.now() - startTimestamp < targetDuration);

  await stopSession(driver, processId);
  console.log(`${processId} : 计算任务完成 : ${Date.now() - startTimestamp} ms`);
}

function findChromeBinary(): string {
  const possiblePaths = [
    // macOS
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary",
    // Linux
    "/usr/bin/google-chrome",
    "/usr/bin/chromium-browser",
    "/usr/bin/chromium",
    // Windows
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  ];

  for (const chromePath of possiblePaths) {
    if (fs.existsSync(chromePath)) {
      return chromePath;
    }
  }

  throw new Error("Chrome binary not found. Please install Google Chrome.");
}

async function startChromeWithRemoteDebugging(
  debugPort: string,
): Promise<ChildProcess> {
  const chromeBinary = findChromeBinary();

  // 如果没有指定 userDataDir，创建一个基于 debugPort 的唯一目录
  const chromeUserDataDir = `${process.env.HOME}/chrome_dev_profile/${debugPort}`;

  // 确保目录存在
  fs.mkdirSync(chromeUserDataDir, { recursive: true });

  console.log(`启动 Chrome，调试端口: ${debugPort}, 用户数据目录: ${chromeUserDataDir}`);

  const args = [
    `--remote-debugging-port=${debugPort}`,
    `--user-data-dir=${chromeUserDataDir}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-dev-shm-usage',
    '--disable-gpu',
    // '--disable-blink-features=AutomationControlled',
    '--disable-notifications',
    '--start-maximized',
    // 允许加载扩展（扩展会持久化在 user-data-dir 中）
    '--disable-extensions-file-access-check',
    '--disable-extensions-http-throttling',
  ];

  const chromeProcess = spawn(chromeBinary, args, {
    detached: false,
    stdio: 'ignore',
  });

  chromeProcess.on('error', (error) => {
    console.error(`Chrome 启动错误: ${error.message}`);
  });

  // 等待 Chrome 启动
  console.log(`等待 Chrome 启动在端口 ${debugPort}...`);
  await new Promise((resolve) => setTimeout(resolve, 5000));

  return chromeProcess;
}

async function connectToChromeViaDebugging(debugPort: string): Promise<WebDriver> {
  const opts = new chrome.Options();
  opts.addArguments('--disable-notifications');
  // opts.addArguments('--disable-blink-features=AutomationControlled');
  opts.windowSize({ width: 1920, height: 1080 });
  opts.addArguments('--start-maximized');
  opts.addArguments('--disable-gpu');
  opts.addArguments('--no-sandbox');

  // 连接到已启动的 Chrome 实例
  opts.debuggerAddress(`localhost:${debugPort}`);

  console.log(`通过调试端口 ${debugPort} 连接到 Chrome...`);

  const driver = await new Builder()
    .forBrowser('chrome')
    .setChromeOptions(opts)
    .build();

  return driver;
}

async function main(): Promise<void> {
  // 启动的
  const debugPort = process.argv[2] || "9222";
  const delayMinutes = process.argv[3] || 0;
  const cronExpression = process.argv[4] || "0 */3 * * *";

  if (!debugPort) {
    console.error("请提供调试端口号，例如: node dist/adspower.js 9222");
    process.exit(1);
  }

  let chromeProcess: ChildProcess | null = null;

  try {
    // 在指定的debugPort上启动远程chrome浏览器, 并且确保浏览器启动时已经加载了插件
    // 扩展会持久化保存在 user-data-dir 中，下次启动时会自动加载
    chromeProcess = await startChromeWithRemoteDebugging(debugPort);

    // 连接到已启动的 Chrome
    const driver = await connectToChromeViaDebugging(debugPort);

    await driver.manage().setTimeouts({ implicit: 10000 });
    await driver.manage().window().maximize();
    await driver.get('https://sm.midnight.gd/wizard/mine');

    // 等待手动安装扩展, 按下任意键继续, 按Ctrl+C 退出
    console.log(`${debugPort} : 安装好钱包, 启动好挖矿后, 按任意键继续. 按Ctrl+C 退出`);
    console.log(`提示: 扩展会保存在用户数据目录中，下次启动同一端口时会自动加载`);
    await new Promise((resolve) => {
      process.stdin.once("data", () => resolve(undefined));
    });

    // 1. 先启动 keepAliveTask
    keepAliveCronTask = cron.schedule(`*/3 * * * *`, async () => {
      console.log(`${debugPort} : 检查连接任务开始...`);
      await keepAliveTask(driver, debugPort);
    });
    console.log(`${debugPort} : keepAliveTask 已启动`);

    // 2. 等待 delayMinutes 后启动计算任务
    const delayMs = Number(delayMinutes) * 60 * 1000;
    setTimeout(async () => {
      // 启动 cron 任务, 在每小时的 cronExpression 分钟时运行任务
      cron.schedule(`${cronExpression}`, async () => {
        console.log(`${debugPort} : 计算任务开始, 停止 keepAliveTask...`);

        // 2. 在 keepCalculatingTask 启动前, 先停止 keepAliveTask
        if (keepAliveCronTask) {
          keepAliveCronTask.stop();
          console.log(`${debugPort} : keepAliveTask 已停止`);
        }

        // 执行计算任务
        await keepCalculatingTask(driver, debugPort);

        // 3. 在 keepCalculatingTask 任务完成之后, 再重新调度 keepAliveTask
        console.log(`${debugPort} : 计算任务完成, 重新启动 keepAliveTask...`);
        keepAliveCronTask = cron.schedule(`*/3 * * * *`, async () => {
          console.log(`${debugPort} : 检查连接任务开始...`);
          await keepAliveTask(driver, debugPort);
        });
        console.log(`${debugPort} : keepAliveTask 已重新启动`);
      });
      console.log(`${debugPort} : 计算任务调度器已启动 (${cronExpression})`);
    }, delayMs);

    // 等待 Ctrl+C 退出
    process.on("SIGINT", async () => {
      console.log(`${debugPort} : 退出...`);

      // 停止 keepAliveTask
      if (keepAliveCronTask) {
        keepAliveCronTask.stop();
        console.log(`${debugPort} : keepAliveTask 已停止`);
      }

      try {
        await driver.quit();
      } catch (e) {
        console.warn("关闭 Selenium 驱动时出错:", e);
      }

      // 清理 Chrome 进程
      if (chromeProcess && !chromeProcess.killed) {
        console.log(`终止 Chrome 进程 (端口 ${debugPort})...`);
        chromeProcess.kill();
      }
      process.exit(0);
    });

    // 保持进程运行
    console.log(`${debugPort} : 定时任务已启动, 等待任务执行...`);
    await new Promise(() => {}); // 永远等待
  } catch (error) {
    console.error("启动失败:", error);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Error occurred: ", err);
  process.exit(1);
});

