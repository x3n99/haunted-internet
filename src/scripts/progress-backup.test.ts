import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createProgressBackup,
  parseProgressBackup,
  restoreProgressBackup,
} from "./progress-backup.ts";

function createStorage(initial: Record<string, string> = {}): Storage {
  const values = new Map(Object.entries(initial));

  return {
    get length() {
      return values.size;
    },
    clear() {
      values.clear();
    },
    getItem(key: string) {
      return values.get(key) ?? null;
    },
    key(index: number) {
      return [...values.keys()][index] ?? null;
    },
    removeItem(key: string) {
      values.delete(key);
    },
    setItem(key: string, value: string) {
      values.set(key, String(value));
    },
  };
}

test("progress backup round-trips supported local and session state", () => {
  const local = createStorage({
    hauntedNetClues: '["readme","eventlog"]',
    hauntedNetJumpscares: "false",
    hauntedNetEntityThreat: "48",
    hauntedNetEndingHistory: '["disconnect","containment"]',
    unrelatedPreference: "not exported",
  });
  const session = createStorage({
    hauntedNetEntityActions: "7",
    hauntedNetReturnMessageShown: "true",
  });

  const contents = createProgressBackup(
    local,
    session,
    "2026-10-16T00:00:00.000Z",
  );
  const backup = parseProgressBackup(contents);

  assert.deepEqual(backup.local, {
    hauntedNetClues: '["readme","eventlog"]',
    hauntedNetJumpscares: "false",
    hauntedNetEntityThreat: "48",
    hauntedNetEndingHistory: '["disconnect","containment"]',
  });
  assert.deepEqual(backup.session, {
    hauntedNetEntityActions: "7",
    hauntedNetReturnMessageShown: "true",
  });
  assert.equal(backup.exportedAt, "2026-10-16T00:00:00.000Z");
});

test("rejects malformed JSON, unknown formats, and unsupported storage keys", () => {
  assert.throws(() => parseProgressBackup("{"), /valid JSON/);
  assert.throws(
    () => parseProgressBackup(JSON.stringify({ app: "another app" })),
    /unsupported format/,
  );

  const backup = JSON.parse(
    createProgressBackup(createStorage(), createStorage()),
  ) as Record<string, unknown>;
  backup.local = { hauntedNetSecret: "unexpected" };
  assert.throws(
    () => parseProgressBackup(JSON.stringify(backup)),
    /unsupported local key/,
  );
});

test("rejects invalid progress values and oversized files", () => {
  const backup = JSON.parse(
    createProgressBackup(createStorage(), createStorage()),
  ) as Record<string, unknown>;
  backup.local = { hauntedNetEntityThreat: "101" };
  assert.throws(
    () => parseProgressBackup(JSON.stringify(backup)),
    /value .* invalid/,
  );
  assert.throws(() => parseProgressBackup(" ".repeat(256_001)), /too large/);
});

test("rejects decrypted progress when its clue prerequisites are missing", () => {
  const backup = JSON.parse(
    createProgressBackup(createStorage(), createStorage()),
  ) as Record<string, unknown>;
  backup.local = { hauntedNetSecretUnlocked: "true" };
  assert.throws(
    () => parseProgressBackup(JSON.stringify(backup)),
    /missing required clues/,
  );
});

test("restore replaces app progress while preserving unrelated browser data", () => {
  const local = createStorage({
    hauntedNetClues: '["readme"]',
    hauntedNetAudio: "false",
    otherAppPreference: "keep",
  });
  const session = createStorage({ hauntedNetEntityActions: "2" });
  const backup = parseProgressBackup(
    createProgressBackup(
      createStorage({
        hauntedNetClues: '["readme","incident","eventlog"]',
        hauntedNetSecretUnlocked: "true",
      }),
      createStorage({ hauntedNetEntityActions: "9" }),
    ),
  );

  restoreProgressBackup(backup, local, session);

  assert.equal(
    local.getItem("hauntedNetClues"),
    '["readme","incident","eventlog"]',
  );
  assert.equal(local.getItem("hauntedNetSecretUnlocked"), "true");
  assert.equal(local.getItem("hauntedNetAudio"), null);
  assert.equal(local.getItem("otherAppPreference"), "keep");
  assert.equal(session.getItem("hauntedNetEntityActions"), "9");
});

test("restore rolls back both stores when a write fails", () => {
  const local = createStorage({
    hauntedNetClues: '["readme"]',
    unrelated: "preserved",
  });
  const session = createStorage({ hauntedNetEntityActions: "2" });
  const originalSetItem = session.setItem.bind(session);
  let shouldFail = true;
  session.setItem = (key, value) => {
    if (key === "hauntedNetEntityActions" && shouldFail) {
      shouldFail = false;
      throw new Error("storage quota exceeded");
    }
    originalSetItem(key, value);
  };

  const backup = parseProgressBackup(
    createProgressBackup(
      createStorage({ hauntedNetClues: '["readme","incident"]' }),
      createStorage({ hauntedNetEntityActions: "9" }),
    ),
  );

  assert.throws(
    () => restoreProgressBackup(backup, local, session),
    /previous progress was restored/,
  );
  assert.equal(local.getItem("hauntedNetClues"), '["readme"]');
  assert.equal(local.getItem("unrelated"), "preserved");
  assert.equal(session.getItem("hauntedNetEntityActions"), "2");
});
