import gsap from "gsap";

type EndingKey =
  | "disconnect"
  | "containment"
  | "lastuser"
  | "witness"
  | "inheritance"
  | "archive_complete";

type CreateElement = <Tag extends keyof HTMLElementTagNameMap>(
  tag: Tag,
  className: string,
  text?: string,
) => HTMLElementTagNameMap[Tag];

type MakeButton = (
  label: string,
  className: string,
  callback: (event: MouseEvent) => void,
) => HTMLButtonElement;

interface EndingSequenceOptions {
  createElement: CreateElement;
  makeButton: MakeButton;
  endingContent: HTMLElement;
  endingScreen: HTMLElement;
  localStorage: Pick<Storage, "setItem">;
  horrorSettings: { ending: string };
  triggerGlitch: () => void;
  focusDialogHeading: (dialog: HTMLElement) => void;
  renderEnding: (key: EndingKey) => void;
}

export function createEndingSequences({
  createElement,
  makeButton,
  endingContent,
  endingScreen,
  localStorage,
  horrorSettings,
  triggerGlitch,
  focusDialogHeading,
  renderEnding,
}: EndingSequenceOptions) {
  function startDisconnectSequence() {
    endingContent.replaceChildren();

    const eyebrow = createElement(
      "span",
      "horror-eyebrow",
      "NODE 07 / EMERGENCY DISCONNECT",
    );

    const title = createElement("h1", "", "SEVER THE CONNECTION");

    const description = createElement(
      "p",
      "disconnect-description",
      "The archive is still connected to an unknown remote session. Disconnect every route before it reconnects.",
    );

    const consolePanel = createElement("div", "disconnect-console");

    const status = createElement(
      "p",
      "disconnect-status",
      "NETWORK STATUS: CONNECTED",
    );

    const progress = createElement(
      "p",
      "disconnect-progress",
      "COMPLETED ACTIONS: 0 / 4",
    );

    const log = createElement("div", "disconnect-log");

    const actions = createElement("div", "disconnect-actions");

    const tasks: { label: string; message: string }[] = [
      {
        label: "DISABLE PRIMARY INTERFACE",
        message: "[OK] PRIMARY INTERFACE DISABLED.",
      },
      {
        label: "CUT BACKUP ROUTE",
        message: "[OK] BACKUP ROUTE DISCONNECTED.",
      },
      {
        label: "TERMINATE REMOTE SESSION",
        message: "[OK] REMOTE SESSION TERMINATED.",
      },
      {
        label: "CONFIRM PHYSICAL DISCONNECT",
        message: "[OK] PHYSICAL LINK DISCONNECTED.",
      },
    ];

    let taskIndex = 0;
    let failoverTriggered = false;

    function addDisconnectLog(message: string, danger = false) {
      const line = createElement(
        "p",
        danger ? "disconnect-log-line danger-text" : "disconnect-log-line",
        message,
      );

      log.appendChild(line);
      log.scrollTop = log.scrollHeight;

      gsap.from(line, {
        opacity: 0,
        x: -8,
        duration: 0.25,
        ease: "power2.out",
      });
    }

    function renderAction() {
      progress.textContent = `COMPLETED ACTIONS: ${taskIndex} / ${tasks.length}`;

      actions.replaceChildren();

      if (taskIndex >= tasks.length) {
        localStorage.setItem("hauntedNetEnding", "disconnect");
        horrorSettings.ending = "disconnect";
        renderEnding("disconnect");
        return;
      }

      const actionButton = makeButton(tasks[taskIndex].label, "danger", () => {
        const task = tasks[taskIndex];

        addDisconnectLog(task.message);
        taskIndex++;

        if (taskIndex === 2 && !failoverTriggered) {
          failoverTriggered = true;

          tasks.splice(2, 0, {
            label: "DISABLE REACTIVATED INTERFACE",
            message: "[OK] REACTIVATED INTERFACE DISABLED.",
          });

          status.textContent = "NETWORK STATUS: FAILOVER DETECTED";

          addDisconnectLog(
            "[WARNING] REMOTE PROCESS RESTORED THE PRIMARY INTERFACE.",
            true,
          );

          addDisconnectLog(
            "[SYSTEM] DISABLE THE REACTIVATED INTERFACE TO CONTINUE.",
            true,
          );

          triggerGlitch();
        } else if (taskIndex >= tasks.length) {
          status.textContent = "NETWORK STATUS: DISCONNECTED";
        }

        gsap.fromTo(
          consolePanel,
          { x: -2 },
          {
            x: 2,
            duration: 0.04,
            repeat: 3,
            yoyo: true,
            clearProps: "x",
          },
        );

        renderAction();
      });

      actions.appendChild(actionButton);
    }

    consolePanel.append(status, progress, log);

    endingContent.append(eyebrow, title, description, consolePanel, actions);

    endingScreen.hidden = false;
    focusDialogHeading(endingScreen);

    addDisconnectLog("[03:17:41] EMERGENCY DISCONNECT INITIATED.");
    addDisconnectLog("[SYSTEM] FOUR INITIAL ACTIONS REGISTERED.");

    renderAction();

    gsap.fromTo(
      [title, description, consolePanel, actions],
      { opacity: 0, y: 8 },
      {
        opacity: 1,
        y: 0,
        duration: 0.4,
        stagger: 0.1,
        ease: "power2.out",
      },
    );
  }

  function startContainmentSequence() {
    endingContent.replaceChildren();

    const eyebrow = createElement(
      "span",
      "horror-eyebrow",
      "DIRECTORY_0 / CONTAINMENT PROTOCOL",
    );

    const title = createElement("h1", "", "CONTAIN THE UNKNOWN");

    const description = createElement(
      "p",
      "containment-description",
      "The process cannot be terminated. Identify it, isolate its directory, and seal the archive before the intrusion spreads.",
    );

    const panel = createElement("div", "containment-console");
    const status = createElement(
      "p",
      "containment-status",
      "THREAT LEVEL: STABLE",
    );
    const progress = createElement(
      "p",
      "containment-progress",
      "PROTOCOL STEP: 1 / 3",
    );
    const prompt = createElement("p", "containment-prompt");
    const log = createElement("div", "containment-log");
    const actions = createElement("div", "containment-actions");

    let phase = 0;
    let mistakes = 0;
    let sealed = false;

    function addLog(message: string, danger = false) {
      const line = createElement(
        "p",
        danger ? "containment-log-line danger-text" : "containment-log-line",
        message,
      );

      log.appendChild(line);
      log.scrollTop = log.scrollHeight;

      gsap.from(line, {
        opacity: 0,
        x: -6,
        duration: 0.2,
      });
    }

    function updateStatus() {
      status.textContent =
        mistakes >= 2
          ? "THREAT LEVEL: CRITICAL"
          : mistakes === 1
            ? "THREAT LEVEL: ELEVATED"
            : "THREAT LEVEL: STABLE";

      progress.textContent = `PROTOCOL STEP: ${Math.min(phase + 1, 3)} / 3`;
    }

    function choose(label: string, correct: boolean, successMessage: string) {
      const button = makeButton(label, "danger", () => {
        if (sealed) return;

        actions.replaceChildren();

        if (!correct) {
          mistakes++;

          addLog(
            "[WARNING] INCORRECT ACTION. PROCESS ACTIVITY INCREASED.",
            true,
          );

          status.textContent =
            mistakes >= 2 ? "THREAT LEVEL: CRITICAL" : "THREAT LEVEL: ELEVATED";

          triggerGlitch();

          if (mistakes >= 3) {
            sealed = true;
            localStorage.setItem("hauntedNetContainmentFailed", "true");

            addLog("[ERROR] CONTAINMENT INTEGRITY LOST.", true);

            window.setTimeout(() => {
              localStorage.setItem("hauntedNetEnding", "containment");
              horrorSettings.ending = "containment";
              renderEnding("containment");
            }, 700);

            return;
          }

          addLog("[SYSTEM] REASSESS THE AVAILABLE EVIDENCE.");
          renderPhase();
          return;
        }

        addLog(successMessage);
        phase++;
        updateStatus();

        if (phase >= 3) {
          sealed = true;

          localStorage.setItem("hauntedNetEnding", "containment");

          localStorage.setItem(
            "hauntedNetContainmentFailed",
            mistakes > 0 ? "true" : "false",
          );

          horrorSettings.ending = "containment";

          status.textContent =
            mistakes === 0
              ? "THREAT LEVEL: NEUTRALIZED"
              : "THREAT LEVEL: CONTAINED — DAMAGE DETECTED";

          addLog("[SYSTEM] CONTAINMENT PROTOCOL COMPLETE.");

          window.setTimeout(() => {
            renderEnding("containment");
          }, 800);

          return;
        }

        renderPhase();
      });

      actions.appendChild(button);
    }

    function renderPhase() {
      actions.replaceChildren();
      updateStatus();

      if (phase === 0) {
        prompt.textContent =
          "STEP 1 — Which process has no identifiable owner?";

        choose("SYSTEM.EXE", false, "");

        choose("ARCHIVE.EXE", false, "");

        choose("USER_SESSION.EXE", false, "");

        choose(
          "NULL_SESSION.EXE",
          true,
          "[OK] UNKNOWN PROCESS IDENTIFIED: NULL_SESSION.EXE.",
        );

        return;
      }

      if (phase === 1) {
        prompt.textContent =
          "STEP 2 — Where should the unknown process be isolated?";

        choose("DELETE THE ARCHIVE", false, "");

        choose("RECONNECT TO THE REMOTE NODE", false, "");

        choose(
          "ISOLATE DIRECTORY_0",
          true,
          "[OK] DIRECTORY_0 ISOLATED FROM THE MAIN ARCHIVE.",
        );

        return;
      }

      prompt.textContent =
        "STEP 3 — The process is isolated. How will you seal it?";

      choose("RESTORE ALL NETWORK ROUTES", false, "");

      choose(
        "SEAL DIRECTORY_0 AND REVOKE ACCESS",
        true,
        "[OK] DIRECTORY SEALED. ALL ACCESS REVOKED.",
      );
    }

    panel.append(status, progress, prompt, log);

    endingContent.append(eyebrow, title, description, panel, actions);

    endingScreen.hidden = false;
    focusDialogHeading(endingScreen);

    addLog("[03:17:41] CONTAINMENT PROTOCOL INITIALIZED.");
    addLog("[SYSTEM] UNKNOWN PROCESS DETECTED IN DIRECTORY_0.");

    renderPhase();

    gsap.fromTo(
      [title, description, panel, actions],
      { opacity: 0, y: 8 },
      {
        opacity: 1,
        y: 0,
        duration: 0.4,
        stagger: 0.1,
        ease: "power2.out",
      },
    );
  }

  function startLastUserSequence() {
    endingContent.replaceChildren();

    const eyebrow = createElement(
      "span",
      "horror-eyebrow",
      "REMOTE SESSION / IDENTITY CHECK",
    );

    const title = createElement("h1", "", "WHO IS STILL ONLINE?");

    const description = createElement(
      "p",
      "lastuser-description",
      "A remote user is still connected. The archive claims the session belongs to you, but the login record says otherwise. Investigate before deciding what to do.",
    );

    const panel = createElement("div", "lastuser-console");
    const status = createElement(
      "p",
      "lastuser-status",
      "REMOTE SESSION: UNVERIFIED",
    );
    const progress = createElement(
      "p",
      "lastuser-progress",
      "INVESTIGATION: 1 / 3",
    );
    const prompt = createElement("p", "lastuser-prompt");
    const log = createElement("div", "lastuser-log");
    const actions = createElement("div", "lastuser-actions");

    let phase = 0;
    let mistakes = 0;
    let finished = false;

    function addLog(message: string, danger = false) {
      const line = createElement(
        "p",
        danger ? "lastuser-log-line danger-text" : "lastuser-log-line",
        message,
      );

      log.appendChild(line);
      log.scrollTop = log.scrollHeight;
    }

    function addChoice(label: string, onClick: () => void) {
      const button = makeButton(label, "", onClick);
      actions.appendChild(button);
    }

    function updateProgress() {
      progress.textContent = `INVESTIGATION: ${Math.min(phase + 1, 3)} / 3`;
    }

    function wrongChoice() {
      mistakes++;

      addLog(
        "[WARNING] VERIFICATION FAILED. REMOTE SESSION ACTIVITY INCREASED.",
        true,
      );

      status.textContent =
        mistakes >= 2
          ? "REMOTE SESSION: TAKING CONTROL"
          : "REMOTE SESSION: SUSPICIOUS";

      triggerGlitch();

      if (mistakes >= 3) {
        finished = true;

        localStorage.setItem("hauntedNetLastUserOutcome", "compromised");

        localStorage.setItem("hauntedNetEnding", "lastuser");
        horrorSettings.ending = "lastuser";

        addLog("[ERROR] REMOTE SESSION HAS OVERRIDDEN THE ARCHIVE.", true);

        window.setTimeout(() => {
          renderEnding("lastuser");
        }, 800);

        return;
      }

      renderPhase();
    }

    function correctChoice(message: string) {
      addLog(message);
      phase++;
      updateProgress();
      renderPhase();
    }

    function renderPhase() {
      if (finished) return;

      actions.replaceChildren();
      updateProgress();

      if (phase === 0) {
        prompt.textContent = "STEP 1 — Which record should you inspect first?";

        addChoice("SYSTEM BOOT RECORD", () => {
          wrongChoice();
        });

        addChoice("REMOTE LOGIN HISTORY", () => {
          correctChoice(
            "[OK] REMOTE LOGIN HISTORY OPENED. SESSION 03 HAS NO VERIFIED OWNER.",
          );
        });

        addChoice("LOCAL DISPLAY SETTINGS", () => {
          wrongChoice();
        });

        return;
      }

      if (phase === 1) {
        status.textContent = "REMOTE SESSION: OWNER UNKNOWN";

        prompt.textContent =
          "STEP 2 — Session 03 claims to be you. What should you trust?";

        addChoice("THE DISPLAY NAME MATCHES MINE", () => {
          wrongChoice();
        });

        addChoice("THE SESSION HAS NO VERIFIED OWNER", () => {
          correctChoice(
            "[OK] IDENTITY NOT VERIFIED. DISPLAY NAMES CAN BE COPIED.",
          );
        });

        addChoice("THE SESSION SAYS IT IS SAFE", () => {
          wrongChoice();
        });

        return;
      }

      status.textContent = "REMOTE SESSION: AWAITING YOUR DECISION";

      prompt.textContent =
        "STEP 3 — You have one final choice. What happens to Session 03?";

      addChoice("KEEP SESSION 03 ONLINE", () => {
        finished = true;

        localStorage.setItem(
          "hauntedNetLastUserOutcome",
          mistakes > 0 ? "accepted-damaged" : "accepted",
        );

        localStorage.setItem("hauntedNetEnding", "lastuser");
        horrorSettings.ending = "lastuser";

        addLog("[SYSTEM] REMOTE SESSION ACCESS GRANTED.");

        window.setTimeout(() => {
          renderEnding("lastuser");
        }, 500);
      });

      addChoice("FORCE SESSION 03 TO LOG OUT", () => {
        finished = true;

        localStorage.setItem(
          "hauntedNetLastUserOutcome",
          mistakes > 0 ? "logout-damaged" : "logout",
        );

        localStorage.setItem("hauntedNetEnding", "lastuser");
        horrorSettings.ending = "lastuser";

        addLog("[SYSTEM] LOGOUT REQUEST SENT TO SESSION 03.");

        window.setTimeout(() => {
          renderEnding("lastuser");
        }, 500);
      });
    }

    panel.append(status, progress, prompt, log);

    endingContent.append(eyebrow, title, description, panel, actions);

    endingScreen.hidden = false;
    focusDialogHeading(endingScreen);

    addLog("[03:17:41] REMOTE SESSION DETECTED.");
    addLog("[SYSTEM] IDENTITY VERIFICATION REQUIRED.");

    renderPhase();

    gsap.fromTo(
      [title, description, panel, actions],
      { opacity: 0, y: 8 },
      {
        opacity: 1,
        y: 0,
        duration: 0.4,
        stagger: 0.1,
        ease: "power2.out",
      },
    );
  }

  return {
    startDisconnectSequence,
    startContainmentSequence,
    startLastUserSequence,
  };
}
