import { rm } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import { join } from "node:path";

import next from "next";
import { expect, type BrowserContext, test as base } from "@playwright/test";

import {
  PREVIEW_EDUCATION_STORAGE_KEY,
  PREVIEW_EDUCATION_VERSION,
} from "../../src/lib/preview-education.ts";
import { TERMINAL_MODE_STORAGE_KEY } from "../../src/lib/terminal-mode.ts";

export const PREVIEW_CHIP = "Public preview · illustrative data · no mainnet funds";
export const LANDING_HERO_HEADING = "Native ZEC. Native stables. No platform balance.";
export const OPEN_TERMINAL_CTA = "Open terminal";

const host = "127.0.0.1";

type WorkerFixtures = {
  persistentContext: BrowserContext;
  serverUrl: string;
};

function listenOnFreePort(server: Server): Promise<number> {
  return new Promise((resolve, reject) => {
    const onError = (error: NodeJS.ErrnoException) => {
      server.off("error", onError);
      reject(error);
    };
    server.once("error", onError);
    server.listen(0, host, () => {
      server.off("error", onError);
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("Production fixture server did not bind a TCP port"));
        return;
      }
      resolve(address.port);
    });
  });
}

export const test = base.extend<object, WorkerFixtures>({
  serverUrl: [async ({}, run) => {
    const app = next({ dev: false, dir: process.cwd(), hostname: host, port: 0 });
    let server: Server | undefined;

    try {
      await app.prepare();
      const handle = app.getRequestHandler();
      server = createServer((request, response) => {
        void handle(request, response).catch((error: unknown) => {
          response.destroy(error instanceof Error ? error : new Error(String(error)));
        });
      });
      const port = await listenOnFreePort(server);
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
    await context.addInitScript(
      ({ educationKey, educationVersion, modeKey }) => {
        window.localStorage.setItem(educationKey, educationVersion);
        window.localStorage.setItem(modeKey, "advanced");
      },
      {
        educationKey: PREVIEW_EDUCATION_STORAGE_KEY,
        educationVersion: PREVIEW_EDUCATION_VERSION,
        modeKey: TERMINAL_MODE_STORAGE_KEY,
      },
    );
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
