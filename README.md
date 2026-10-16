# HAUNTED://NET

An interactive horror archive built with Astro and TypeScript. Explore the files,
event log, and terminal to recover clues and choose an ending.

## Development

Run these commands from the project root:

| Command            | Action                                           |
| ------------------ | ------------------------------------------------ |
| `npm install`      | Install dependencies                             |
| `npm run dev`      | Start the development server                     |
| `npm test`         | Run progress backup and restore unit tests       |
| `npm run test:e2e` | Build the site and run Chromium end-to-end tests |
| `npm run build`    | Build the static site                            |
| `npm run preview`  | Preview the production build                     |

For the first end-to-end test run, install its browser with
`npx playwright install chromium`.

## Progress and privacy

Progress, settings, and ending history are stored in this browser. They are not
uploaded. Clearing the site's browser data removes them. In the in-game
**SETTINGS**, use **EXPORT PROGRESS** to download a backup or **IMPORT PROGRESS**
to restore one. Import replaces this game's saved progress and reloads the page;
it does not modify unrelated browser storage. If browser storage is blocked,
progress lasts only until the page closes.

On supported mobile browsers, fullscreen attempts to lock the display to
landscape. Browsers that do not support or permit orientation locking display a
message asking the player to rotate the device manually.
