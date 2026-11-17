"""Same-origin contact API for the Nexovolt static website.

Submission data is appended to a configured Google Sheets tab, then a Gmail
notification is sent. No credentials or customer data are stored in this file.
"""

from __future__ import annotations

import json
import os
import re
import smtplib
import threading
import time
import uuid
from collections import deque
from datetime import datetime, timezone
from email.message import EmailMessage
from pathlib import Path
from typing import Any

from flask import Flask, abort, jsonify, request, send_from_directory
from dotenv import load_dotenv
from werkzeug.middleware.proxy_fix import ProxyFix

APP_DIR = Path(__file__).resolve().parent
load_dotenv(APP_DIR / ".env")
SHEETS_SCOPE = "https://www.googleapis.com/auth/spreadsheets"
MAX_REQUEST_BYTES = 16 * 1024
RATE_LIMIT_COUNT = 5
RATE_LIMIT_WINDOW_SECONDS = 60 * 60

HEADERS = [
    "Received at (UTC)",
    "Submission ID",
    "Full name",
    "Company",
    "Designation",
    "City / state",
    "Business email",
    "Phone",
    "Industry",
    "Requirement",
    "Site issue",
    "Available evidence",
    "Preferred contact time",
    "Consent",
    "Total quotation",
]
RECORD_KEYS = [
    "received_at_utc",
    "submission_id",
    "name",
    "company",
    "designation",
    "location",
    "email",
    "phone",
    "industry",
    "requirement",
    "message",
    "evidence",
    "contact_time",
    "consent",
    "quotation_total",
]

INDUSTRIES = {
    "automotive-and-manufacturing",
    "healthcare-and-pharma",
    "railways-and-infrastructure",
    "commercial-and-research-facilities",
    "fmcg-and-process-industries",
    "other",
}
REQUIREMENTS = {
    "harmonic-study-analysis",
    "power-quality-assessment",
    "harmonic-mitigation",
    "power-factor-apfc-retrofit",
    "energy-audit-optimisation",
    "custom-engineering-power-system-study",
    "other",
}
EMAIL_PATTERN = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
PHONE_PATTERN = re.compile(r"^[+0-9() .-]{7,20}$")
SHEET_ID_PATTERN = re.compile(r"^[A-Za-z0-9_-]{20,200}$")
SHEET_URL_PATTERN = re.compile(
    r"^https://docs\.google\.com/spreadsheets/d/([A-Za-z0-9_-]{20,200})(?:/|$)"
)

app = Flask(__name__, static_folder=None)
app.config["MAX_CONTENT_LENGTH"] = MAX_REQUEST_BYTES

trusted_proxy_count = int(os.getenv("TRUSTED_PROXY_COUNT", "0"))
if not 0 <= trusted_proxy_count <= 5:
    raise ValueError("TRUSTED_PROXY_COUNT must be between 0 and 5")
if trusted_proxy_count:
    # Configure this only when the service is reachable exclusively through
    # the stated number of trusted proxies; otherwise forwarded IPs are spoofable.
    app.wsgi_app = ProxyFix(
        app.wsgi_app,
        x_for=trusted_proxy_count,
        x_proto=trusted_proxy_count,
    )

_rate_lock = threading.Lock()
_rate_buckets: dict[str, deque[float]] = {}
_next_rate_cleanup = 0.0


def _env_flag(name: str) -> bool:
    return os.getenv(name, "").strip().lower() in {"1", "true", "yes", "on"}


def _spreadsheet_id() -> str:
    raw_value = os.getenv("GOOGLE_SPREADSHEET_ID", "").strip()
    match = SHEET_URL_PATTERN.match(raw_value)
    if match:
        return match.group(1)
    return raw_value if SHEET_ID_PATTERN.fullmatch(raw_value) else ""


def _load_google_credentials():
    from google.oauth2.service_account import Credentials

    credentials_json = os.getenv("GOOGLE_SERVICE_ACCOUNT_JSON", "").strip()
    credentials_file = os.getenv("GOOGLE_SERVICE_ACCOUNT_FILE", "").strip()
    if credentials_json:
        info = json.loads(credentials_json)
        return Credentials.from_service_account_info(info, scopes=[SHEETS_SCOPE])
    if credentials_file:
        key_path = Path(credentials_file).expanduser()
        if not key_path.is_absolute():
            key_path = APP_DIR / key_path
        return Credentials.from_service_account_file(
            str(key_path.resolve()), scopes=[SHEETS_SCOPE]
        )
    raise ValueError("Google service-account credentials are not configured")


def _recipient_settings() -> tuple[str, str, str]:
    username = os.getenv("GMAIL_USERNAME", "nexovoltsolutions@gmail.com").strip()
    password = os.getenv("GMAIL_APP_PASSWORD", "").replace(" ", "")
    recipient = os.getenv(
        "GMAIL_RECIPIENT", "nexovoltsolutions@gmail.com"
    ).strip()
    return username, password, recipient


def _configuration_ready() -> bool:
    if not _env_flag("CONTACT_SUBMISSIONS_ENABLED"):
        return False
    if not _env_flag("CONTACT_PRIVACY_APPROVED"):
        return False
    if not _spreadsheet_id():
        return False
    username, password, recipient = _recipient_settings()
    if not (
        EMAIL_PATTERN.fullmatch(username)
        and password
        and EMAIL_PATTERN.fullmatch(recipient)
    ):
        return False
    try:
        _load_google_credentials()
    except Exception:
        return False
    return True


def _normalise_text(value: Any, field: str, max_length: int) -> str:
    if not isinstance(value, str):
        raise ValueError(f"Invalid {field}.")
    value = value.strip()
    if not value or len(value) > max_length:
        raise ValueError(f"Check the {field} field.")
    if any(ord(char) < 32 and char not in "\n\r\t" for char in value):
        raise ValueError(f"Invalid {field}.")
    return value


def _optional_text(value: Any, field: str, max_length: int) -> str:
    if value is None or value == "":
        return ""
    if not isinstance(value, str):
        raise ValueError(f"Invalid {field}.")
    value = value.strip()
    if len(value) > max_length:
        raise ValueError(f"Check the {field} field.")
    if any(ord(char) < 32 and char not in "\n\r\t" for char in value):
        raise ValueError(f"Invalid {field}.")
    return value


def _validate_submission(payload: Any) -> dict[str, str]:
    if not isinstance(payload, dict):
        raise ValueError("Invalid submission.")

    name = _normalise_text(payload.get("name"), "name", 120)
    company = _normalise_text(payload.get("company"), "company", 180)
    location = _normalise_text(payload.get("location"), "city/state", 120)
    email = _normalise_text(payload.get("email"), "email", 254).lower()
    phone = _normalise_text(payload.get("phone"), "phone", 20)
    industry = _normalise_text(payload.get("industry"), "industry", 80)
    requirement = _normalise_text(payload.get("requirement"), "requirement", 100)
    message = _normalise_text(payload.get("message"), "site description", 4000)

    if not EMAIL_PATTERN.fullmatch(email) or "\r" in email or "\n" in email:
        raise ValueError("Enter a valid business email address.")
    if not PHONE_PATTERN.fullmatch(phone) or sum(char.isdigit() for char in phone) < 7:
        raise ValueError("Enter a valid phone number.")
    if industry not in INDUSTRIES:
        raise ValueError("Choose a valid industry.")
    if requirement not in REQUIREMENTS:
        raise ValueError("Choose a valid requirement.")
    if payload.get("consent") != "yes":
        raise ValueError("Consent is required to send this enquiry.")

    return {
        "name": name,
        "company": company,
        "designation": _optional_text(payload.get("designation"), "designation", 120),
        "location": location,
        "email": email,
        "phone": phone,
        "industry": industry,
        "requirement": requirement,
        "message": message,
        "evidence": _optional_text(payload.get("evidence"), "evidence", 500),
        "contact_time": _optional_text(
            payload.get("contact-time"), "preferred contact time", 120
        ),
    }


def _rate_limited(client_key: str) -> bool:
    global _next_rate_cleanup
    now = time.monotonic()
    with _rate_lock:
        if now >= _next_rate_cleanup:
            expired = [
                key
                for key, timestamps in _rate_buckets.items()
                if not timestamps
                or now - timestamps[-1] >= RATE_LIMIT_WINDOW_SECONDS
            ]
            for key in expired:
                del _rate_buckets[key]
            _next_rate_cleanup = now + 600

        bucket = _rate_buckets.setdefault(client_key, deque())
        while bucket and now - bucket[0] >= RATE_LIMIT_WINDOW_SECONDS:
            bucket.popleft()
        if len(bucket) >= RATE_LIMIT_COUNT:
            return True
        bucket.append(now)
        return False


def _quoted_sheet_name(name: str) -> str:
    return "'" + name.replace("'", "''") + "'"


def _sheets_service():
    from googleapiclient.discovery import build

    credentials = _load_google_credentials()
    return build("sheets", "v4", credentials=credentials, cache_discovery=False)


def _append_to_google_sheet(record: dict[str, str]) -> None:
    spreadsheet_id = _spreadsheet_id()
    worksheet_name = os.getenv("GOOGLE_WORKSHEET_NAME", "Enquiries").strip()
    if not worksheet_name or len(worksheet_name) > 100:
        raise ValueError("Invalid Google worksheet name")

    service = _sheets_service()
    spreadsheet = (
        service.spreadsheets()
        .get(
            spreadsheetId=spreadsheet_id,
            fields="sheets.properties(sheetId,title)",
        )
        .execute()
    )
    sheet_properties = [
        sheet["properties"]
        for sheet in spreadsheet.get("sheets", [])
        if sheet.get("properties", {}).get("title") == worksheet_name
    ]

    if sheet_properties:
        sheet_id = sheet_properties[0]["sheetId"]
    else:
        result = (
            service.spreadsheets()
            .batchUpdate(
                spreadsheetId=spreadsheet_id,
                body={"requests": [{"addSheet": {"properties": {"title": worksheet_name}}}]},
            )
            .execute()
        )
        sheet_id = result["replies"][0]["addSheet"]["properties"]["sheetId"]

    quoted_name = _quoted_sheet_name(worksheet_name)
    header_range = f"{quoted_name}!A1:O1"
    header_result = (
        service.spreadsheets()
        .values()
        .get(spreadsheetId=spreadsheet_id, range=header_range)
        .execute()
    )
    existing_headers = header_result.get("values", [])
    if not existing_headers:
        (
            service.spreadsheets()
            .values()
            .update(
                spreadsheetId=spreadsheet_id,
                range=header_range,
                valueInputOption="RAW",
                body={"values": [HEADERS]},
            )
            .execute()
        )
        (
            service.spreadsheets()
            .batchUpdate(
                spreadsheetId=spreadsheet_id,
                body={
                    "requests": [
                        {
                            "updateSheetProperties": {
                                "properties": {
                                    "sheetId": sheet_id,
                                    "gridProperties": {"frozenRowCount": 1},
                                },
                                "fields": "gridProperties.frozenRowCount",
                            }
                        }
                    ]
                },
            )
            .execute()
        )
    elif existing_headers[0] != HEADERS:
        raise ValueError(
            "The Enquiries worksheet already has different headers; no data was written."
        )

    values = [record[key] for key in RECORD_KEYS]
    (
        service.spreadsheets()
        .values()
        .append(
            spreadsheetId=spreadsheet_id,
            range=header_range,
            valueInputOption="RAW",
            insertDataOption="INSERT_ROWS",
            body={"values": [values]},
        )
        .execute()
    )


def _send_gmail_notification(record: dict[str, str]) -> None:
    username, app_password, recipient = _recipient_settings()
    message = EmailMessage()
    message["Subject"] = "New Nexovolt website enquiry " + record["submission_id"]
    message["From"] = username
    message["To"] = recipient
    message["Reply-To"] = record["email"]
    message.set_content(
        "\n".join(
            [
                "A new website enquiry was recorded in the Google Sheet.",
                "",
                "Submission ID: " + record["submission_id"],
                "Received at (UTC): " + record["received_at_utc"],
                "Total quotation: " + record["quotation_total"],
                "",
                "Full name: " + record["name"],
                "Company: " + record["company"],
                "Designation: " + (record["designation"] or "Not provided"),
                "City / state: " + record["location"],
                "Business email: " + record["email"],
                "Phone: " + record["phone"],
                "Industry: " + record["industry"],
                "Requirement: " + record["requirement"],
                "Site issue: " + record["message"],
                "Available evidence: " + (record["evidence"] or "Not provided"),
                "Preferred contact time: " + (record["contact_time"] or "Not provided"),
                "Consent: " + record["consent"],
            ]
        )
    )

    with smtplib.SMTP_SSL("smtp.gmail.com", 465, timeout=20) as smtp:
        smtp.login(username, app_password)
        smtp.send_message(message)


@app.after_request
def add_security_headers(response):
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("X-Frame-Options", "DENY")
    response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
    response.headers.setdefault("Permissions-Policy", "geolocation=()")
    if request.path.startswith("/api/"):
        response.headers["Cache-Control"] = "no-store"
    return response


@app.get("/")
def homepage():
    return send_from_directory(APP_DIR, "index.html")


@app.get("/api/status")
def api_status():
    return jsonify({"accepting_submissions": _configuration_ready()})


@app.post("/api/contact")
def submit_contact():
    if not _configuration_ready():
        return jsonify(
            {
                "recorded": False,
                "message": "Online submissions are not configured. Please contact Nexovolt by phone or email.",
            }
        ), 503

    if request.mimetype != "application/json":
        return jsonify({"recorded": False, "message": "Invalid submission format."}), 415
    payload = request.get_json(silent=True)

    if isinstance(payload, dict) and str(payload.get("website", "")).strip():
        return jsonify(
            {
                "recorded": True,
                "message": "Thank you. Your enquiry has been received.",
            }
        ), 201

    client_key = request.remote_addr or "unknown"
    if _rate_limited(client_key):
        return jsonify(
            {
                "recorded": False,
                "message": "Too many attempts. Please wait and try again, or use the contact details on this page.",
            }
        ), 429

    try:
        fields = _validate_submission(payload)
    except ValueError as error:
        return jsonify({"recorded": False, "message": str(error)}), 400

    record = {
        **fields,
        "received_at_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "submission_id": "NV-" + uuid.uuid4().hex[:12].upper(),
        "consent": "Yes",
        "quotation_total": "Pending engineer review",
    }

    try:
        _append_to_google_sheet(record)
    except Exception as error:
        app.logger.error(
            "Google Sheets write failed for submission %s (%s)",
            record["submission_id"],
            type(error).__name__,
        )
        return jsonify(
            {
                "recorded": False,
                "message": "We could not confirm whether your enquiry was recorded. Please contact Nexovolt using the details on this page before retrying.",
            }
        ), 503

    try:
        _send_gmail_notification(record)
    except Exception as error:
        app.logger.error(
            "Gmail notification failed for submission %s (%s)",
            record["submission_id"],
            type(error).__name__,
        )
        return jsonify(
            {
                "recorded": True,
                "notification_sent": False,
                "submission_id": record["submission_id"],
                "message": (
                    "Your enquiry was recorded. Email notification is delayed. "
                    "Please call Nexovolt if your enquiry is urgent."
                ),
            }
        ), 202

    return jsonify(
        {
            "recorded": True,
            "notification_sent": True,
            "submission_id": record["submission_id"],
            "message": (
                "Thank you. Your enquiry was recorded and sent to Nexovolt. "
                "The quotation is pending engineer review."
            ),
        }
    ), 201


@app.get("/<path:filename>")
def public_files(filename: str):
    path = Path(filename)
    parts = path.parts
    if (
        path.is_absolute()
        or not parts
        or any(part.startswith(".") for part in parts)
        or "_archive" in parts
        or "source" in parts
    ):
        abort(404)

    if len(parts) == 1:
        allowed = path.suffix.lower() in {
            ".html",
            ".css",
            ".js",
            ".txt",
            ".xml",
            ".ico",
        }
    else:
        allowed = (
            parts[0] == "assets"
            and path.suffix.lower() in {".png", ".jpg", ".jpeg", ".webp", ".svg"}
        )
    if not allowed:
        abort(404)
    return send_from_directory(APP_DIR, filename)


@app.errorhandler(404)
def page_not_found(error):
    if request.path.startswith("/api/"):
        return jsonify({"recorded": False, "message": "API route not found."}), 404
    return send_from_directory(APP_DIR, "404.html"), 404


@app.errorhandler(413)
def request_too_large(error):
    return jsonify({"recorded": False, "message": "The submission is too large."}), 413


if __name__ == "__main__":
    app.run(
        host=os.getenv("HOST", "127.0.0.1"),
        port=int(os.getenv("PORT", "8000")),
        debug=False,
    )
