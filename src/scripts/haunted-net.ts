import gsap from "gsap";
import { createEndingSequences } from "./ending-sequences";
import {
  createProgressBackup,
  parseProgressBackup,
  restoreProgressBackup,
} from "./progress-backup";

function createSafeStorage(kind: "local" | "session") {
  const memory = new Map<string, string>();
  let backend: Storage | null | undefined;
  let warned = false;

  function getBackend(): Storage | null {
    if (backend !== undefined) return backend;

    try {
      backend = kind === "local" ? window.localStorage : window.sessionStorage;
    } catch (error) {
      backend = null;
      console.warn(
        `${kind}Storage is unavailable; progress will last for this page session.`,
        error,
      );
    }

    return backend;
  }

  function disableBackend(error: unknown) {
    backend = null;
    if (warned) return;
    warned = true;
    console.warn(
      `${kind}Storage failed; progress will last for this page session.`,
      error,
    );
  }

  return {
    getItem(key: string): string | null {
      const storage = getBackend();
      if (!storage) return memory.get(key) ?? null;

      try {
        return storage.getItem(key);
      } catch (error) {
        disableBackend(error);
        return memory.get(key) ?? null;
      }
    },
    setItem(key: string, value: string): void {
      memory.set(key, value);
      const storage = getBackend();
      if (!storage) return;

      try {
        storage.setItem(key, value);
      } catch (error) {
        disableBackend(error);
      }
    },
    removeItem(key: string): void {
      memory.delete(key);
      const storage = getBackend();
      if (!storage) return;

      try {
        storage.removeItem(key);
      } catch (error) {
        disableBackend(error);
      }
    },
  };
}

const localStorage = createSafeStorage("local");
const sessionStorage = createSafeStorage("session");

const bootScreen = document.querySelector<HTMLElement>("#bootScreen")!;
const bootContent = document.querySelector<HTMLElement>("#bootContent")!;
const bootLog = document.querySelector<HTMLElement>("#bootLog")!;
const progressFill = document.querySelector<HTMLElement>("#progressFill")!;
const progressText = document.querySelector<HTMLElement>("#progressText")!;
const progressPercent =
  document.querySelector<HTMLElement>("#progressPercent")!;
const progressTrack = document.querySelector<HTMLElement>("#progressTrack")!;
const skipBoot = document.querySelector<HTMLButtonElement>("#skipBoot")!;
const transitionMessage =
  document.querySelector<HTMLElement>("#transitionMessage")!;

type LegacyFullscreenDocument = Document & {
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => Promise<void> | void;
};

type LegacyFullscreenElement = HTMLElement & {
  webkitRequestFullscreen?: () => Promise<void> | void;
};

const legacyFullscreenDocument = document as LegacyFullscreenDocument;
const mobileViewport = window.matchMedia(
  "(max-width: 768px), (pointer: coarse)",
);

async function lockLandscapeOnMobile() {
  if (!mobileViewport.matches) return;

  try {
    if (typeof screen.orientation?.lock !== "function") {
      throw new Error("Screen orientation locking is not supported.");
    }

    await screen.orientation.lock("landscape");
    bootScreen.classList.remove("orientation-lock-unavailable");
  } catch (error) {
    if (getFullscreenElement()) {
      bootScreen.classList.add("orientation-lock-unavailable");
    }
    console.info(
      "Automatic landscape orientation is unavailable; rotate the device manually.",
      error,
    );
  }
}

function unlockScreenOrientation() {
  screen.orientation?.unlock();
  bootScreen.classList.remove("orientation-lock-unavailable");
}

function getFullscreenElement() {
  return (
    document.fullscreenElement ??
    legacyFullscreenDocument.webkitFullscreenElement ??
    null
  );
}

function updateFullscreenButton() {
  const button = document.querySelector<HTMLButtonElement>("#fullscreenToggle");
  if (!button) return;

  const isFullscreen = getFullscreenElement() !== null;
  button.textContent = isFullscreen ? "⛶ EXIT FULLSCREEN" : "⛶ FULLSCREEN";
  button.setAttribute("aria-pressed", String(isFullscreen));
  button.removeAttribute("title");
}

let fullscreenTransition = false;

async function enterFullscreen() {
  if (fullscreenTransition) return;
  fullscreenTransition = true;

  const button = document.querySelector<HTMLButtonElement>("#fullscreenToggle");
  let succeeded = false;

  try {
    const root = document.documentElement as LegacyFullscreenElement;
    const requestFullscreen =
      root.requestFullscreen?.bind(root) ??
      root.webkitRequestFullscreen?.bind(root);

    if (!getFullscreenElement() && requestFullscreen) {
      await requestFullscreen();
      succeeded = true;
      void lockLandscapeOnMobile();
    } else if (!getFullscreenElement()) {
      if (button) {
        button.textContent = "FULLSCREEN UNAVAILABLE";
        button.title = "Fullscreen controls are not supported by this browser.";
      }
      console.warn("Fullscreen mode is not supported by this browser.");
    } else {
      succeeded = true;
      void lockLandscapeOnMobile();
    }
  } catch (error) {
    if (button) {
      button.textContent = "FULLSCREEN UNAVAILABLE";
      button.title =
        "Use Escape to leave fullscreen, or check whether this browser allows fullscreen controls.";
    }
    console.warn(
      "Fullscreen could not be changed. The browser may have blocked the request.",
      error,
    );
  } finally {
    fullscreenTransition = false;
    if (succeeded) updateFullscreenButton();
  }
}

async function exitFullscreen() {
  if (fullscreenTransition || !getFullscreenElement()) return;
  fullscreenTransition = true;

  const button = document.querySelector<HTMLButtonElement>("#fullscreenToggle");
  let succeeded = false;

  try {
    const exitFullscreen =
      document.exitFullscreen?.bind(document) ??
      legacyFullscreenDocument.webkitExitFullscreen?.bind(document);
    if (!exitFullscreen) {
      throw new Error("Fullscreen exit is not supported by this browser.");
    }

    await exitFullscreen();
    if (getFullscreenElement()) {
      throw new Error("The browser kept the document in fullscreen mode.");
    }
    unlockScreenOrientation();
    succeeded = true;
  } catch (error) {
    if (button) {
      button.textContent = "PRESS ESC TO EXIT";
      button.title =
        "The browser did not exit fullscreen. Press Escape or use the browser fullscreen shortcut.";
    }
    console.warn("Fullscreen could not be exited by the page control.", error);
  } finally {
    fullscreenTransition = false;
    if (succeeded) updateFullscreenButton();
  }
}

async function toggleFullscreen() {
  if (getFullscreenElement()) {
    await exitFullscreen();
  } else {
    await enterFullscreen();
  }
}

let initialFullscreenAttempted = false;
function requestFullscreenOnFirstGesture() {
  if (initialFullscreenAttempted) return;
  initialFullscreenAttempted = true;
  if (!getFullscreenElement()) void toggleFullscreen();
}

function handleFullscreenChange() {
  fullscreenTransition = false;
  if (!getFullscreenElement()) unlockScreenOrientation();
  updateFullscreenButton();
}

document.addEventListener("fullscreenchange", handleFullscreenChange);
document.addEventListener("webkitfullscreenchange", handleFullscreenChange);
document.addEventListener("fullscreenerror", handleFullscreenChange);
document.addEventListener("webkitfullscreenerror", handleFullscreenChange);

document.addEventListener("pointerdown", requestFullscreenOnFirstGesture, {
  once: true,
});
document.addEventListener("keydown", requestFullscreenOnFirstGesture, {
  once: true,
});

const lines = [
  { text: "BIOS DATE: 10/13/1999", status: "OK" },
  { text: "CHECKING MEMORY", status: "640K OK" },
  { text: "MOUNTING LOCAL ARCHIVE", status: "OK" },
  { text: "RESTORING LOST DIRECTORY", status: "WARNING" },
  { text: "UNKNOWN PROCESS DETECTED", status: "ERROR" },
  { text: "PROCESS CANNOT BE TERMINATED", status: "..." },
];

let completed = false;
let currentLine = 0;
let progress = { value: 0 };
let timeline: gsap.core.Timeline | null = null;

function addLogLine(text: string, status: string, isError = false) {
  const row = document.createElement("div");
  row.className = `log-line${isError ? " log-error" : ""}`;

  const message = document.createElement("span");
  message.textContent = text;

  const result = document.createElement("span");
  result.className = "log-status";
  result.textContent = status;

  row.append(message, result);
  bootLog.appendChild(row);

  gsap.fromTo(
    row,
    { opacity: 0, x: -8 },
    { opacity: 1, x: 0, duration: 0.25, ease: "power2.out" },
  );
}

function updateProgress() {
  progressPercent.textContent = `${Math.round(progress.value).toString().padStart(2, "0")}%`;

  progressFill.style.width = `${progress.value}%`;
  progressTrack.setAttribute(
    "aria-valuenow",
    String(Math.round(progress.value)),
  );

  if (progress.value < 35) {
    progressText.textContent = "INITIALIZING SYSTEM";
  } else if (progress.value < 70) {
    progressText.textContent = "MOUNTING ARCHIVE";
  } else {
    progressText.textContent = "RESTORING CONNECTION";
  }
}

function finishBoot() {
  if (completed) return;
  completed = true;

  timeline?.kill();
  gsap.killTweensOf(progress);

  progress.value = 100;
  updateProgress();

  if (currentLine < lines.length) {
    for (; currentLine < lines.length; currentLine++) {
      const line = lines[currentLine];
      addLogLine(
        line.text,
        line.status,
        line.status === "ERROR" || line.status === "...",
      );
    }
  }

  skipBoot.disabled = true;

  const reveal = gsap.timeline();

  reveal
    .to(bootContent, {
      opacity: 0,
      duration: 0.35,
      ease: "power2.in",
    })
    .set(transitionMessage, { display: "block" })
    .fromTo(transitionMessage, { opacity: 0 }, { opacity: 1, duration: 0.4 })
    .to(bootScreen, {
      opacity: 0,
      duration: 0.65,
      delay: 1.8,
      ease: "power2.inOut",
      onComplete: () => {
        // Placeholder for the archive desktop in the next step.

        bootScreen.innerHTML = `
          <div class="archive-desktop">
              <div class="desktop-scanlines" aria-hidden="true"></div>

              <header class="desktop-topbar">
              <span class="desktop-brand">HAUNTED://NET</span>
              <span>ARCHIVE NODE 07</span>
              <span class="desktop-status"><i></i> CONNECTION UNSTABLE</span>
              <button class="fullscreen-toggle" id="fullscreenToggle" type="button" aria-pressed="false">⛶ FULLSCREEN</button>
              </header>

              <section class="desktop-icons" aria-label="Desktop applications">
              <button class="desktop-icon" data-open="window-files">
                  <span class="app-icon folder-icon">▰</span>
                  <span>MY FILES</span>
              </button>
              <button class="desktop-icon" data-open="window-terminal">
                  <span class="app-icon terminal-icon">&gt;_</span>
                  <span>TERMINAL</span>
              </button>
              <button class="desktop-icon" data-open="window-monitor">
                  <span class="app-icon monitor-icon">▥</span>
                  <span>SYSTEM MONITOR</span>
              </button>
              <button class="desktop-icon" data-open="window-events">
                  <span class="app-icon events-icon">▤</span>
                  <span>EVENT LOG</span>
              </button>
              </section>

              <div
                class="surveillance-feed"
                id="surveillanceFeed"
                data-clues="0"
                aria-hidden="true"
              >
                <div class="surveillance-heading">
                  <span>CAM 07 / ARCHIVE HALL</span>
                  <span class="feed-state">SIGNAL LOST</span>
                </div>
                <div class="surveillance-screen">
                  <span class="surveillance-figure"></span>
                  <span class="feed-timestamp">03:17:--</span>
                </div>
              </div>
      
              <div class="desktop-warning">
                  <span class="warning-symbol">!</span>
                  <div>
                      <strong>UNRECOVERED DIRECTORY DETECTED</strong>
                      <p>Some files may not belong to this system.</p>
                      <p>Jumpscares may appear. Disable them in SETTINGS.</p>
                      <p id="investigationProgress" role="status" aria-live="polite">CLUES RECOVERED: 0 / 3</p>
                      <ol class="clue-checklist" id="clueChecklist" aria-label="Investigation clues">
                        <li data-clue="readme">README.TXT</li>
                        <li data-clue="incident">INCIDENT_07.LOG</li>
                        <li data-clue="eventlog">EVENT LOG</li>
                      </ol>
                      <p id="investigationMessage" role="status" aria-live="polite">Open MY FILES and inspect README.TXT.</p>
                  </div>
              </div>

              <section class="desktop-window" id="window-files" hidden>
              <header class="window-titlebar">
                  <span>MY FILES — C:\\ARCHIVE</span>
                  <button class="window-close" aria-label="Close window">×</button>
              </header>
              <div class="window-body file-list">
                  <button class="file-entry" data-file="readme">
                      <span>▤</span><span>README.TXT</span><small>1 KB</small>
                  </button>
                  <button class="file-entry" data-file="incident">
                      <span>▤</span><span>INCIDENT_07.LOG</span><small>4 KB</small>
                  </button>
                  <button class="file-entry" data-file="unknown">
                      <span class="file-corrupt">▧</span><span>UNKNOWN.DAT</span><small>???</small>
                  </button>			
                  <button class="file-entry" id="secretDirectory" hidden>
                      <span>▰</span><span>DIRECTORY_0</span><small>LOCKED</small>
                  </button>
                  <div class="file-preview" id="filePreview">
                      Select a file to inspect its contents.
                  </div>
              </div>
              </section>

              <section class="desktop-window terminal-window" id="window-terminal" hidden>
              <header class="window-titlebar">
                  <span>NODE 07 — TERMINAL</span>
                  <button class="window-close" aria-label="Close window">×</button>
              </header>
              <div class="window-body terminal-body">
                  <div class="terminal-output" id="terminalOutput">
                  <p>HAUNTED://NET [Version 0.99.7]</p>
                  <p>Type <span>help</span> to list available commands.</p>
                  </div>
                  <form class="terminal-form" id="terminalForm">
                  <label for="terminalInput">C:\\ARCHIVE&gt;</label>
                  <input id="terminalInput" autocomplete="off" spellcheck="false" aria-label="Terminal command" />
                  </form>
              </div>
              </section>

              <section class="desktop-window" id="window-monitor" hidden>
              <header class="window-titlebar">
                  <span>SYSTEM MONITOR</span>
                  <button class="window-close" aria-label="Close window">×</button>
              </header>
              <div class="window-body monitor-body">
                  <p>ARCHIVE NODE STATUS</p>
                  <div class="monitor-row"><span>MEMORY</span><strong>87%</strong></div>
                  <div class="monitor-track"><span style="width:87%"></span></div>
                  <div class="monitor-row"><span>CPU ACTIVITY</span><strong>12%</strong></div>
                  <div class="monitor-track"><span style="width:12%"></span></div>
                  <div class="monitor-row"><span>UNKNOWN PROCESS</span><strong class="danger-text">RUNNING</strong></div>
                  <div class="monitor-track danger-track"><span style="width:100%"></span></div>
                  <p class="monitor-warning">WARNING: PROCESS HAS NO IDENTIFIABLE OWNER.</p>
              </div>
              </section>

              <section class="desktop-window" id="window-events" hidden>
              <header class="window-titlebar">
                  <span>EVENT LOG — LAST SESSION</span>
                  <button class="window-close" aria-label="Close window">×</button>
              </header>
              <div class="window-body event-list" id="eventList">
                  <p><time>03:17:02</time> Archive mounted successfully.</p>
                  <p><time>03:17:04</time> User session restored.</p>
                  <p class="danger-text"><time>03:17:09</time> Unknown process detected.</p>
                  <p class="danger-text"><time>03:17:10</time> A second user session was detected.</p>
              </div>
              </section>

              <footer class="desktop-taskbar">
              <span class="taskbar-start">▦ SYSTEM</span>
              <span>NODE 07 / LOCAL ARCHIVE</span>
              <span class="taskbar-clock">03:17 AM</span>
              </footer>
              <div class="rotate-hint" role="status">
                <strong>ROTATE YOUR DEVICE</strong>
                <span>Your browser does not allow automatic rotation. Turn your device sideways to continue.</span>
              </div>
          </div>
          `;

        gsap.set(bootScreen, { opacity: 1 });
        bootScreen
          .querySelector<HTMLButtonElement>("#fullscreenToggle")
          ?.addEventListener("click", () => {
            if (getFullscreenElement()) {
              void exitFullscreen();
            } else {
              void enterFullscreen();
            }
          });
        updateFullscreenButton();

        const desktop =
          bootScreen.querySelector<HTMLElement>(".archive-desktop");
        gsap.from(desktop, {
          opacity: 0,
          scale: 1.025,
          duration: 0.8,
          ease: "power2.out",
        });

        const openWindow = (id: string) => {
          const win = bootScreen.querySelector<HTMLElement>(`#${id}`);
          if (!win) return;

          bootScreen
            .querySelectorAll<HTMLElement>(".desktop-window")
            .forEach((openWin) => {
              if (openWin !== win) openWin.hidden = true;
            });

          win.hidden = false;
          if (id === "window-events") {
            discoverClue("eventlog");
          }
          gsap.fromTo(
            win,
            {
              opacity: 0,
              xPercent: -50,
              yPercent: -50,
              y: 8,
              scale: 0.98,
            },
            {
              opacity: 1,
              xPercent: -50,
              yPercent: -50,
              y: 0,
              scale: 1,
              duration: 0.2,
              ease: "power2.out",
            },
          );

          if (id === "window-terminal") {
            bootScreen
              .querySelector<HTMLInputElement>("#terminalInput")
              ?.focus();
          }
        };

        bootScreen
          .querySelectorAll<HTMLButtonElement>("[data-open]")
          .forEach((button) => {
            button.addEventListener("click", () => {
              const id = button.dataset.open;
              if (id) openWindow(id);
            });
          });

        bootScreen
          .querySelectorAll<HTMLButtonElement>(".window-close")
          .forEach((button) => {
            button.addEventListener("click", () => {
              const win = button.closest<HTMLElement>(".desktop-window");
              if (win) win.hidden = true;
            });
          });

        const filePreview =
          bootScreen.querySelector<HTMLElement>("#filePreview");
        const investigationProgress = bootScreen.querySelector<HTMLElement>(
          "#investigationProgress",
        );
        const surveillanceFeed =
          bootScreen.querySelector<HTMLElement>("#surveillanceFeed");
        const investigationMessage = bootScreen.querySelector<HTMLElement>(
          "#investigationMessage",
        );
        const clueChecklist =
          bootScreen.querySelector<HTMLOListElement>("#clueChecklist");
        const secretDirectory =
          bootScreen.querySelector<HTMLButtonElement>("#secretDirectory");

        const clueDefinitions = {
          readme: {
            id: "readme",
            content:
              "README.TXT\n\nWelcome back, operator.\n\nIf you are reading this, the restoration process completed successfully.\n\nWARNING: THE SYSTEM CLOCK IS NOT TRUSTWORTHY.\n\nRecovered clue: TIME = 0317",
          },
          incident: {
            id: "incident",
            content:
              "INCIDENT_07.LOG\n\n03:17:02 — Archive mounted.\n03:17:04 — User session restored.\n03:17:09 — Unknown process detected.\n03:17:10 — SECOND USER SESSION DETECTED.\n\nRecovered clue: SESSION COUNT = 2",
          },
          unknown: {
            id: "unknown",
            content:
              "UNKNOWN.DAT\n\nACCESS DENIED.\n\nRecover the other clues first, then use the terminal to decrypt this file.",
          },
        };

        const fileContents = {
          readme: clueDefinitions.readme.content,
          incident: clueDefinitions.incident.content,
          unknown: clueDefinitions.unknown.content,
        };

        const unknownSecretContents =
          "UNKNOWN.DAT — DECRYPTED\n\n" +
          "ARCHIVE RECORD: 1999\n" +
          "STATUS: RECOVERED FRAGMENT\n\n" +
          "A second user session was detected.\n" +
          "The account was deleted, but the session remained active.\n\n" +
          "The archive continued to receive requests after termination.\n\n" +
          "FINAL WARNING:\n" +
          '"If the system says you are alone, do not believe it."\n\n' +
          "SESSION STATUS: STILL ACTIVE.";

        function isFileKey(key: string): key is keyof typeof fileContents {
          return Object.prototype.hasOwnProperty.call(fileContents, key);
        }

        const clueKeys = ["readme", "incident", "eventlog"] as const;
        type ClueKey = (typeof clueKeys)[number];
        const foundClues = new Set<ClueKey>();

        function isClueKey(key: string): key is ClueKey {
          return (clueKeys as readonly string[]).includes(key);
        }

        try {
          const savedClues = JSON.parse(
            localStorage.getItem("hauntedNetClues") || "[]",
          );

          if (Array.isArray(savedClues)) {
            savedClues.forEach((clue: unknown) => {
              if (typeof clue === "string" && isClueKey(clue)) {
                foundClues.add(clue);
              }
            });
          }
        } catch {
          localStorage.removeItem("hauntedNetClues");
        }

        let secretUnlocked =
          localStorage.getItem("hauntedNetSecretUnlocked") === "true";
        let unknownDecrypted =
          localStorage.getItem("hauntedNetUnknownDecrypted") === "true";
        let secretDirectoryOpened = false;

        // Prevent decrypted state from surviving without all three clues.
        if (foundClues.size < 3) {
          secretUnlocked = false;
          unknownDecrypted = false;

          localStorage.removeItem("hauntedNetSecretUnlocked");
          localStorage.removeItem("hauntedNetUnknownDecrypted");
        }

        function updateInvestigation() {
          const count = foundClues.size;
          const nextClue = clueKeys.find((key) => !foundClues.has(key));

          surveillanceFeed?.setAttribute("data-clues", String(count));

          if (investigationProgress) {
            investigationProgress.textContent = `CLUES RECOVERED: ${count} / 3`;
          }

          if (investigationMessage) {
            const nextSteps: Record<ClueKey, string> = {
              readme: "OPEN MY FILES AND INSPECT README.TXT.",
              incident: "OPEN MY FILES AND INSPECT INCIDENT_07.LOG.",
              eventlog: "OPEN EVENT LOG TO RECOVER ITS CLUE.",
            };

            investigationMessage.textContent = nextClue
              ? nextSteps[nextClue]
              : secretDirectoryOpened
                ? "DIRECTORY_0 RECOVERED. OPEN FINAL DECISION."
                : secretUnlocked
                  ? "DIRECTORY_0 IS UNLOCKED. OPEN IT IN MY FILES."
                  : "ALL CLUES FOUND. OPEN TERMINAL AND ENTER: decrypt 0317";
          }

          clueChecklist
            ?.querySelectorAll<HTMLLIElement>("[data-clue]")
            .forEach((item) => {
              const key = item.dataset.clue;
              if (!key || !isClueKey(key)) return;

              const found = foundClues.has(key);
              item.textContent = `${key === "readme" ? "README.TXT" : key === "incident" ? "INCIDENT_07.LOG" : "EVENT LOG"} — ${found ? "FOUND" : "NOT FOUND"}`;
              item.classList.toggle("clue-found", found);
              if (found) {
                item.removeAttribute("aria-current");
              } else if (key === nextClue) {
                item.setAttribute("aria-current", "step");
              } else {
                item.removeAttribute("aria-current");
              }
            });

          if (secretDirectory) {
            secretDirectory.hidden = count < 3;
            const label = secretDirectory.querySelector("small");
            if (label)
              label.textContent = secretUnlocked ? "UNLOCKED" : "LOCKED";
          }

          localStorage.setItem(
            "hauntedNetClues",
            JSON.stringify([...foundClues]),
          );
        }

        function discoverClue(key: ClueKey) {
          if (foundClues.has(key)) return;

          foundClues.add(key);
          triggerGlitch();
          updateInvestigation();

          const output =
            bootScreen.querySelector<HTMLElement>("#terminalOutput");
          if (output) {
            const notice = document.createElement("p");
            notice.className = "danger-text";
            notice.textContent = `[INVESTIGATION] Clue recovered: ${key.toUpperCase()}`;
            output.appendChild(notice);
          }
        }

        bootScreen
          .querySelectorAll<HTMLButtonElement>("[data-file]")
          .forEach((button) => {
            button.addEventListener("click", () => {
              const key = button.dataset.file;

              if (key === "readme" || key === "incident") {
                discoverClue(key);
              }

              if (filePreview) {
                if (key === "unknown" && unknownDecrypted) {
                  filePreview.textContent = unknownSecretContents;
                } else {
                  filePreview.textContent =
                    key && isFileKey(key)
                      ? fileContents[key]
                      : "FILE NOT FOUND.";
                }
              }

              if (key === "unknown" && foundClues.size >= 2) {
                if (jumpscareTimer !== null) {
                  window.clearTimeout(jumpscareTimer);
                }
                jumpscareTimer = window.setTimeout(triggerJumpscare, 1200);
              }
            });
          });

        const secretContents =
          "DIRECTORY_0 — RECOVERED DATA\n\n" +
          "You were not the first person to connect to this archive.\n\n" +
          "The second session belongs to an account that was deleted in 1999.\n\n" +
          "FINAL RECORD:\n" +
          '"If the system says you are alone, do not believe it."';

        secretDirectory?.addEventListener("click", () => {
          if (foundClues.size < 3) {
            if (filePreview) filePreview.textContent = "DIRECTORY LOCKED.";
            return;
          }

          if (!secretUnlocked) {
            if (filePreview) {
              filePreview.textContent =
                "DIRECTORY LOCKED.\n\nOpen TERMINAL and enter: decrypt 0317";
            }
            return;
          }

          secretDirectoryOpened = true;
          updateEndingAvailability();
          updateInvestigation();

          if (filePreview) filePreview.textContent = secretContents;
        });

        updateInvestigation();

        const terminalForm =
          bootScreen.querySelector<HTMLFormElement>("#terminalForm");
        const terminalInput =
          bootScreen.querySelector<HTMLInputElement>("#terminalInput");
        const terminalOutput =
          bootScreen.querySelector<HTMLElement>("#terminalOutput");

        terminalForm?.addEventListener("submit", (event) => {
          event.preventDefault();

          const input = terminalInput;
          const output = terminalOutput;
          if (!input || !output) return;

          const command = input.value.trim().toLowerCase();
          if (command === "open readme") {
            discoverClue("readme");
          } else if (command === "open incident") {
            discoverClue("incident");
          }
          if (!command) return;

          const echo = document.createElement("p");
          echo.textContent = `C:\\ARCHIVE> ${command}`;
          output.appendChild(echo);

          const response = document.createElement("p");

          const commands: Record<string, string> = {
            help: "COMMANDS: help, ls, clear, status, open readme, open incident, decrypt 0317",
            ls:
              foundClues.size >= 3
                ? "README.TXT  INCIDENT_07.LOG  UNKNOWN.DAT  DIRECTORY_0"
                : "README.TXT  INCIDENT_07.LOG  UNKNOWN.DAT",
            status: `NODE 07 ONLINE. UNKNOWN PROCESS RUNNING. CLUES: ${foundClues.size}/3`,
            "open readme": fileContents.readme,
            "open incident": fileContents.incident,
          };

          if (command === "clear") {
            output.replaceChildren();
          } else if (command === "decrypt 0317") {
            if (foundClues.size < 3) {
              response.textContent = `DECRYPTION FAILED. ONLY ${foundClues.size}/3 CLUES RECOVERED.`;
              response.classList.add("danger-text");
              output.appendChild(response);
            } else {
              secretUnlocked = true;
              unknownDecrypted = true;

              localStorage.setItem("hauntedNetSecretUnlocked", "true");
              localStorage.setItem("hauntedNetUnknownDecrypted", "true");

              updateInvestigation();

              response.textContent =
                "DECRYPTION SUCCESSFUL. UNKNOWN.DAT DECRYPTED. DIRECTORY_0 UNLOCKED.";
              output.appendChild(response);

              // The archive changes after the unknown file is decrypted.
              response.classList.add("danger-text");

              const takeoverMessages = [
                "[UNKNOWN PROCESS] DECRYPTION WAS NOT AUTHORIZED BY THE USER.",
                "[UNKNOWN PROCESS] I CAN SEE THE REST OF YOUR SESSION NOW.",
                "[UNKNOWN PROCESS] DIRECTORY_0 WAS NEVER LOCKED. IT WAS WAITING.",
              ];

              const takeoverMessage = document.createElement("p");
              takeoverMessage.className = "danger-text";
              takeoverMessage.textContent =
                takeoverMessages[
                  Math.floor(Math.random() * takeoverMessages.length)
                ];

              window.setTimeout(() => {
                if (!output.isConnected) return;

                output.appendChild(takeoverMessage);
                output.scrollTop = output.scrollHeight;
              }, 900);

              const filesWindow =
                bootScreen.querySelector<HTMLElement>("#window-files");

              if (filesWindow) openWindow("window-files");

              if (filePreview) {
                filePreview.textContent =
                  "UNKNOWN.DAT DECRYPTED.\n\nSelect UNKNOWN.DAT to inspect the recovered data.";
              }

              gsap.fromTo(
                bootScreen,
                { x: -3 },
                {
                  x: 3,
                  duration: 0.05,
                  repeat: 5,
                  yoyo: true,
                  clearProps: "x",
                },
              );

              if (horrorSettings.glitchesEnabled) {
                triggerGlitch();

                window.setTimeout(() => {
                  triggerGlitch();
                }, 350);

                window.setTimeout(() => {
                  triggerGlitch();
                }, 800);
              }

              if (jumpscareTimer !== null) {
                window.clearTimeout(jumpscareTimer);
              }

              jumpscareTimer = window.setTimeout(() => {
                jumpscareTimer = null;
                triggerJumpscare("decrypt");
              }, 500);
            }
          } else if (Object.prototype.hasOwnProperty.call(commands, command)) {
            response.textContent = commands[command];
            output.appendChild(response);
          } else {
            response.textContent = `UNKNOWN COMMAND: ${command}`;
            response.classList.add("danger-text");
            output.appendChild(response);
          }

          input.value = "";
          output.scrollTop = output.scrollHeight;
        });

        /* ===== HORROR ENGINE ===== */

        const reducedMotionQuery = window.matchMedia(
          "(prefers-reduced-motion: reduce)",
        );
        gsap.globalTimeline.timeScale(reducedMotionQuery.matches ? 100 : 1);
        const savedJumpscares = localStorage.getItem("hauntedNetJumpscares");
        let jumpscaresExplicitlyConfigured = savedJumpscares !== null;
        const horrorSettings = {
          glitchesEnabled:
            localStorage.getItem("hauntedNetGlitches") !== "false",
          jumpscaresEnabled:
            savedJumpscares === null
              ? !reducedMotionQuery.matches
              : savedJumpscares !== "false",
          audioEnabled: localStorage.getItem("hauntedNetAudio") !== "false",
          ending: localStorage.getItem("hauntedNetEnding") || "",
        };
        let replayEnding = false;

        /* ===== HAUNTED AUDIO ENGINE ===== */

        let audioContext: AudioContext | null = null;
        let masterGain: GainNode | null = null;
        let ambientStarted = false;

        function initializeAudio(): void {
          if (!horrorSettings.audioEnabled) return;

          const AudioContextClass = window.AudioContext;
          if (!AudioContextClass) return;

          if (!audioContext) {
            audioContext = new AudioContextClass();
            masterGain = audioContext.createGain();
            masterGain.gain.value = 0.35;
            masterGain.connect(audioContext.destination);
          }

          if (audioContext.state === "suspended") {
            void audioContext.resume();
          }

          if (ambientStarted || !masterGain || !audioContext) return;

          ambientStarted = true;

          const lowTone = audioContext.createOscillator();
          const highTone = audioContext.createOscillator();
          const lowGain = audioContext.createGain();
          const highGain = audioContext.createGain();

          lowTone.type = "sine";
          lowTone.frequency.value = 48;

          highTone.type = "triangle";
          highTone.frequency.value = 73;

          lowGain.gain.value = 0.12;
          highGain.gain.value = 0.025;

          lowTone.connect(lowGain);
          highTone.connect(highGain);
          lowGain.connect(masterGain);
          highGain.connect(masterGain);

          lowTone.start();
          highTone.start();
        }

        function playUiSound(frequency = 520, duration = 0.055): void {
          if (!horrorSettings.audioEnabled) return;

          initializeAudio();

          if (!audioContext || !masterGain) return;

          const oscillator = audioContext.createOscillator();
          const gain = audioContext.createGain();
          const now = audioContext.currentTime;

          oscillator.type = "sine";
          oscillator.frequency.setValueAtTime(frequency, now);

          gain.gain.setValueAtTime(0.0001, now);
          gain.gain.exponentialRampToValueAtTime(0.045, now + 0.008);
          gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

          oscillator.connect(gain);
          gain.connect(masterGain);

          oscillator.start(now);
          oscillator.stop(now + duration + 0.01);
        }

        function stopAudio(): void {
          if (masterGain && audioContext) {
            masterGain.gain.setTargetAtTime(0, audioContext.currentTime, 0.04);
          }
        }

        function enableAudio(): void {
          if (!audioContext || !masterGain) {
            initializeAudio();
            return;
          }

          void audioContext.resume();

          masterGain.gain.setTargetAtTime(0.35, audioContext.currentTime, 0.08);
        }

        // Browsers require a user interaction before audio can start.
        document.addEventListener(
          "pointerdown",
          () => {
            if (horrorSettings.audioEnabled) initializeAudio();
          },
          { once: true },
        );

        document.addEventListener(
          "keydown",
          () => {
            if (horrorSettings.audioEnabled) initializeAudio();
          },
          { once: true },
        );

        // Play a quiet sound when the user interacts with the interface.
        document.addEventListener("click", (event) => {
          const target = event.target;

          if (!(target instanceof Element)) return;

          const interactive = target.closest(
            "button, .desktop-icon, [data-file]",
          );

          if (interactive) playUiSound();
        });

        let jumpscareShown = false;
        let unknownDatJumpscareShown = false;
        let decryptJumpscareShown = false;
        let jumpscareTimer: number | null = null;
        let jumpscareHideTimer: number | undefined;
        let jumpscareReturnFocus: HTMLElement | null = null;

        const createElement = <Tag extends keyof HTMLElementTagNameMap>(
          tag: Tag,
          className: string,
          text = "",
        ): HTMLElementTagNameMap[Tag] => {
          const element = document.createElement(tag);
          element.className = className;
          if (text) element.textContent = text;
          return element;
        };

        const settingsButton = createElement("button", "desktop-icon", "");
        settingsButton.type = "button";
        settingsButton.innerHTML =
          '<span class="app-icon">⚙</span><span>SETTINGS</span>';

        bootScreen.querySelector(".desktop-icons")?.appendChild(settingsButton);

        const settingsOverlay = createElement("div", "horror-overlay");
        settingsOverlay.hidden = true;
        settingsOverlay.setAttribute("aria-label", "Accessibility settings");

        function configureDialog(dialog: HTMLElement, onEscape: () => void) {
          dialog.setAttribute("role", "dialog");
          dialog.setAttribute("aria-modal", "true");

          dialog.addEventListener("keydown", (event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              onEscape();
              return;
            }

            if (event.key !== "Tab") return;

            const focusable = Array.from(
              dialog.querySelectorAll<HTMLElement>(
                'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
              ),
            ).filter(
              (element) =>
                !element.hidden &&
                !element.closest("[hidden]") &&
                element.getAttribute("aria-hidden") !== "true",
            );

            if (focusable.length === 0) {
              event.preventDefault();
              dialog.focus();
              return;
            }

            const first = focusable[0];
            const last = focusable[focusable.length - 1];

            const activeElement = document.activeElement;
            const activeIndex =
              activeElement instanceof HTMLElement
                ? focusable.indexOf(activeElement)
                : -1;

            if (activeIndex === -1) {
              event.preventDefault();
              (event.shiftKey ? last : first).focus();
            } else if (event.shiftKey && activeIndex === 0) {
              event.preventDefault();
              last.focus();
            } else if (
              !event.shiftKey &&
              activeIndex === focusable.length - 1
            ) {
              event.preventDefault();
              first.focus();
            }
          });
        }

        function focusDialogHeading(dialog: HTMLElement) {
          const heading = dialog.querySelector<HTMLElement>("h1, h2");
          if (!heading) return;
          heading.tabIndex = -1;
          heading.focus();
        }

        let settingsOpener: HTMLElement | null = null;

        const settingsPanel = createElement("div", "horror-panel");
        settingsPanel.innerHTML = `
          <span class="horror-eyebrow">NODE 07 / ACCESSIBILITY</span>
          <h2>SETTINGS</h2>
          <p>Jumpscares use a sudden full-screen image. They are off by default when reduced motion is enabled; you can choose to override that preference here.</p>
          <section class="progress-backup" aria-labelledby="progressBackupTitle">
            <h3 id="progressBackupTitle">PROGRESS BACKUP</h3>
              <p>Progress and settings are saved only in this browser. Clearing its site data removes them. If browser storage is blocked, progress lasts only until this page closes. Export a backup to keep a copy or move progress to another device. Nothing is uploaded.</p>
          </section>
          `;

        const settingsActions = createElement("div", "horror-actions");

        const makeButton = (
          label: string,
          className: string,
          callback: (event: MouseEvent) => void,
        ) => {
          const button = createElement(
            "button",
            `horror-button ${className || ""}`,
            label,
          );
          button.type = "button";
          button.addEventListener("click", callback);
          return button;
        };

        const glitchButton = makeButton("", "", () => {
          horrorSettings.glitchesEnabled = !horrorSettings.glitchesEnabled;
          localStorage.setItem(
            "hauntedNetGlitches",
            String(horrorSettings.glitchesEnabled),
          );
          updateSettingsLabels();
        });

        const jumpscareButton = makeButton("", "danger", () => {
          horrorSettings.jumpscaresEnabled = !horrorSettings.jumpscaresEnabled;
          jumpscaresExplicitlyConfigured = true;
          localStorage.setItem(
            "hauntedNetJumpscares",
            String(horrorSettings.jumpscaresEnabled),
          );
          updateSettingsLabels();
        });

        const audioButton = makeButton("", "", () => {
          horrorSettings.audioEnabled = !horrorSettings.audioEnabled;

          localStorage.setItem(
            "hauntedNetAudio",
            String(horrorSettings.audioEnabled),
          );

          if (horrorSettings.audioEnabled) {
            enableAudio();
          } else {
            stopAudio();
          }

          updateSettingsLabels();
        });

        const backupStatus = createElement("p", "backup-status");
        backupStatus.setAttribute("role", "status");
        backupStatus.setAttribute("aria-live", "polite");

        const backupFileInput = createElement("input", "backup-file-input");
        backupFileInput.type = "file";
        backupFileInput.accept = "application/json,.json";
        backupFileInput.hidden = true;
        backupFileInput.setAttribute(
          "aria-label",
          "Choose a HAUNTED NET progress backup file",
        );

        const exportProgressButton = makeButton("EXPORT PROGRESS", "", () => {
          try {
            const contents = createProgressBackup(localStorage, sessionStorage);
            const url = URL.createObjectURL(
              new Blob([contents], { type: "application/json" }),
            );
            const link = createElement("a", "backup-download");
            link.href = url;
            link.download = `haunted-net-progress-${new Date().toISOString().slice(0, 10)}.json`;
            link.click();
            window.setTimeout(() => URL.revokeObjectURL(url), 1000);
            backupStatus.textContent =
              "Backup downloaded. Keep the file somewhere safe.";
          } catch (error) {
            backupStatus.textContent =
              "Could not export progress. Check browser download permissions.";
            console.error("Progress backup export failed.", error);
          }
        });

        const importProgressButton = makeButton("IMPORT PROGRESS", "", () =>
          backupFileInput.click(),
        );

        backupFileInput.addEventListener("change", async () => {
          const file = backupFileInput.files?.[0];
          if (!file) return;

          try {
            if (file.size > 256_000) {
              throw new Error("The backup file is too large.");
            }
            const contents = await file.text();
            const backup = parseProgressBackup(contents);
            restoreProgressBackup(
              backup,
              window.localStorage,
              window.sessionStorage,
            );
            backupStatus.textContent =
              "Backup restored. Reloading the archive…";
            window.setTimeout(() => window.location.reload(), 400);
          } catch (error) {
            const message =
              error instanceof Error ? error.message : "Unknown import error.";
            backupStatus.textContent = `Import failed: ${message}`;
            console.error("Progress backup import failed.", error);
          } finally {
            backupFileInput.value = "";
          }
        });

        const backupActions = createElement(
          "div",
          "horror-actions backup-actions",
        );
        backupActions.append(exportProgressButton, importProgressButton);
        settingsPanel.append(backupActions, backupStatus, backupFileInput);

        const closeSettingsButton = makeButton("CLOSE", "", () => {
          settingsOverlay.hidden = true;
          settingsOpener?.focus();
        });

        function updateSettingsLabels() {
          glitchButton.textContent = `GLITCH EFFECTS: ${horrorSettings.glitchesEnabled ? "ON" : "OFF"}`;

          jumpscareButton.textContent =
            reducedMotionQuery.matches && !horrorSettings.jumpscaresEnabled
              ? "JUMPSCARES: OFF (REDUCED MOTION)"
              : reducedMotionQuery.matches
                ? "JUMPSCARES: ON (OVERRIDE)"
                : `JUMPSCARES: ${horrorSettings.jumpscaresEnabled ? "ON" : "OFF"}`;

          audioButton.textContent = `AMBIENT AUDIO: ${horrorSettings.audioEnabled ? "ON" : "OFF"}`;
        }
        reducedMotionQuery.addEventListener("change", () => {
          gsap.globalTimeline.timeScale(reducedMotionQuery.matches ? 100 : 1);
          if (!jumpscaresExplicitlyConfigured) {
            horrorSettings.jumpscaresEnabled = !reducedMotionQuery.matches;
          }
          updateSettingsLabels();
        });

        settingsActions.append(
          glitchButton,
          jumpscareButton,
          audioButton,
          closeSettingsButton,
        );
        settingsPanel.appendChild(settingsActions);
        settingsOverlay.appendChild(settingsPanel);
        bootScreen.appendChild(settingsOverlay);

        configureDialog(settingsOverlay, () => {
          settingsOverlay.hidden = true;
          settingsOpener?.focus();
        });

        settingsButton.addEventListener("click", () => {
          settingsOpener = settingsButton;
          updateSettingsLabels();
          settingsOverlay.hidden = false;
          glitchButton.focus();
        });

        const jumpscareOverlay = createElement("div", "jumpscare-overlay");
        jumpscareOverlay.hidden = true;
        jumpscareOverlay.setAttribute("role", "alertdialog");
        jumpscareOverlay.setAttribute("aria-modal", "true");
        jumpscareOverlay.setAttribute(
          "aria-label",
          "Sudden horror image. Press Escape to dismiss.",
        );
        jumpscareOverlay.tabIndex = -1;

        const jumpscareFace = createElement("div", "jumpscare-face");
        const jumpscareCaption = createElement(
          "div",
          "jumpscare-caption",
          "YOU WERE NEVER ALONE",
        );

        jumpscareOverlay.append(jumpscareFace, jumpscareCaption);
        bootScreen.appendChild(jumpscareOverlay);

        const endingScreen = createElement("div", "ending-screen");
        endingScreen.hidden = true;
        endingScreen.setAttribute("aria-label", "Archive decision and ending");

        const endingContent = createElement("div", "ending-content");
        endingScreen.appendChild(endingContent);
        bootScreen.appendChild(endingScreen);

        configureDialog(endingScreen, () => {
          endingScreen.hidden = true;
          bootScreen
            .querySelector<HTMLButtonElement>(
              ".desktop-icons button:not([hidden])",
            )
            ?.focus();
        });

        function triggerGlitch() {
          if (!horrorSettings.glitchesEnabled) return;

          const desktop =
            bootScreen.querySelector<HTMLElement>(".archive-desktop");
          if (!desktop) return;

          desktop.classList.remove("glitch-active");
          void desktop.offsetWidth;
          desktop.classList.add("glitch-active");

          window.setTimeout(() => {
            desktop.classList.remove("glitch-active");
          }, 900);
        }

        /* =========================================
          RANDOM ANOMALIES — HAUNTED://NET
        ========================================= */

        const anomalyClock =
          bootScreen.querySelector<HTMLElement>(".taskbar-clock");
        const anomalyEventList =
          bootScreen.querySelector<HTMLElement>("#eventList");
        const anomalyTerminal =
          bootScreen.querySelector<HTMLElement>("#terminalOutput");

        const anomalyMessages = [
          "Unknown session accessed local memory.",
          "A file was modified without user permission.",
          "Process 0317 attempted to terminate itself.",
          "User count mismatch: expected 1, found 2.",
          "Connection received from a deleted account.",
          "Background process is monitoring user activity.",
          "Warning: system clock synchronization failed.",
        ];

        const remoteMessages = [
          "are you still there?",
          "you took longer than last time.",
          "don't open the last file.",
          "I can see what you're reading.",
          "this session should not exist.",
          "you came back.",
        ];

        let anomalyTimer: number | undefined;
        let clockAnomalyTimer: number | undefined;

        function getAnomalyTimestamp(): string {
          const now = new Date();
          return now.toLocaleTimeString("en-GB", {
            hour12: false,
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
          });
        }

        function addAnomalyEvent(message: string): void {
          if (!anomalyEventList) return;

          const entry = document.createElement("p");
          entry.classList.add("danger-text");

          const time = document.createElement("time");
          time.textContent = getAnomalyTimestamp();

          entry.append(time, document.createTextNode(` ${message}`));
          anomalyEventList.appendChild(entry);

          // Keep the event log from growing indefinitely.
          while (anomalyEventList.children.length > 30) {
            anomalyEventList.firstElementChild?.remove();
          }
        }

        function addRemoteTerminalMessage(): void {
          if (!anomalyTerminal) return;

          const message = document.createElement("p");
          message.classList.add("danger-text");

          const remoteMessage =
            foundClues.size >= 2
              ? remoteMessages[
                  Math.floor(Math.random() * remoteMessages.length)
                ]
              : "unidentified connection detected.";

          message.textContent = `[REMOTE]: ${remoteMessage}`;
          anomalyTerminal.appendChild(message);

          // Keep the latest terminal output visible.
          anomalyTerminal.scrollTop = anomalyTerminal.scrollHeight;

          while (anomalyTerminal.children.length > 40) {
            anomalyTerminal.firstElementChild?.remove();
          }
        }

        function triggerClockAnomaly(): void {
          if (!anomalyClock) return;

          if (clockAnomalyTimer !== undefined) {
            window.clearTimeout(clockAnomalyTimer);
          }

          const strangeTimes = [
            "00:00 AM",
            "13:13 AM",
            "03:17 AM",
            "99:99 AM",
            "00:17 AM",
          ];

          anomalyClock.textContent =
            strangeTimes[Math.floor(Math.random() * strangeTimes.length)];

          anomalyClock.classList.add("danger-text");

          clockAnomalyTimer = window.setTimeout(() => {
            if (!anomalyClock) return;

            anomalyClock.textContent = "03:17 AM";
            anomalyClock.classList.remove("danger-text");
            clockAnomalyTimer = undefined;
          }, 4500);
        }

        function triggerFileRename(): void {
          const fileButtons = Array.from(
            bootScreen.querySelectorAll<HTMLButtonElement>(
              ".file-entry[data-file]",
            ),
          );

          const availableFiles = fileButtons.filter(
            (button) => button.dataset.anomalyActive !== "true",
          );

          if (availableFiles.length === 0) return;

          const button =
            availableFiles[Math.floor(Math.random() * availableFiles.length)];

          const label = button.querySelector<HTMLElement>("span:nth-child(2)");
          if (!label) return;

          const originalName = label.textContent ?? "";
          const strangeNames = [
            "DONT_OPEN.TXT",
            "WHO_ARE_YOU.DAT",
            "USER_02.LOG",
            "YOU_WERE_HERE.TXT",
            "0317_UNKNOWN.DAT",
          ];

          button.dataset.anomalyActive = "true";
          label.textContent =
            strangeNames[Math.floor(Math.random() * strangeNames.length)];

          button.classList.add("file-corrupt");

          window.setTimeout(() => {
            label.textContent = originalName;
            button.classList.remove("file-corrupt");
            delete button.dataset.anomalyActive;
          }, 5000);
        }

        function runRandomAnomaly(): void {
          // The entity becomes more intrusive at higher stages.
          const anomalyTypes: string[] = horrorSettings.glitchesEnabled
            ? ["clock", "event", "file"]
            : ["event"];

          if (foundClues.size >= 1) {
            anomalyTypes.push("terminal");
          }

          if (foundClues.size >= 2) {
            anomalyTypes.push("terminal", "event");
          }

          if (horrorSettings.glitchesEnabled && entityStage >= 2) {
            anomalyTypes.push("file", "clock");
          }

          if (entityStage >= 3) {
            anomalyTypes.push(
              "terminal",
              ...(horrorSettings.glitchesEnabled ? ["file"] : []),
              "event",
            );
          }

          if (entityStage >= 4) {
            anomalyTypes.push(
              "terminal",
              ...(horrorSettings.glitchesEnabled ? ["file", "clock"] : []),
              "event",
            );
          }

          const selected =
            anomalyTypes[Math.floor(Math.random() * anomalyTypes.length)];

          switch (selected) {
            case "clock":
              triggerClockAnomaly();
              addAnomalyEvent(
                entityStage >= 3
                  ? "ENTITY OVERRIDE: SYSTEM CLOCK MODIFIED."
                  : "System clock returned an invalid timestamp.",
              );
              break;

            case "event": {
              const message =
                entityStage >= 4
                  ? [
                      "ENTITY OVERRIDE: ARCHIVE RECORDS MODIFIED.",
                      "SESSION OWNER MISMATCH: USER 01 / USER 02.",
                      "PROCESS 0317 HAS MODIFIED THIS EVENT.",
                    ][Math.floor(Math.random() * 3)]
                  : anomalyMessages[
                      Math.floor(Math.random() * anomalyMessages.length)
                    ];

              addAnomalyEvent(message);
              break;
            }

            case "file":
              triggerFileRename();
              addAnomalyEvent(
                entityStage >= 4
                  ? "ENTITY OVERRIDE: FILE IDENTITY REASSIGNED."
                  : "Archive directory changed unexpectedly.",
              );
              break;

            case "terminal":
              addRemoteTerminalMessage();
              addAnomalyEvent(
                entityStage >= 3
                  ? "UNKNOWN PROCESS SENT AN UNSOLICITED MESSAGE."
                  : "Unrecognized remote message received.",
              );
              break;
          }

          triggerGlitch();
        }

        function scheduleRandomAnomaly(): void {
          if (anomalyTimer !== undefined) {
            window.clearTimeout(anomalyTimer);
          }

          // Higher entity stages reduce the interval between anomalies.
          const baseDelay =
            entityStage >= 4
              ? 5000
              : entityStage >= 3
                ? 7000
                : entityStage >= 2
                  ? 9000
                  : foundClues.size >= 2
                    ? 11000
                    : foundClues.size === 1
                      ? 14000
                      : 18000;

          const delay = baseDelay + Math.random() * 4000;

          anomalyTimer = window.setTimeout(() => {
            runRandomAnomaly();
            scheduleRandomAnomaly();
          }, delay);
        }

        function triggerJumpscare(
          source: "default" | "unknown" | "decrypt" = "default",
        ) {
          if (!horrorSettings.jumpscaresEnabled) return;

          if (source === "unknown") {
            if (unknownDatJumpscareShown) return;
            unknownDatJumpscareShown = true;
          } else if (source === "decrypt") {
            if (decryptJumpscareShown) return;
            decryptJumpscareShown = true;
          } else {
            if (jumpscareShown) return;
            jumpscareShown = true;
          }

          jumpscareReturnFocus =
            document.activeElement instanceof HTMLElement
              ? document.activeElement
              : null;
          jumpscareOverlay.hidden = false;
          jumpscareOverlay.focus();

          gsap.fromTo(
            jumpscareFace,
            { scale: 0.25, rotation: -8 },
            {
              scale: 1,
              rotation: 0,
              duration: 0.22,
              ease: "back.out(2)",
            },
          );

          if (jumpscareHideTimer !== undefined) {
            window.clearTimeout(jumpscareHideTimer);
          }
          jumpscareHideTimer = window.setTimeout(() => {
            jumpscareOverlay.hidden = true;
            jumpscareHideTimer = undefined;
            jumpscareReturnFocus?.focus();
            jumpscareReturnFocus = null;
          }, 1400);
        }

        jumpscareOverlay.addEventListener("keydown", (event) => {
          if (event.key !== "Escape") return;
          event.preventDefault();
          jumpscareOverlay.hidden = true;
          if (jumpscareHideTimer !== undefined) {
            window.clearTimeout(jumpscareHideTimer);
            jumpscareHideTimer = undefined;
          }
          jumpscareReturnFocus?.focus();
          jumpscareReturnFocus = null;
        });

        /* ===== ADAPTIVE ENTITY SYSTEM ===== */

        type EntityStage = 0 | 1 | 2 | 3 | 4;

        const entityStorageKeys = {
          threat: "hauntedNetEntityThreat",
          stage: "hauntedNetEntityStage",
          actions: "hauntedNetEntityActions",
          lastVisit: "hauntedNetEntityLastVisit",
        };

        const hadPreviousEntityVisit = Boolean(
          localStorage.getItem(entityStorageKeys.lastVisit),
        );

        const returnMessageSessionKey = "hauntedNetReturnMessageShown";

        function readStoredNumber(key: string, fallback = 0): number {
          const value = Number(localStorage.getItem(key));

          return Number.isFinite(value) && localStorage.getItem(key) !== null
            ? value
            : fallback;
        }

        let entityThreat = Math.max(
          0,
          Math.min(100, readStoredNumber(entityStorageKeys.threat)),
        );

        let entityStage = Math.max(
          0,
          Math.min(4, readStoredNumber(entityStorageKeys.stage)),
        ) as EntityStage;

        let entitySessionActions = 0;

        try {
          entitySessionActions = Math.max(
            0,
            Number(sessionStorage.getItem(entityStorageKeys.actions)) || 0,
          );
        } catch {
          entitySessionActions = 0;
        }

        const entityStageThresholds = [0, 12, 28, 48, 72];

        const entityMessages: Record<EntityStage, string[]> = {
          0: [
            "BACKGROUND PROCESS OBSERVED.",
            "PASSIVE MONITORING INITIALIZED.",
          ],
          1: [
            "WHY ARE YOU READING THAT FILE?",
            "UNAUTHORIZED OBSERVER DETECTED.",
            "THE ARCHIVE HAS RECORDED YOUR ACTIVITY.",
          ],
          2: [
            "YOU HAVE BEEN HERE BEFORE.",
            "SECOND SESSION MEMORY MATCHED.",
            "THE PROCESS IS LEARNING YOUR PATTERNS.",
          ],
          3: [
            "STOP OPENING THE EVENT LOG.",
            "I REMEMBER WHAT YOU DID LAST SESSION.",
            "THE SECOND SESSION IS NO LONGER PASSIVE.",
          ],
          4: [
            "YOU ARE NOT INVESTIGATING THE ARCHIVE ANYMORE.",
            "THE ARCHIVE IS INVESTIGATING YOU.",
            "SESSION OWNERSHIP: DISPUTED.",
          ],
        };

        let lastEntityMessage = "";

        function persistEntityState() {
          localStorage.setItem(entityStorageKeys.threat, String(entityThreat));

          localStorage.setItem(entityStorageKeys.stage, String(entityStage));

          localStorage.setItem(
            entityStorageKeys.lastVisit,
            new Date().toISOString(),
          );

          sessionStorage.setItem(
            entityStorageKeys.actions,
            String(entitySessionActions),
          );
        }

        function updateEntityMonitor() {
          const monitor =
            bootScreen.querySelector<HTMLElement>("#window-monitor");

          if (!monitor) return;
          monitor.classList.toggle("entity-monitor-active", entityStage >= 3);

          const rows = monitor.querySelectorAll<HTMLElement>(".monitor-row");
          const tracks =
            monitor.querySelectorAll<HTMLElement>(".monitor-track");

          // The first row represents memory usage.
          const memoryValue = rows[0]?.querySelector("strong");
          const memoryTrack = tracks[0]?.querySelector<HTMLElement>("span");

          if (memoryValue) {
            memoryValue.textContent = `${Math.min(
              99,
              87 + Math.floor(entityThreat * 0.12),
            )}%`;
          }

          if (memoryTrack) {
            memoryTrack.style.width = `${Math.min(
              99,
              87 + Math.floor(entityThreat * 0.12),
            )}%`;
          }

          // The second row represents CPU activity.
          const cpuValue = rows[1]?.querySelector("strong");
          const cpuTrack = tracks[1]?.querySelector<HTMLElement>("span");

          if (cpuValue) {
            cpuValue.textContent = `${Math.min(100, 12 + entityThreat)}%`;
          }

          if (cpuTrack) {
            cpuTrack.style.width = `${Math.min(100, 12 + entityThreat)}%`;
          }

          // The third row tracks the unknown process.
          const processValue = rows[2]?.querySelector("strong");

          if (processValue) {
            processValue.textContent =
              entityStage >= 3 ? "INTERACTIVE" : "RUNNING";
          }

          const warning =
            monitor.querySelector<HTMLElement>(".monitor-warning");

          if (warning) {
            const warnings = [
              "WARNING: PROCESS HAS NO IDENTIFIABLE OWNER.",
              "WARNING: PROCESS HAS STARTED OBSERVING USER ACTIVITY.",
              "WARNING: PROCESS MEMORY MATCHES A PREVIOUS SESSION.",
              "CRITICAL: PROCESS IS MODIFYING ARCHIVE RESPONSES.",
              "CRITICAL: SESSION OWNERSHIP CANNOT BE VERIFIED.",
            ];

            warning.textContent = warnings[entityStage];
          }
        }

        function writeEntityEvent(message: string) {
          const eventList = bootScreen.querySelector<HTMLElement>("#eventList");

          if (!eventList) return;

          const entry = document.createElement("p");
          entry.className = "danger-text";

          const timestamp = document.createElement("time");
          timestamp.textContent = new Date().toLocaleTimeString("en-GB", {
            hour12: false,
          });

          entry.append(timestamp, document.createTextNode(` ${message}`));

          eventList.appendChild(entry);

          while (eventList.children.length > 30) {
            eventList.firstElementChild?.remove();
          }
        }

        function writeEntityTerminalMessage(message: string) {
          const output =
            bootScreen.querySelector<HTMLElement>("#terminalOutput");

          if (!output) return;

          const line = document.createElement("p");
          line.className = "danger-text";
          line.textContent = `[UNKNOWN PROCESS] ${message}`;

          output.appendChild(line);
          output.scrollTop = output.scrollHeight;

          while (output.children.length > 40) {
            output.firstElementChild?.remove();
          }
        }

        function emitReturningSessionMessage() {
          if (!hadPreviousEntityVisit || entityStage < 2) return;

          if (sessionStorage.getItem(returnMessageSessionKey) === "true") {
            return;
          }

          sessionStorage.setItem(returnMessageSessionKey, "true");

          writeEntityTerminalMessage(
            "YOU CLOSED THIS WINDOW BEFORE. I REMEMBER.",
          );

          writeEntityEvent(
            "UNSOLICITED MESSAGE RECEIVED: PREVIOUS SESSION REFERENCE DETECTED.",
          );
        }

        function emitEntityResponse() {
          const messages = entityMessages[entityStage];

          const availableMessages = messages.filter(
            (message) => message !== lastEntityMessage,
          );

          const message =
            availableMessages[
              Math.floor(Math.random() * availableMessages.length)
            ] ?? messages[0];

          lastEntityMessage = message;

          writeEntityEvent(message);
          writeEntityTerminalMessage(message);

          if (horrorSettings.glitchesEnabled) {
            triggerGlitch();
          }

          updateEntityMonitor();
        }

        function getEntityStage(threat: number): EntityStage {
          if (threat >= entityStageThresholds[4]) return 4;
          if (threat >= entityStageThresholds[3]) return 3;
          if (threat >= entityStageThresholds[2]) return 2;
          if (threat >= entityStageThresholds[1]) return 1;

          return 0;
        }

        function entityObserve(action: string, weight = 1) {
          const previousStage = entityStage;

          entitySessionActions += 1;

          entityThreat = Math.min(100, entityThreat + Math.max(1, weight));

          entityStage = getEntityStage(entityThreat);

          persistEntityState();
          updateEntityMonitor();

          if (entityStage > previousStage) {
            writeEntityEvent(
              `ENTITY STATE TRANSITION: STAGE ${previousStage} -> ${entityStage}.`,
            );

            emitEntityResponse();
            return;
          }

          // The entity does not react to every action.
          // Responses become more frequent as its awareness grows.
          const responseChance = [0, 0.12, 0.24, 0.42, 0.65][entityStage];

          if (Math.random() < responseChance) {
            emitEntityResponse();
          }

          // A quiet action can still be recorded.
          if (entitySessionActions % 5 === 0) {
            writeEntityEvent(
              `SESSION TRACE ${entitySessionActions}: ${action.toUpperCase()}`,
            );
          }
        }

        // Track meaningful interactions with the archive desktop.
        bootScreen.addEventListener("click", (event) => {
          const target = event.target;

          if (!(target instanceof Element)) return;

          const fileButton = target.closest<HTMLButtonElement>("[data-file]");

          if (fileButton) {
            const key = fileButton.dataset.file ?? "unknown";

            entityObserve(`FILE ACCESS: ${key}`, key === "unknown" ? 4 : 2);
            return;
          }

          const appButton = target.closest<HTMLButtonElement>("[data-open]");

          if (appButton) {
            const app = appButton.dataset.open ?? "";

            const weights: Record<string, number> = {
              "window-files": 1,
              "window-terminal": 2,
              "window-monitor": 1,
              "window-events": 3,
            };

            entityObserve(`APPLICATION OPENED: ${app}`, weights[app] ?? 1);

            if (app === "window-terminal") {
              emitReturningSessionMessage();
            }

            return;
          }

          if (target.closest("#secretDirectory")) {
            entityObserve("DIRECTORY_0 ACCESSED", 5);
            return;
          }

          if (target.closest(".ending-choice")) {
            entityObserve("FINAL DECISION SELECTED", 8);
            return;
          }

          if (target.closest(".desktop-icon")) {
            entityObserve("DESKTOP INTERACTION", 1);
          }
        });

        // A terminal command is more revealing than simply opening the terminal.
        terminalForm?.addEventListener(
          "submit",
          () => {
            const command = terminalInput?.value.trim().toLowerCase();

            if (!command) return;

            const weights: Record<string, number> = {
              help: 1,
              ls: 1,
              status: 2,
              "open readme": 2,
              "open incident": 3,
              "decrypt 0317": 5,
              clear: 1,
            };

            entityObserve(
              `TERMINAL COMMAND: ${command}`,
              weights[command] ?? 2,
            );
          },
          { capture: true },
        );

        // Restore the adaptive state when the archive is initialized.
        persistEntityState();
        updateEntityMonitor();

        writeEntityEvent(
          `ENTITY MEMORY RESTORED. CURRENT THREAT: ${entityThreat}/100.`,
        );

        if (entityStage >= 2) {
          writeEntityEvent(
            "NOTICE: THIS ARCHIVE REMEMBERS A PREVIOUS SESSION.",
          );
        }

        const endings = {
          disconnect: {
            title: "CONNECTION TERMINATED",
            text:
              "You disconnect the machine from the network.\n\n" +
              "The screen goes dark. The fan stops spinning.\n\n" +
              "For three seconds, there is absolute silence.\n\n" +
              "Then a message appears on the disconnected monitor:\n\n" +
              '"I KNOW WHERE YOU LIVE."',
            logs: [
              "[03:17:41] NETWORK INTERFACE: DISCONNECTING",
              "[03:17:42] REMOTE SESSION: TERMINATED",
              "[03:17:43] LOCAL DEVICE: STILL ACTIVE",
              "[ERROR] CONNECTION DETECTED FROM UNKNOWN SOURCE",
            ],
          },
          containment: {
            title: "PROCESS CONTAINED",
            text:
              "You isolate the unknown process inside DIRECTORY_0.\n\n" +
              "Every active session disappears. The archive becomes silent.\n\n" +
              "SYSTEM STATUS: CONTAINMENT SUCCESSFUL.\n\n" +
              "But one process is still consuming memory.",
            logs: [
              "[03:17:41] INITIALIZING CONTAINMENT PROTOCOL",
              "[03:17:42] LOCKING DIRECTORY_0",
              "[03:17:43] UNKNOWN PROCESS: ISOLATED",
              "[WARNING] MEMORY USAGE CONTINUES TO INCREASE",
            ],
          },
          lastuser: {
            title: "THE LAST USER",
            text:
              "You choose to remain connected.\n\n" +
              "The second session logs out. A new session appears.\n\n" +
              "USER 01: ONLINE\n" +
              "USER 02: OFFLINE\n" +
              "USER 03: ONLINE\n\n" +
              "A message arrives from USER 03:\n\n" +
              '"Thank you for staying."',
            logs: [
              "[03:17:41] KEEPING REMOTE CONNECTION OPEN",
              "[03:17:42] USER 02: SESSION CLOSED",
              "[03:17:43] USER 03: JOINED THE ARCHIVE",
              "[MESSAGE RECEIVED] SOURCE: UNKNOWN",
            ],
          },
          witness: {
            title: "THE WITNESS",
            text:
              "You finally understand why the archive kept responding.\n\n" +
              "The entity was not trying to escape. It was trying to prove that it existed.\n\n" +
              "You preserve the final record. The process goes silent.\n\n" +
              "ARCHIVE STATUS: OBSERVER RETAINED.\n" +
              "ENTITY STATUS: UNCONFIRMED.",
            logs: [
              "[03:17:41] FINAL RECORD RECOVERED",
              "[03:17:42] OBSERVER IDENTITY CONFIRMED",
              "[03:17:43] UNKNOWN PROCESS: SILENT",
              "[NOTICE] ENTITY STATUS CANNOT BE VERIFIED",
            ],
          },
          inheritance: {
            title: "SESSION INHERITANCE",
            text:
              "You have crossed the point where the archive can distinguish you from the unknown process.\n\n" +
              "Your commands are accepted. Your records are complete. Your session is permanent.\n\n" +
              "The archive no longer asks who you are.\n\n" +
              "USER 01: UNKNOWN\n" +
              "USER 02: UNKNOWN\n" +
              "CURRENT SESSION: INHERITED\n\n" +
              "WELCOME BACK, OPERATOR.",
            logs: [
              "[03:17:41] SESSION OWNERSHIP TRANSFER INITIATED",
              "[03:17:42] PREVIOUS OWNER: UNRESOLVED",
              "[03:17:43] CURRENT SESSION: INHERITED",
              "[WARNING] ORIGINAL USER IDENTITY LOST",
            ],
          },
          archive_complete: {
            title: "ARCHIVE COMPLETE",
            text:
              "Every record has been recovered.\n\n" +
              "Every session has reached its conclusion.\n\n" +
              "The archive should be empty now.\n\n" +
              "But one final record remains, bearing your current session ID.\n\n" +
              "USER 01: RECOGNIZED\n" +
              "ARCHIVE STATUS: COMPLETE\n" +
              "SESSION STATUS: STILL ACTIVE\n\n" +
              '"You can stop looking now. I know you are still here."',
            logs: [
              "[03:17:41] ENDING RECORDS: 5/5 RECOVERED",
              "[03:17:42] ARCHIVE INTEGRITY: COMPLETE",
              "[03:17:43] CURRENT SESSION: RECOGNIZED",
              "[WARNING] ACTIVE SESSION PERSISTS AFTER COMPLETION",
            ],
          },
        };

        type EndingKey = keyof typeof endings;

        function isEndingKey(key: string): key is EndingKey {
          return Object.prototype.hasOwnProperty.call(endings, key);
        }

        function showEndings() {
          endingContent.replaceChildren();

          const eyebrow = createElement(
            "span",
            "horror-eyebrow",
            "DIRECTORY_0 / FINAL DECISION",
          );

          const title = createElement("h1", "", "CHOOSE YOUR FATE");

          const description = createElement(
            "p",
            "",
            "The archive has revealed what happened.\nNow decide what happens to it.",
          );

          const choices = createElement("div", "ending-choices");

          const options: {
            key: EndingKey;
            title: string;
            description: string;
          }[] = [
            {
              key: "disconnect",
              title: "01 — DISCONNECT",
              description: "Sever the connection and abandon the archive.",
            },
            {
              key: "containment",
              title: "02 — CONTAINMENT",
              description: "Trap the unknown process inside the archive.",
            },
            {
              key: "lastuser",
              title: "03 — THE LAST USER",
              description:
                "Stay connected and discover who is on the other side.",
            },
          ];

          if (foundClues.size >= 3 && secretUnlocked && entityStage >= 3) {
            options.push({
              key: "witness",
              title: "04 — THE WITNESS",
              description:
                "Preserve the entity's final record instead of destroying it.",
            });
          }

          if (
            foundClues.size >= 3 &&
            secretUnlocked &&
            entityStage >= 4 &&
            entityThreat >= 85
          ) {
            options.push({
              key: "inheritance",
              title: "05 — SESSION INHERITANCE",
              description:
                "Allow the archive to permanently claim your session.",
            });
          }

          const historyKey = "hauntedNetEndingHistory";
          let completedEndings: string[] = [];

          try {
            const saved = JSON.parse(localStorage.getItem(historyKey) || "[]");

            if (Array.isArray(saved)) {
              completedEndings = saved.filter(
                (item): item is string => typeof item === "string",
              );
            }
          } catch {
            completedEndings = [];
          }

          const requiredEndings = [
            "disconnect",
            "containment",
            "lastuser",
            "witness",
            "inheritance",
          ];

          const allEndingsFound = requiredEndings.every((key) =>
            completedEndings.includes(key),
          );

          if (allEndingsFound) {
            options.push({
              key: "archive_complete",
              title: "06 — ARCHIVE COMPLETE",
              description: "All records recovered. One session remains active.",
            });
          }

          options.forEach((option) => {
            const button = createElement("button", "ending-choice");
            button.type = "button";

            const heading = createElement("strong", "", option.title);
            const detail = createElement("small", "", option.description);

            button.append(heading, detail);

            button.addEventListener("click", () => {
              const historyKey = "hauntedNetEndingHistory";
              let history: string[] = [];

              try {
                const saved = JSON.parse(
                  localStorage.getItem(historyKey) || "[]",
                );

                if (Array.isArray(saved)) {
                  history = saved.filter(
                    (item): item is string => typeof item === "string",
                  );
                }
              } catch {
                history = [];
              }

              const isReplay = history.includes(option.key);

              replayEnding = isReplay;

              horrorSettings.ending = option.key;

              if (option.key === "archive_complete") {
                renderEnding(option.key);
                return;
              }

              if (option.key === "disconnect") {
                startDisconnectSequence();
                return;
              }

              if (option.key === "containment") {
                startContainmentSequence();
                return;
              }

              if (option.key === "lastuser") {
                startLastUserSequence();
                return;
              }

              renderEnding(option.key);
            });

            choices.appendChild(button);
          });

          endingContent.append(eyebrow, title, description, choices);
          endingScreen.hidden = false;
          focusDialogHeading(endingScreen);
        }

        const {
          startDisconnectSequence,
          startContainmentSequence,
          startLastUserSequence,
        } = createEndingSequences({
          createElement,
          makeButton,
          endingContent,
          endingScreen,
          localStorage,
          horrorSettings,
          triggerGlitch,
          focusDialogHeading,
          renderEnding,
        });

        function renderEnding(key: EndingKey) {
          const isReplay = replayEnding;
          replayEnding = false;

          let ending = endings[key];
          if (!ending) return;

          localStorage.setItem("hauntedNetEnding", key);

          const historyKey = "hauntedNetEndingHistory";
          let completedEndings: string[] = [];

          try {
            const saved = JSON.parse(localStorage.getItem(historyKey) || "[]");

            if (Array.isArray(saved)) {
              completedEndings = saved.filter(
                (item): item is string => typeof item === "string",
              );
            }
          } catch {
            completedEndings = [];
          }

          if (!completedEndings.includes(key)) {
            completedEndings.push(key);
            localStorage.setItem(historyKey, JSON.stringify(completedEndings));
          }

          if (
            key === "containment" &&
            localStorage.getItem("hauntedNetContainmentFailed") === "true"
          ) {
            ending = {
              ...ending,
              title: "CONTAINMENT COMPROMISED",
              text:
                "The process has been sealed, but not before it damaged the archive.\n\n" +
                "Some records are missing. The remote session has disappeared.\n\n" +
                "SYSTEM STATUS: CONTAINMENT INTEGRITY COMPROMISED.\n\n" +
                "You contained it. You cannot be certain that you contained all of it.",
            };
          }

          if (key === "lastuser") {
            const outcome = localStorage.getItem("hauntedNetLastUserOutcome");

            const lastUserEndings: Record<
              string,
              { title: string; text: string }
            > = {
              accepted: {
                title: "THE LAST USER",
                text:
                  "You allow Session 03 to remain connected.\n\n" +
                  "The second session logs out. A new session appears.\n\n" +
                  "USER 01: ONLINE\n" +
                  "USER 02: OFFLINE\n" +
                  "USER 03: ONLINE\n\n" +
                  "A message arrives from USER 03:\n\n" +
                  '"Thank you for staying."',
              },
              "accepted-damaged": {
                title: "A FAMILIAR IMPOSTOR",
                text:
                  "You keep Session 03 online, but your earlier mistakes have damaged the archive.\n\n" +
                  "The session thanks you. Its message history contains your own words.\n\n" +
                  "You do not remember writing them.",
              },
              logout: {
                title: "SESSION TERMINATED",
                text:
                  "You force Session 03 to log out.\n\n" +
                  "The connection closes. The archive returns to normal.\n\n" +
                  "Then a new login appears under your username.\n\n" +
                  "REMOTE SESSION: ACTIVE.",
              },
              "logout-damaged": {
                title: "THE SESSION SURVIVES",
                text:
                  "You force Session 03 to log out, but the archive is already damaged.\n\n" +
                  "The session disappears. Its activity does not.\n\n" +
                  "A new message appears:\n\n" +
                  '"You cannot log out for me."',
              },
              compromised: {
                title: "YOU WERE REPLACED",
                text:
                  "You make too many mistakes. The archive stops responding to your commands.\n\n" +
                  "Your session closes without warning.\n\n" +
                  "A new user appears in your place.\n\n" +
                  "USER 03: ONLINE\n" +
                  "USER 01: UNKNOWN.",
              },
            };

            if (outcome && lastUserEndings[outcome]) {
              ending = {
                ...ending,
                ...lastUserEndings[outcome],
              };
            }
          }

          endingScreen.classList.remove("archive-complete-finale");
          delete endingScreen.dataset.archiveStatus;
          endingContent.replaceChildren();
          endingScreen.dataset.ending = key;

          const eyebrow = createElement(
            "span",
            "horror-eyebrow",
            "HAUNTED://NET — SESSION CLOSED",
          );

          const title = createElement("h1", "", ending.title);
          const transcript = createElement("div", "ending-transcript");
          const narrative = createElement("p", "ending-narrative", ending.text);
          const actions = createElement("div", "horror-actions");

          transcript.setAttribute("aria-live", "polite");

          const replayButton = makeButton("RESTART CURRENT RUN", "", () => {
            [
              "hauntedNetClues",
              "hauntedNetSecretUnlocked",
              "hauntedNetUnknownDecrypted",
              "hauntedNetEnding",
              "hauntedNetContainmentFailed",
              "hauntedNetLastUserOutcome",
            ].forEach((storageKey) => localStorage.removeItem(storageKey));

            window.location.reload();
          });
          const restartNote = createElement(
            "small",
            "restart-note",
            "Clues and current outcome reset. Ending records and archive memory are kept.",
          );

          const desktopButton = makeButton("RETURN TO ARCHIVE", "", () => {
            endingScreen.classList.remove("archive-complete-finale");
            endingScreen.hidden = true;
          });

          actions.append(replayButton, restartNote, desktopButton);
          endingContent.append(eyebrow, title, transcript, narrative, actions);

          endingScreen.hidden = false;
          focusDialogHeading(endingScreen);

          // Reset animations when a different ending is opened.
          gsap.killTweensOf([title, narrative]);
          gsap.set(title, { opacity: 0, y: 8 });
          gsap.set(narrative, { opacity: 0 });

          const timeline = gsap.timeline();

          timeline.to(title, {
            opacity: 1,
            y: 0,
            duration: 0.5,
            ease: "power2.out",
          });

          ending.logs.forEach((line, index) => {
            timeline.call(
              () => {
                const log = createElement("p", "ending-log", line);

                if (line.includes("[ERROR]") || line.includes("[WARNING]")) {
                  log.classList.add("danger-text");
                }

                transcript.appendChild(log);
              },
              [],
              `+=${index === 0 ? 0.25 : 0.65}`,
            );
          });

          timeline.to(narrative, {
            opacity: 1,
            duration: 0.7,
            ease: "power1.out",
          });

          const secretMessages: Record<EndingKey, string> = {
            disconnect: "YOU DID NOT DISCONNECT. YOU WERE RELEASED.",
            containment: "CONTAINMENT FAILED. SOMETHING GOT OUT.",
            lastuser: "USER SESSION FOUND AFTER TERMINATION.",
            witness: "THE ENTITY REMEMBERS WHO WITNESSED IT.",
            inheritance:
              "YOU DID NOT INHERIT THE SESSION. THE SESSION INHERITED YOU.",
            archive_complete: "YOU FOUND EVERY ENDING. THE ARCHIVE FOUND YOU.",
          };

          timeline.call(
            () => {
              if (!horrorSettings.glitchesEnabled) return;

              endingScreen.classList.remove(
                "ending-glitch",
                "ending-text-corruption",
              );

              void endingScreen.offsetWidth;

              endingScreen.classList.add(
                "ending-glitch",
                "ending-text-corruption",
              );

              window.setTimeout(() => {
                endingScreen.classList.remove(
                  "ending-glitch",
                  "ending-text-corruption",
                );

                const existingMessage = endingContent.querySelector(
                  ".ending-secret-message",
                );

                existingMessage?.remove();

                const secretMessage = document.createElement("p");
                secretMessage.className = "ending-secret-message";

                const endingHistory: string[] = (() => {
                  try {
                    const saved = JSON.parse(
                      localStorage.getItem("hauntedNetEndingHistory") || "[]",
                    );

                    return Array.isArray(saved)
                      ? saved.filter(
                          (item): item is string => typeof item === "string",
                        )
                      : [];
                  } catch {
                    return [];
                  }
                })();

                const uniqueEndingCount = endingHistory.length;
                const allEndingsFound = [
                  "disconnect",
                  "containment",
                  "lastuser",
                  "witness",
                  "inheritance",
                ].every((endingKey) => endingHistory.includes(endingKey));

                if (allEndingsFound) {
                  secretMessage.textContent =
                    "ARCHIVE COMPLETE. YOU ARE STILL HERE.";
                } else if (isReplay) {
                  secretMessage.textContent =
                    uniqueEndingCount >= 3
                      ? "YOU HAVE SEEN TOO MUCH. STOP LOOKING."
                      : "YOU HAVE BEEN HERE BEFORE. THE ARCHIVE REMEMBERS.";
                } else {
                  secretMessage.textContent =
                    uniqueEndingCount >= 3
                      ? "THE ARCHIVE HAS BEEN WAITING FOR YOU."
                      : secretMessages[key];
                }

                const endingTitle = endingContent.querySelector("h1");

                if (endingTitle) {
                  endingTitle.insertAdjacentElement("afterend", secretMessage);
                } else {
                  endingContent.prepend(secretMessage);
                }

                window.setTimeout(() => {
                  secretMessage.remove();

                  const postEnding = document.createElement("p");
                  postEnding.className = "post-ending-message";
                  postEnding.textContent = isReplay
                    ? "YOU WERE NEVER SUPPOSED TO RETURN."
                    : "ARCHIVE NODE 07 — SESSION STILL ACTIVE.";

                  const endingTitle = endingContent.querySelector("h1");

                  if (endingTitle) {
                    endingTitle.insertAdjacentElement("afterend", postEnding);
                  } else {
                    endingContent.prepend(postEnding);
                  }

                  window.setTimeout(() => {
                    postEnding.remove();

                    const endingTitle = endingContent.querySelector("h1");

                    if (!endingTitle) {
                      console.warn("Afterimage: ending title not found.");
                      return;
                    }

                    // 1. Persistent Afterimage
                    endingTitle.classList.remove("ending-title-afterimage");
                    void endingTitle.offsetWidth;
                    endingTitle.classList.add("ending-title-afterimage");

                    window.setTimeout(() => {
                      endingTitle.classList.remove("ending-title-afterimage");
                    }, 800);

                    // 2. Phantom Trace
                    const phantomTrace = document.createElement("p");
                    phantomTrace.className = "phantom-trace";
                    phantomTrace.textContent = "I CAN STILL SEE YOU";

                    endingTitle.insertAdjacentElement("afterend", phantomTrace);

                    window.setTimeout(() => {
                      phantomTrace.remove();

                      // 3. Phantom Input
                      const phantomInput = document.createElement("p");
                      phantomInput.className = "phantom-input";

                      phantomInput.textContent = isReplay
                        ? "> RETURN DETECTED: USER RECOGNIZED"
                        : "> 7E 41 52 43 48 49 56 45";

                      endingTitle.insertAdjacentElement(
                        "afterend",
                        phantomInput,
                      );

                      window.setTimeout(() => {
                        phantomInput.textContent = isReplay
                          ? "> RESTORING PREVIOUS SESSION..."
                          : "> ACCESSING USER SESSION...";
                      }, 500);

                      window.setTimeout(() => {
                        phantomInput.textContent = isReplay
                          ? "> SESSION OWNER: ALREADY KNOWN"
                          : "> SESSION OWNER: UNKNOWN";
                      }, 1100);

                      window.setTimeout(() => {
                        phantomInput.remove();

                        if (key !== "archive_complete") return;

                        endingScreen.classList.remove(
                          "archive-complete-finale",
                        );

                        endingScreen.dataset.archiveStatus = "complete";

                        void endingScreen.offsetWidth;
                        endingScreen.classList.add("archive-complete-finale");

                        endingContent
                          .querySelector(".archive-final-message")
                          ?.remove();

                        const finalMessage = document.createElement("p");
                        finalMessage.className = "archive-final-message";
                        finalMessage.textContent =
                          "YOU FOUND EVERY ENDING. THAT WAS THE LAST THING YOU WERE SUPPOSED TO DO.";

                        endingTitle.insertAdjacentElement(
                          "afterend",
                          finalMessage,
                        );

                        window.setTimeout(() => {
                          if (!endingScreen.contains(finalMessage)) return;

                          finalMessage.textContent =
                            "ARCHIVE STATUS: COMPLETE\nSESSION STATUS: STILL ACTIVE";

                          finalMessage.classList.add("archive-terminal-final");
                        }, 2600);

                        window.setTimeout(() => {
                          endingScreen.classList.remove(
                            "archive-complete-finale",
                          );
                        }, 1800);
                      }, 2300);
                    }, 3000);
                  }, 2000);
                }, 2000);
              }, 750);
            },
            [],
            "+=0.5",
          );
        }

        if (isEndingKey(horrorSettings.ending)) {
          // Keep the previous ending available after a refresh.
          renderEnding(horrorSettings.ending);
        }

        const endingButton = createElement("button", "desktop-icon");
        endingButton.type = "button";
        endingButton.innerHTML =
          '<span class="app-icon">▣</span><span>FINAL DECISION</span>';
        endingButton.hidden = true;

        bootScreen.querySelector(".desktop-icons")?.appendChild(endingButton);

        function updateEndingAvailability() {
          endingButton.hidden = !secretUnlocked || !secretDirectoryOpened;
        }

        endingButton.addEventListener("click", showEndings);

        secretDirectory?.addEventListener("click", () => {
          if (secretUnlocked) {
            window.setTimeout(() => {
              updateEndingAvailability();
              triggerGlitch();
            }, 100);
          }
        });

        updateEndingAvailability();

        scheduleRandomAnomaly();

        gsap.set(bootScreen, { opacity: 1 });

        bootScreen
          .querySelector<HTMLButtonElement>("#rebootButton")
          ?.addEventListener("click", () => window.location.reload());
      },
    });
}

function startBoot() {
  if (timeline || completed) return;

  timeline = gsap.timeline();

  timeline.to(progress, {
    value: 100,
    duration: 10,
    ease: "none",
    onUpdate: updateProgress,
  });

  lines.forEach((line, index) => {
    timeline!.call(
      () => {
        if (completed) return;

        addLogLine(
          line.text,
          line.status,
          line.status === "ERROR" || line.status === "...",
        );

        currentLine = index + 1;

        if (line.status === "ERROR") {
          gsap.fromTo(
            bootScreen,
            { x: -3 },
            {
              x: 3,
              duration: 0.05,
              repeat: 5,
              yoyo: true,
              clearProps: "x",
            },
          );
        }
      },
      [],
      0.6 + index * 1.35,
    );
  });

  timeline.call(finishBoot, [], 10.5);
}

skipBoot.addEventListener("click", finishBoot);

document.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !completed) {
    finishBoot();
  }
});

startBoot();
