# Selenium Automation (TypeScript)

A minimal Selenium automation scaffold in TypeScript. Each run launches a fresh Chrome instance with a unique user data directory.

## Prerequisites

- Node.js 18+
- Google Chrome installed

## Setup

```bash
npm install
```

## Run (dev)

```bash
npm run dev -- https://example.com
```

- Default URL is `https://example.com` if omitted.
- Headless mode:

```bash
HEADLESS=1 npm run dev -- https://example.com
```

**Note**: Extensions can be manually installed after Chrome opens. Open `chrome://extensions/`, enable "Developer mode", and click "Load unpacked" to install your extension.

## Build and Run

```bash
npm run build
npm start -- https://example.com
```

## Structure

- `src/index.ts` — CLI entry
- `src/selenium.ts` — Selenium setup and routine

## Behavior

Each execution creates a new Chrome profile in the temp folder and quits the browser when finished, ensuring a clean, isolated session per run.
