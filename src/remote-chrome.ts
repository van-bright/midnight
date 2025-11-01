import * as chrome from 'selenium-webdriver/chrome';
import { Builder, WebDriver, until, By } from "selenium-webdriver";
import { spawn, ChildProcess } from "child_process";
import fs from "fs";

async function checkAndRestartSession(driver: WebDriver, processId: string, interval: number = 30000) {
  const countDownCss = "/html/body/div[2]/div/main/div/div[2]/div[3]/div/div[2]/div[1]/div[4]/span[2]";
  const startSessionCss = "/html/body/div[2]/div/main/div/div[3]/div/button";

  while (true) {
    const countDownElement = await driver.wait(until.elementLocated(By.xpath(countDownCss)), 10000);
    const startSessionElement = await driver.wait(until.elementLocated(By.xpath(startSessionCss)), 10000);

    const countDownText = await countDownElement.getText();
    const startSessionText = await startSessionElement.getText();

    console.log(`${processId} : countDownText: ${countDownText}, startSessionText: ${startSessionText}`);

    if (countDownText == "00:00:00:00" || startSessionText == "Start session") {
      console.log(`${processId} : ❌ 任务中断, 刷新重启.....`);

      while (true) {
        try {
          await driver.navigate().refresh();

          await driver.sleep(10000);

          const startSessionElement = await driver.wait(until.elementLocated(By.xpath(startSessionCss)), 10000);
          await startSessionElement.click();

          break;
        } catch (e) {
          console.log(`${processId} : ❌ 刷新重启失败, 继续重试.....`);
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      }
    }

    // 每10s钟检查一次是否已经停了
    await new Promise((resolve) => setTimeout(resolve, interval));
  }
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
  userDataDir?: string
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
    detached: true,
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
  const debugPort = process.argv[2] || "9222";
  const userDataDir = process.argv[3]; // 可选的用户数据目录

  if (!debugPort) {
    console.error("请提供调试端口号，例如: node dist/adspower.js 9222");
    process.exit(1);
  }

  let chromeProcess: ChildProcess | null = null;

  try {
    // 在指定的debugPort上启动远程chrome浏览器, 并且确保浏览器启动时已经加载了插件
    // 扩展会持久化保存在 user-data-dir 中，下次启动时会自动加载
    chromeProcess = await startChromeWithRemoteDebugging(debugPort, userDataDir);

    // 连接到已启动的 Chrome
    const driver = await connectToChromeViaDebugging(debugPort);

    try {
      await driver.manage().setTimeouts({ implicit: 10000 });
      await driver.manage().window().maximize();
      await driver.get('https://sm.midnight.gd/wizard/mine');

      // 等待手动安装扩展, 按下任意键继续, 按Ctrl+C 退出
      console.log(`${debugPort} : 安装好钱包, 启动好挖矿后, 按任意键继续. 按Ctrl+C 退出`);
      console.log(`提示: 扩展会保存在用户数据目录中，下次启动同一端口时会自动加载`);
      await new Promise((resolve) => {
        process.stdin.once("data", () => resolve(undefined));
        process.on("SIGINT", () => {
          console.log(`${debugPort} : 退出...`);
          process.exit(0);
        });
      });

      await checkAndRestartSession(driver, debugPort);

    } catch (error) {
      console.error("Error occurred:");
      console.error(error);
      if (error instanceof Error) {
        console.error("Stack trace:", error.stack);
      }
      throw error;
    } finally {
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
    }
  } catch (error) {
    console.error("启动失败:", error);
    if (error instanceof Error) {
      console.error("错误信息:", error.message);
    }
    process.exit(1);
  }
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((err) => {
    console.error("Error occurred:");
    console.error(err);
    if (err instanceof Error) {
      console.error("Stack trace:", err.stack);
    }
    process.exit(1);
  });

