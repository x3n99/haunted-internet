import { expect, test } from "@playwright/test";

async function bootArchive(page: import("@playwright/test").Page) {
  await page.goto("/");
  await page.getByRole("button", { name: /SKIP INITIALIZATION/ }).click();
  await page.locator(".archive-desktop").waitFor();
}

test("clues lead through decryption to the final decision", async ({
  page,
}) => {
  await bootArchive(page);

  await expect(page.locator("#investigationProgress")).toHaveText(
    "CLUES RECOVERED: 0 / 3",
  );
  await expect(page.locator("#surveillanceFeed")).toHaveAttribute(
    "data-clues",
    "0",
  );
  await expect(page.locator("#investigationMessage")).toHaveText(
    "OPEN MY FILES AND INSPECT README.TXT.",
  );

  await page.locator('[data-open="window-files"]').click();
  await expect
    .poll(() =>
      page.locator("#window-files").evaluate((windowElement) => {
        const windowRect = windowElement.getBoundingClientRect();
        const desktopRect =
          windowElement.parentElement!.getBoundingClientRect();
        return {
          offsetX: Math.round(
            windowRect.left +
              windowRect.width / 2 -
              desktopRect.left -
              desktopRect.width / 2,
          ),
          offsetY: Math.round(
            windowRect.top +
              windowRect.height / 2 -
              desktopRect.top -
              desktopRect.height / 2,
          ),
        };
      }),
    )
    .toEqual({ offsetX: 0, offsetY: 0 });
  await page.locator('[data-file="readme"]').click();
  await expect(page.locator("#investigationProgress")).toHaveText(
    "CLUES RECOVERED: 1 / 3",
  );
  await page.locator('[data-file="incident"]').click();
  await page.locator('[data-open="window-events"]').click();
  await expect(page.locator("#investigationProgress")).toHaveText(
    "CLUES RECOVERED: 3 / 3",
  );
  await expect(page.locator("#surveillanceFeed")).toHaveAttribute(
    "data-clues",
    "3",
  );

  await page.locator('[data-open="window-terminal"]').click();
  await page.locator("#terminalInput").fill("decrypt 0317");
  await page.locator("#terminalInput").press("Enter");
  await expect(page.locator("#window-files")).toBeVisible();
  await expect(page.locator("#window-terminal")).toBeHidden();

  await page.locator("#secretDirectory").click();
  await page.getByRole("button", { name: /FINAL DECISION/ }).click();
  await expect(page.locator(".ending-choice")).toHaveCount(3);
});

test("settings support reduced motion and export/import progress", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await bootArchive(page);
  await page.getByRole("button", { name: /SETTINGS/ }).click();

  const jumpscareButton = page
    .locator(".horror-actions:not(.backup-actions) button")
    .nth(1);
  await expect(jumpscareButton).toHaveText("JUMPSCARES: OFF (REDUCED MOTION)");
  await jumpscareButton.click();
  await expect(jumpscareButton).toHaveText("JUMPSCARES: ON (OVERRIDE)");

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "EXPORT PROGRESS" }).click();
  const download = await downloadPromise;
  const backupPath = await download.path();
  expect(backupPath).toBeTruthy();

  const exported = JSON.parse(
    await (await import("node:fs/promises")).readFile(backupPath!, "utf8"),
  ) as {
    app: string;
    local: Record<string, string>;
  };
  expect(exported.app).toBe("HAUNTED://NET");
  expect(exported.local.hauntedNetJumpscares).toBe("true");

  await page.evaluate(() => localStorage.setItem("unrelatedAppData", "keep"));
  const importedBackup = {
    app: "HAUNTED://NET",
    version: 1,
    exportedAt: "2026-10-16T00:00:00.000Z",
    local: {
      hauntedNetClues: '["readme","incident"]',
      hauntedNetJumpscares: "false",
      hauntedNetAudio: "false",
    },
    session: { hauntedNetEntityActions: "5" },
  };
  const reload = page.waitForEvent("load");
  await page.locator('input[type="file"]').setInputFiles({
    name: "haunted-net-progress.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(importedBackup)),
  });
  await reload;
  await page.getByRole("button", { name: /SKIP INITIALIZATION/ }).click();
  await page.locator(".archive-desktop").waitFor();

  await expect(page.locator("#investigationProgress")).toHaveText(
    "CLUES RECOVERED: 2 / 3",
  );
  await expect(page.locator("#investigationMessage")).toHaveText(
    "OPEN EVENT LOG TO RECOVER ITS CLUE.",
  );
  await expect
    .poll(() =>
      page.evaluate(() => ({
        jumpscares: localStorage.getItem("hauntedNetJumpscares"),
        audio: localStorage.getItem("hauntedNetAudio"),
        actions: sessionStorage.getItem("hauntedNetEntityActions"),
        unrelated: localStorage.getItem("unrelatedAppData"),
      })),
    )
    .toEqual({
      jumpscares: "false",
      audio: "false",
      actions: "5",
      unrelated: "keep",
    });
});

test("mobile rotation fallback leaves the fullscreen exit control usable", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.evaluate(() => {
    Object.defineProperty(screen.orientation, "lock", {
      configurable: true,
      value: async () => {
        throw new Error("Orientation locking is unavailable.");
      },
    });
  });

  await page.getByRole("button", { name: /SKIP INITIALIZATION/ }).click();
  await page.locator(".archive-desktop").waitFor();
  await expect(page.locator("#bootScreen")).toHaveClass(
    /orientation-lock-unavailable/,
  );
  await expect(page.locator(".rotate-hint")).toBeVisible();

  await page.locator("#fullscreenToggle").click();
  await expect(page.locator("#fullscreenToggle")).toHaveText("⛶ FULLSCREEN");
  await expect(page.locator(".rotate-hint")).toBeHidden();
});
