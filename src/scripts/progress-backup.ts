const endingKeys = [
  "disconnect",
  "containment",
  "lastuser",
  "witness",
  "inheritance",
  "archive_complete",
] as const;

const clueKeys = ["readme", "incident", "eventlog"] as const;

export const progressBackupKeys = {
  local: [
    "hauntedNetClues",
    "hauntedNetSecretUnlocked",
    "hauntedNetUnknownDecrypted",
    "hauntedNetJumpscares",
    "hauntedNetGlitches",
    "hauntedNetAudio",
    "hauntedNetEnding",
    "hauntedNetEntityThreat",
    "hauntedNetEntityStage",
    "hauntedNetEntityLastVisit",
    "hauntedNetEndingHistory",
    "hauntedNetContainmentFailed",
    "hauntedNetLastUserOutcome",
  ],
  session: ["hauntedNetEntityActions", "hauntedNetReturnMessageShown"],
} as const;

type BackupStorage = "local" | "session";

export interface ProgressBackup {
  app: "HAUNTED://NET";
  version: 1;
  exportedAt: string;
  local: Record<string, string>;
  session: Record<string, string>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isOneOf<T extends readonly string[]>(
  value: string,
  options: T,
): value is T[number] {
  return (options as readonly string[]).includes(value);
}

function isBooleanString(value: string): boolean {
  return value === "true" || value === "false";
}

function validateValue(key: string, value: string): boolean {
  if (
    [
      "hauntedNetSecretUnlocked",
      "hauntedNetUnknownDecrypted",
      "hauntedNetJumpscares",
      "hauntedNetGlitches",
      "hauntedNetAudio",
      "hauntedNetContainmentFailed",
      "hauntedNetReturnMessageShown",
    ].includes(key)
  ) {
    return isBooleanString(value);
  }

  if (key === "hauntedNetClues" || key === "hauntedNetEndingHistory") {
    try {
      const parsed: unknown = JSON.parse(value);
      if (
        !Array.isArray(parsed) ||
        !parsed.every((item) => typeof item === "string")
      ) {
        return false;
      }
      const options = key === "hauntedNetClues" ? clueKeys : endingKeys;
      return (
        parsed.every((item) => isOneOf(item, options)) &&
        new Set(parsed).size === parsed.length
      );
    } catch {
      return false;
    }
  }

  if (key === "hauntedNetEnding") {
    return value === "" || isOneOf(value, endingKeys);
  }

  if (key === "hauntedNetEntityThreat") {
    const threat = Number(value);
    return Number.isFinite(threat) && threat >= 0 && threat <= 100;
  }

  if (key === "hauntedNetEntityStage") {
    const stage = Number(value);
    return Number.isInteger(stage) && stage >= 0 && stage <= 4;
  }

  if (key === "hauntedNetEntityActions") {
    const actions = Number(value);
    return Number.isSafeInteger(actions) && actions >= 0;
  }

  if (key === "hauntedNetEntityLastVisit") {
    return Number.isFinite(Date.parse(value));
  }

  if (key === "hauntedNetLastUserOutcome") {
    return [
      "accepted",
      "accepted-damaged",
      "logout",
      "logout-damaged",
      "compromised",
    ].includes(value);
  }

  return false;
}

function readStorage(
  storage: Pick<Storage, "getItem">,
  type: BackupStorage,
): Record<string, string> {
  const values: Record<string, string> = {};

  for (const key of progressBackupKeys[type]) {
    const value = storage.getItem(key);
    if (value !== null) values[key] = value;
  }

  return values;
}

export function createProgressBackup(
  localStorage: Pick<Storage, "getItem">,
  sessionStorage: Pick<Storage, "getItem">,
  exportedAt = new Date().toISOString(),
): string {
  const backup: ProgressBackup = {
    app: "HAUNTED://NET",
    version: 1,
    exportedAt,
    local: readStorage(localStorage, "local"),
    session: readStorage(sessionStorage, "session"),
  };

  const contents = JSON.stringify(backup, null, 2);
  parseProgressBackup(contents);
  return contents;
}

function parseStorage(
  value: unknown,
  type: BackupStorage,
): Record<string, string> {
  if (!isRecord(value)) {
    throw new Error(`The backup's ${type} storage section is invalid.`);
  }

  const allowedKeys = progressBackupKeys[type] as readonly string[];
  const values: Record<string, string> = {};

  for (const [key, item] of Object.entries(value)) {
    if (!allowedKeys.includes(key)) {
      throw new Error(`The backup contains an unsupported ${type} key.`);
    }
    if (typeof item !== "string" || !validateValue(key, item)) {
      throw new Error(`The saved value for ${key} is invalid.`);
    }
    values[key] = item;
  }

  return values;
}

export function parseProgressBackup(contents: string): ProgressBackup {
  if (contents.length > 256_000) {
    throw new Error("The backup file is too large.");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(contents);
  } catch {
    throw new Error("The selected file is not valid JSON.");
  }

  if (!isRecord(parsed)) {
    throw new Error("The selected file is not a HAUNTED://NET backup.");
  }

  const expectedProperties = [
    "app",
    "version",
    "exportedAt",
    "local",
    "session",
  ];
  if (
    Object.keys(parsed).some((key) => !expectedProperties.includes(key)) ||
    expectedProperties.some((key) => !(key in parsed))
  ) {
    throw new Error("The backup file has an unsupported format.");
  }
  if (parsed.app !== "HAUNTED://NET" || parsed.version !== 1) {
    throw new Error("This backup was created by an unsupported app version.");
  }
  if (
    typeof parsed.exportedAt !== "string" ||
    !Number.isFinite(Date.parse(parsed.exportedAt))
  ) {
    throw new Error("The backup's export date is invalid.");
  }

  const backup: ProgressBackup = {
    app: "HAUNTED://NET",
    version: 1,
    exportedAt: parsed.exportedAt,
    local: parseStorage(parsed.local, "local"),
    session: parseStorage(parsed.session, "session"),
  };

  const clues = JSON.parse(backup.local.hauntedNetClues ?? "[]") as string[];
  const secretUnlocked = backup.local.hauntedNetSecretUnlocked === "true";
  const unknownDecrypted = backup.local.hauntedNetUnknownDecrypted === "true";
  if (
    (secretUnlocked || unknownDecrypted) &&
    clues.length !== clueKeys.length
  ) {
    throw new Error(
      "The backup's decrypted progress is missing required clues.",
    );
  }
  if (unknownDecrypted && !secretUnlocked) {
    throw new Error("The backup's decrypted file state is inconsistent.");
  }

  return backup;
}

export function restoreProgressBackup(
  backup: ProgressBackup,
  localStorage: Pick<Storage, "getItem" | "removeItem" | "setItem">,
  sessionStorage: Pick<Storage, "getItem" | "removeItem" | "setItem">,
): void {
  const validated = parseProgressBackup(JSON.stringify(backup));
  const targets = [
    {
      storage: localStorage,
      keys: progressBackupKeys.local,
      values: validated.local,
    },
    {
      storage: sessionStorage,
      keys: progressBackupKeys.session,
      values: validated.session,
    },
  ];
  const previous = targets.map(({ storage, keys }) =>
    keys.map((key) => [key, storage.getItem(key)] as const),
  );

  try {
    targets.forEach(({ storage, keys, values }) => {
      keys.forEach((key) => storage.removeItem(key));
      Object.entries(values).forEach(([key, value]) =>
        storage.setItem(key, value),
      );
    });
  } catch (error) {
    let rollbackFailed = false;

    targets.forEach(({ storage, keys }, index) => {
      try {
        keys.forEach((key) => storage.removeItem(key));
        previous[index].forEach(([key, value]) => {
          if (value !== null) storage.setItem(key, value);
        });
      } catch {
        rollbackFailed = true;
      }
    });

    throw new Error(
      rollbackFailed
        ? `Could not save the backup, and the previous progress could not be fully restored: ${String(error)}`
        : `Could not save the backup; previous progress was restored: ${String(error)}`,
    );
  }
}
