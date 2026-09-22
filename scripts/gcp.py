#!/usr/bin/env python3
"""Google Cloud, run by Claude: the Maps key, the budget and the daily caps.

Reads the service-account key from `.gcp-key.json` (gitignored), signs in as
`claude-maps`, and talks to Google's REST APIs directly — no gcloud, no pip.
The key's permanent home is the Vercel env var `GCP_SA_KEY_B64` (development
target only); a session fetches it from there into `.gcp-key.json`.

    python3 scripts/gcp.py whoami     the key works
    python3 scripts/gcp.py status     billing, budget, key lock, caps
    python3 scripts/gcp.py budget     $5/month, alerts at 25/50/100%
    python3 scripts/gcp.py lock-key   Maps key -> 4 services, our sites only
    python3 scripts/gcp.py quotas     daily limits per Maps service
    python3 scripts/gcp.py cap        set the daily caps below
"""

import base64
import json
import os
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
KEY_FILE = os.environ.get("GCP_KEY_FILE", os.path.join(ROOT, ".gcp-key.json"))

PROJECT = "project-3d21fc15-a1c6-4de3-ac4"
PROJECT_NUMBER = "873692776186"
BILLING = "017464-43BF62-7C8967"
BUDGET_NAME = "Sviy Hub - Maps"
BUDGET_USD = "5"
MAPS_KEY_NAME = "Maps Platform API Key"

MAPS_SERVICES = [
    "maps-backend.googleapis.com",  # Maps JavaScript: the map itself
    "geocoding-backend.googleapis.com",  # address -> pin
    "places.googleapis.com",  # Places (New): autocomplete + the pin fallback
    "places-backend.googleapis.com",  # Places (legacy), still used by the JS loader
]
REFERRERS = [
    "https://sviy-hub.vercel.app/*",
    "https://sviy-hub-ivan-k-s-projects.vercel.app/*",
    "https://sviy-hub-git-main-ivan-k-s-projects.vercel.app/*",
    "https://sviy-hub-git-staging-ivan-k-s-projects.vercel.app/*",
    "http://localhost:3000/*",
    "http://127.0.0.1:3000/*",
]
# Per day. Far above what two people use, far below the free monthly allowance
# (10,000 a month on each), so a copied key cannot run up a bill.
DAILY_CAPS = {
    "maps-backend.googleapis.com": 1000,
    "geocoding-backend.googleapis.com": 500,
    "places.googleapis.com": 500,
}


def b64url(data: bytes) -> bytes:
    return base64.urlsafe_b64encode(data).rstrip(b"=")


def access_token() -> str:
    try:
        with open(KEY_FILE) as handle:
            key = json.load(handle)
    except FileNotFoundError:
        sys.exit(f"No key at {KEY_FILE}. Fetch GCP_SA_KEY_B64 from Vercel and base64-decode it there.")

    now = int(time.time())
    header = b64url(json.dumps({"alg": "RS256", "typ": "JWT"}).encode())
    claims = b64url(
        json.dumps(
            {
                "iss": key["client_email"],
                "scope": "https://www.googleapis.com/auth/cloud-platform",
                "aud": key["token_uri"],
                "iat": now,
                "exp": now + 3600,
            }
        ).encode()
    )
    signing_input = header + b"." + claims

    # The private key only ever touches a 0600 temp file for the one openssl call.
    with tempfile.NamedTemporaryFile("w", delete=False) as pem:
        pem.write(key["private_key"])
    try:
        os.chmod(pem.name, 0o600)
        signature = subprocess.run(
            ["openssl", "dgst", "-sha256", "-sign", pem.name],
            input=signing_input,
            capture_output=True,
            check=True,
        ).stdout
    finally:
        os.remove(pem.name)

    body = urllib.parse.urlencode(
        {
            "grant_type": "urn:ietf:params:oauth:grant-type:jwt-bearer",
            "assertion": (signing_input + b"." + b64url(signature)).decode(),
        }
    ).encode()
    with urllib.request.urlopen(key["token_uri"], body) as response:
        return json.load(response)["access_token"]


_TOKEN = None


def call(method: str, url: str, body=None):
    global _TOKEN
    _TOKEN = _TOKEN or access_token()
    data = json.dumps(body).encode() if body is not None else None
    request = urllib.request.Request(url, data=data, method=method)
    request.add_header("Authorization", f"Bearer {_TOKEN}")
    request.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(request) as response:
            text = response.read().decode()
            return json.loads(text) if text else {}
    except urllib.error.HTTPError as error:
        detail = error.read().decode()
        try:
            detail = json.loads(detail).get("error", {}).get("message", detail)
        except ValueError:
            pass
        raise SystemExit(f"{method} {url.split('?')[0]} -> {error.code}: {detail}")


def wait(operation: dict, base: str):
    """Long-running operations: poll until done, at most about a minute."""
    for _ in range(30):
        if operation.get("done"):
            if "error" in operation:
                raise SystemExit(f"Operation failed: {operation['error']}")
            return operation
        time.sleep(2)
        operation = call("GET", f"{base}/{operation['name']}")
    raise SystemExit(f"Operation still running: {operation.get('name')}")


# --- commands ---------------------------------------------------------------


def whoami():
    service = call("GET", f"https://serviceusage.googleapis.com/v1/projects/{PROJECT}/services/maps-backend.googleapis.com")
    with open(KEY_FILE) as handle:
        email = json.load(handle)["client_email"]
    print(f"Signed in as {email}")
    print(f"Project {PROJECT}: Maps JavaScript API is {service.get('state')}")


def find_budget():
    listing = call("GET", f"https://billingbudgets.googleapis.com/v1/billingAccounts/{BILLING}/budgets")
    for budget in listing.get("budgets", []):
        if budget.get("displayName") == BUDGET_NAME:
            return budget
    return None


def budget():
    body = {
        "displayName": BUDGET_NAME,
        "budgetFilter": {"projects": [f"projects/{PROJECT_NUMBER}"]},
        "amount": {"specifiedAmount": {"currencyCode": "USD", "units": BUDGET_USD}},
        "thresholdRules": [{"thresholdPercent": p} for p in (0.25, 0.5, 1.0)],
    }
    existing = find_budget()
    if existing:
        result = call(
            "PATCH",
            f"https://billingbudgets.googleapis.com/v1/{existing['name']}"
            "?updateMask=budgetFilter,amount,thresholdRules",
            body,
        )
        print(f"Budget updated: {result['displayName']} (${BUDGET_USD}/month, alerts 25/50/100%)")
    else:
        result = call("POST", f"https://billingbudgets.googleapis.com/v1/billingAccounts/{BILLING}/budgets", body)
        print(f"Budget created: {result['displayName']} (${BUDGET_USD}/month, alerts 25/50/100%)")


def maps_key():
    listing = call("GET", f"https://apikeys.googleapis.com/v2/projects/{PROJECT}/locations/global/keys")
    for key in listing.get("keys", []):
        if key.get("displayName") == MAPS_KEY_NAME:
            return key
    raise SystemExit(f"No API key named {MAPS_KEY_NAME!r}")


def lock_key():
    key = maps_key()
    body = {
        "restrictions": {
            "browserKeyRestrictions": {"allowedReferrers": REFERRERS},
            "apiTargets": [{"service": service} for service in MAPS_SERVICES],
        }
    }
    operation = call(
        "PATCH",
        f"https://apikeys.googleapis.com/v2/{key['name']}?updateMask=restrictions",
        body,
    )
    wait(operation, "https://apikeys.googleapis.com/v2")
    print(f"{MAPS_KEY_NAME}: {len(MAPS_SERVICES)} services, {len(REFERRERS)} sites")


def daily_limits(service: str):
    listing = call(
        "GET",
        f"https://serviceusage.googleapis.com/v1beta1/projects/{PROJECT}/services/{service}"
        "/consumerQuotaMetrics?view=FULL",
    )
    for metric in listing.get("metrics", []):
        for limit in metric.get("consumerQuotaLimits", []):
            if "/d/" in limit.get("unit", ""):
                buckets = limit.get("quotaBuckets", [])
                effective = buckets[0].get("effectiveLimit") if buckets else None
                yield metric.get("displayName", metric["metric"]), limit, effective


def quotas():
    for service in DAILY_CAPS:
        print(service)
        for name, limit, effective in daily_limits(service):
            print(f"   {name}: {effective} per day")


def cap():
    for service, value in DAILY_CAPS.items():
        for name, limit, _ in daily_limits(service):
            operation = call(
                "POST",
                f"https://serviceusage.googleapis.com/v1beta1/{limit['name']}/consumerOverrides?force=true",
                {"overrideValue": str(value)},
            )
            wait(operation, "https://serviceusage.googleapis.com/v1beta1")
            print(f"{service} / {name}: capped at {value} per day")


def status():
    try:
        info = call("GET", f"https://cloudbilling.googleapis.com/v1/projects/{PROJECT}/billingInfo")
        print(f"Billing: {'ON' if info.get('billingEnabled') else 'OFF'} ({info.get('billingAccountName', '-')})")
    except SystemExit as error:
        print(f"Billing: could not read ({error})")
    found = find_budget()
    if found:
        units = found["amount"].get("specifiedAmount", {}).get("units")
        rules = ", ".join(f"{int(r['thresholdPercent'] * 100)}%" for r in found.get("thresholdRules", []))
        print(f"Budget: {found['displayName']} ${units}/month, alerts at {rules}")
    else:
        print("Budget: none")
    restrictions = maps_key().get("restrictions", {})
    targets = [t["service"] for t in restrictions.get("apiTargets", [])]
    referrers = restrictions.get("browserKeyRestrictions", {}).get("allowedReferrers", [])
    print(f"Maps key: {len(targets)} services, {len(referrers) or 'ANY'} sites")
    quotas()


COMMANDS = {
    "whoami": whoami,
    "status": status,
    "budget": budget,
    "lock-key": lock_key,
    "quotas": quotas,
    "cap": cap,
}

if __name__ == "__main__":
    if len(sys.argv) != 2 or sys.argv[1] not in COMMANDS:
        sys.exit(__doc__)
    COMMANDS[sys.argv[1]]()
