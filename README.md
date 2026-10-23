# Patient Text Snippets

A web page that lists common patient text messages for Annan North Surgery. Click **Copy** on any snippet and paste it into the clinical system's text messaging tool.

Every message automatically ends with "Annan North Surgery" on a new line (set by `SIGN_OFF` in `app.js`), so don't type it into the snippet text.

No patient data is stored, only message templates.

## Adding and editing snippets

Anyone with the link can view and copy snippets. Editing is hidden by default:

1. On a PC on the NHS network, click **Add / edit snippets** and enter the practice PIN.
2. The header turns purple, and the **+ Add snippet**, **Edit** and **Delete** buttons appear. Changes apply for everyone straight away.
3. Click **Done editing** when finished.

Editing also switches off after 10 minutes without activity, or when the page is reloaded. The PIN isn't remembered, so it's needed every time. After 10 wrong guesses from the same address, PIN entry is blocked for 15 minutes.

Off the NHS network, the **Add / edit snippets** button isn't shown, and the server refuses any changes. The page shows the internet address it sees, which helps if the allowed range needs updating.

## Settings (Vercel → Project → Settings → Environment Variables)

| Variable | Purpose |
| --- | --- |
| `EDIT_PIN` | The practice PIN needed to edit. If not set, no PIN is asked for. |
| `ALLOWED_IP_RANGES` | Addresses allowed to edit, comma-separated. Defaults to `62.6.52.0/24` (every address starting `62.6.52.`). Example: `62.6.52.0/24, 194.1.2.0/24`. |
| `KV_REST_API_URL`, `KV_REST_API_TOKEN` | Set automatically when the Upstash database is connected (see below). |

After changing any of these, redeploy (**Deployments → ⋯ → Redeploy**) for them to take effect.

## Deploying on Vercel

1. In Vercel, choose **Add New → Project** and import this GitHub repository. Leave the Framework Preset as **Other** and click **Deploy**. Every push to `main` redeploys automatically.
2. Add the database: in the project, go to **Storage → Create Database → Upstash for Redis**, choose the free plan, and connect it to this project with the default `KV` prefix.
3. Add `EDIT_PIN` (see above), then redeploy.

If the database isn't connected, the page says so and shows the starter list from `snippets.json`, read-only.

## Resetting the snippet list

[`snippets.json`](snippets.json) holds the starter list and a `version` number. On first use, its snippets are copied into the database. After that, the database is the master copy, and edits made in the app are kept.

To reset the shared list to the file's contents:

1. Edit `snippets.json` on GitHub with the snippets you want. Each entry looks like this (`category` is optional; watch the commas between entries):

   ```json
   {"id": "smear-due", "title": "Cervical screening due", "category": "Screening", "text": "You are due your cervical screening test. Please book an appointment with the practice nurse via reception."}
   ```

2. Change `"version"` to a new number (e.g. `1` → `2`) and commit.

Vercel redeploys, and the next time anyone opens the page the shared list is **replaced** with the file's contents. Anything added in the app that isn't in the file is removed, so use **Export all snippets** first if you might want it. Editing the file without changing the version number has no effect.

## Backups

**Export all snippets**, at the bottom of the page, downloads a copy. In editing mode, **Import snippets** adds snippets from such a file, skipping any that already exist.

## Running locally

Any static file server (e.g. `npx serve .`) shows the page read-only from `snippets.json`. To run the editing features locally, use `npx vercel dev` with the environment variables above set.
