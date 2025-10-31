import { Builder, until, By, WebDriver } from "selenium-webdriver";
import * as chrome from "selenium-webdriver/chrome";
import { ServiceBuilder } from "selenium-webdriver/chrome";
import os from "os";
import fs from "fs";
import path from "path";

export interface AutomationOptions {
  url: string;
  headless?: boolean;
}

function createUniqueChromeUserDataDir(): string {
  const base = path.join(os.tmpdir(), "selenium-ts-automation");
  const unique = `profile-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const dir = path.join(base, unique);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function findChromeBinary(): string | undefined {
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
  return undefined;
}

export async function buildDriver(headless: boolean | undefined): Promise<WebDriver> {
  console.log("Creating Chrome driver...");
  const userDataDir = createUniqueChromeUserDataDir();
  console.log(`Using user data directory: ${userDataDir}`);

  const options = new chrome.Options();

  // Try to find Chrome binary path (especially important on macOS)
  const chromeBinary = findChromeBinary();
  if (chromeBinary) {
    console.log(`Found Chrome at: ${chromeBinary}`);
    options.setChromeBinaryPath(chromeBinary);
  } else {
    console.log("Chrome binary not found in common locations, using system default");
  }

  // Ensure a fresh Chrome instance each run via a unique profile directory
  options.addArguments(`--user-data-dir=${userDataDir}`);

  options.addArguments("--no-first-run");
  options.addArguments("--no-default-browser-check");
  options.addArguments("--disable-dev-shm-usage");
  options.addArguments("--disable-gpu");
  options.addArguments("--disable-blink-features=AutomationControlled");

  if (headless) {
    // Chrome new headless mode
    options.addArguments("--headless=new");
  }

  try {
    console.log("Initializing WebDriver (this may take a moment on first run as ChromeDriver is downloaded)...");

    // Create service with timeout
    const service = new ServiceBuilder();

    // Set a timeout for the driver build
    const buildPromise = new Builder()
      .forBrowser("chrome")
      .setChromeOptions(options)
      .setChromeService(service)
      .build();

    // Wrap with timeout
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(
          new Error(
            "WebDriver initialization timed out after 30 seconds. This might be due to ChromeDriver download or Chrome not starting properly."
          )
        );
      }, 30000);
    });

    const driver = await Promise.race([buildPromise, timeoutPromise]);
    console.log("Chrome driver created successfully");
    return driver;
  } catch (error) {
    console.error("Failed to create Chrome driver:", error);
    if (error instanceof Error) {
      console.error("Error message:", error.message);
    }
    throw error;
  }
}

export async function runAutomation(options: AutomationOptions): Promise<void> {
  const { url, headless } = options;
  const driver = await buildDriver(headless);

  try {
    await driver.get(url);

    // 等待手动安装扩展, 按下任意键继续, 按Ctrl+C 退出
    console.log("安装好钱包, 启动好挖矿后, 按任意键继续. 按Ctrl+C 退出");
    await new Promise((resolve) => {
      process.stdin.once("data", () => resolve(undefined));
      process.on("SIGINT", () => {
        console.log("Exiting...");
        process.exit(0);
      });
    });

    const countDownCss = "/html/body/div[2]/div/main/div/div[2]/div[3]/div/div[2]/div[1]/div[4]/span[2]";
    const startSessionCss = "/html/body/div[2]/div/main/div/div[3]/div/button";

    const stopSessionCss = "body > div.h-screen.w-screen.flex.items-center.justify-center.bg-surface-z-0-GD > div > main > div > div.p-6.w-full.flex.\[\&\>\*\]\:flex-1.gap-2.border-t.border-gray-200 > div > button";

    while(true) {
      const countDownElement = await driver.wait(until.elementLocated(By.xpath(countDownCss)), 10000);
      const startSessionElement = await driver.wait(until.elementLocated(By.xpath(startSessionCss)), 10000);

      const countDownText = await countDownElement.getText();
      const startSessionText = await startSessionElement.getText();

      console.log(`countDownText: ${countDownText}, startSessionText: ${startSessionText}`);

      if (countDownText == "00:00:00" || startSessionText == "Start session") {
        console.log("\t❌ 任务中断, 刷新重启.....");
        await driver.navigate().refresh();

        const startSessionElement = await driver.wait(until.elementLocated(By.xpath(startSessionCss)), 10000);
        await startSessionElement.click();
      }

      // 每10s钟检查一次是否已经停了
      await new Promise((resolve) => setTimeout(resolve, 10000));
    }
  } catch (error) {
    console.error("Error during automation:", error);
    throw error;
  } finally {
    await driver.quit();
  }
}

