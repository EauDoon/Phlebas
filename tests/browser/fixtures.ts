import { rm } from "node:fs/promises";
import { createServer } from "node:http";
import { join } from "node:path";

import next from "next";
import { expect, type BrowserContext, test as base } from "@playwright/test";

const host = "127.0.0.1";
const port = 3108;

type WorkerFixtures = {
  persistentContext: BrowserContext;
  serverUrl: string;
};

export const test = base.extend<object, WorkerFixtures>({
  serverUrl: [async ({}, run) => {
    const app = next({ dev: false, dir: process.cwd(), hostname: host, port });
    let server: ReturnType<typeof createServer> | undefined;

    try {
      await app.prepare();
      const handle = app.getRequestHandler();
      server = createServer((request, response) => {
        void handle(request, response).catch((error: unknown) => {
          response.destroy(error instanceof Error ? error : new Error(String(error)));
        });
      });
      const listeningServer = server;

      await new Promise<void>((resolve, reject) => {
        listeningServer.once("error", reject);
        listeningServer.listen(port, host, () => {
          listeningServer.off("error", reject);
          resolve();
        });
      });

      await run(`http://${host}:${port}`);
    } finally {
      if (server?.listening) {
        const listeningServer = server;
        listeningServer.closeAllConnections();
        await new Promise<void>((resolve, reject) => {
          listeningServer.close((error) => error ? reject(error) : resolve());
        });
      }
      await app.close();
    }
  }, { scope: "worker" }],
  persistentContext: [async ({ playwright, serverUrl }, run, workerInfo) => {
    const profilePath = join(
      workerInfo.project.outputDir,
      `browser-profile-${workerInfo.workerIndex}`,
    );
    await rm(profilePath, { force: true, recursive: true, maxRetries: 2, retryDelay: 100 });

    const context = await playwright.chromium.launchPersistentContext(profilePath, {
      baseURL: serverUrl,
      headless: true,
    });
    for (const page of context.pages()) {
      await page.close();
    }

    try {
      await run(context);
    } finally {
      await context.close();
      await rm(profilePath, { force: true, recursive: true, maxRetries: 2, retryDelay: 100 });
    }
  }, { scope: "worker" }],
  page: async ({ persistentContext, viewport }, run) => {
    const page = await persistentContext.newPage();
    if (viewport) {
      await page.setViewportSize(viewport);
    }

    try {
      await run(page);
    } finally {
      await page.close();
    }
  },
});

export { expect };
