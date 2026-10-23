# Patient Text Snippets

A simple web page that lists common patient text messages. Click **Copy** on any snippet and paste it into the clinical system's text messaging tool.

No build step, no database, no patient data — it's plain HTML, CSS and JavaScript.

## Deploying on Vercel

1. In Vercel, choose **Add New → Project** and import this GitHub repository.
2. Leave the Framework Preset as **Other** and the build settings empty.
3. Click **Deploy**. Every push to `main` will redeploy automatically.

## Adding snippets

There are two kinds of snippet:

- **Shared snippets** live in [`snippets.json`](snippets.json) and are seen by everyone. Edit the file on GitHub (pencil icon), add an entry like the one below, and commit — Vercel redeploys within a minute.

  ```json
  {
    "id": "smear-due",
    "title": "Cervical screening due",
    "category": "Screening",
    "text": "You are due your cervical screening test. Please book an appointment with the practice nurse via reception."
  }
  ```

  `id` must be unique; `category` is optional. Watch the commas between entries.

- **Personal snippets** are added with the **+ Add snippet** button. They are saved in that browser only (they won't appear on other PCs, and are lost if browser data is cleared). Use **Export all snippets** at the bottom of the page to download a `snippets.json` containing everything — that file can replace the one in the repo to make them shared.

## Running locally

Any static file server works, e.g. `npx serve .` or `python3 -m http.server`, then open the printed address.
