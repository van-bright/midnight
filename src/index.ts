import { runAutomation } from "./selenium";

async function main(): Promise<void> {
  const urlFromArg = process.argv[2];
  const url = urlFromArg ?? "https://example.com";
  const headless = process.env.HEADLESS === "1" || process.env.HEADLESS === "true";

  console.log(`Starting automation for URL: ${url}`);
  console.log(`Headless mode: ${headless ? "enabled" : "disabled"}`);

  await runAutomation({ url, headless });

  console.log("Automation completed successfully");
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

