# WhatsApp Sender

A local Deno app that schedules WhatsApp Desktop messages (and optional attachments from
`data/output/`) via macOS Accessibility automation.

```bash
deno task dev
```

Open <http://localhost:8000>. Pick a group from [`data/groups.yaml`](data/groups.yaml), type a
message, optionally choose a file under `data/output/`, pick a send time, and schedule. The Deno
server keeps running and fires the send even if the browser tab is closed.

## Requirements

- macOS with **WhatsApp Desktop** installed
- **Accessibility** permission for the process that launches Deno (Terminal, Cursor, or `deno`
  itself), so the Swift sender under [`data/whatsapp/`](data/whatsapp/) can drive the WhatsApp UI
- Deno

## Configuration

- App identity and paths: [`src/config.ts`](src/config.ts)
- WhatsApp chat titles: [`data/groups.yaml`](data/groups.yaml) (exact names as they appear in
  WhatsApp; edit on disk and refresh the page)
- Attachments: files under [`data/output/`](data/output/)
- Scheduled jobs persist in `data/jobs.json` (gitignored)

## Development note

Keep the HTML and generated DOM as simple and shallow as possible. Avoid unnecessary wrappers and
preserve descriptive IDs for major elements. Run `deno task check` before handing off changes.
