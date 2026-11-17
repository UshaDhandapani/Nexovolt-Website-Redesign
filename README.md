# Nexovolt website

A multi-page website served by a small Python application. The application also provides the contact endpoint, appending enquiries to a Google Sheet and sending a Gmail notification.

## Pages

- `index.html` is the homepage.
- `services.html`, `products.html`, and `industries.html` describe engineering services and applications.
- `case-studies.html` explains the evidence standard; it does not claim completed case studies.
- `resources.html` identifies planned topics, not published articles.
- `tools.html` is an assessment-preparation guide.
- `contact.html` collects assessment enquiries. Its fields remain disabled unless the Python service, Sheet, email sender, and privacy approval are configured.
- `privacy.html` describes the website and contact-data handling.
- `404.html` is the not-found page.

## Run locally

Use Python 3.10 or newer. In PowerShell:

```powershell
py -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
Copy-Item .env.example .env
python app.py
```

Open `http://127.0.0.1:8000`. The contact form will stay disabled until all service settings are valid and both approval flags are enabled. The built-in Flask server is for local development; deploy behind HTTPS with a production WSGI server such as Waitress.

## Configure Google Sheets and Gmail

1. Create or choose a Google Cloud project and enable the [Google Sheets API](https://console.cloud.google.com/apis/library/sheets.googleapis.com).
2. Create a service account and a key. Store the key outside the website folder and any synced/shared workspace (or use a host secret manager); set `GOOGLE_SERVICE_ACCOUNT_FILE` to that file's absolute path. Never commit the key or paste it into chat.
3. Copy the service account's `client_email` from its key and share the target spreadsheet with that address as an Editor. Put the spreadsheet URL or ID in `GOOGLE_SPREADSHEET_ID`. The service creates an `Enquiries` tab if it does not exist and writes a header row. If the tab already has different headers, it refuses to write rather than mix data into an unknown layout.
4. Set `GMAIL_USERNAME` to the Nexovolt Gmail account, `GMAIL_RECIPIENT` to `nexovoltsolutions@gmail.com`, and `GMAIL_APP_PASSWORD` to an app password created for that account. Keep the password in the hosting secret manager or process environment, not in this synced website folder. The Gmail account may require 2-Step Verification and app-password access.
5. Before accepting real enquiries, Nexovolt must approve the privacy notice, retention period, Sheet access, and hosting arrangement. Then set `CONTACT_PRIVACY_APPROVED=1` and `CONTACT_SUBMISSIONS_ENABLED=1` in the hosting environment and verify a real end-to-end submission. Leave both at `0` until those decisions and credentials are complete.

Sheets access uses a server-side service account ([Google's setup guide](https://developers.google.com/identity/protocols/oauth2/service-account)). The API appends submitted rows using the [Sheets values append method](https://developers.google.com/workspace/sheets/api/reference/rest/v4/spreadsheets.values/append). Gmail delivery uses SMTP over SSL on port 465; confirm the host allows outbound connections to that port. Create the Gmail app password from [Google Account app passwords](https://support.google.com/mail/answer/185833). The quotation column and notification state that the total is **Pending engineer review** because no approved pricing formula was provided.

The app limits each client IP to five attempts per hour in process memory. If a network timeout happens after the form is sent, the page advises contacting Nexovolt before retrying because the server may already have recorded the enquiry. Run one app process unless the rate limiter is replaced with a shared store. This limit is a basic abuse control, not a substitute for monitoring or a managed anti-bot service.

## Deployment

GitHub Pages and other static-only hosts cannot run `app.py`; use a Python-capable host and serve this directory through the same HTTPS origin as the pages. Configure its WSGI entry point as `app:app`, set the environment variables from `.env.example` in the host's secret/configuration settings, and use a single process for the built-in rate limit. Set `TRUSTED_PROXY_COUNT` to the actual number of trusted proxies in front of the app only if the app cannot be reached around them; keep it `0` for a direct connection. Do not expose `.env`, service-account keys, or private server files.

## Shared files and assets

- `app.py` serves the public site files and handles `/api/status` and `/api/contact`.
- `nexovolt.css` contains site styles.
- `nexovolt.js` handles navigation, theme selection, progressive reveals, copyright year, and contact form submission.
- `nexovolt-theme-init.js` applies the saved or automatic theme before the page renders.
- `assets/` contains website images. Original logo files are under `assets/source/` and are not served by the Python app.

Keep page links relative so the static files work from a project subpath as well as a domain root. Before publishing, confirm the production domain and project base path, then set canonical URLs and the sitemap for that host.
