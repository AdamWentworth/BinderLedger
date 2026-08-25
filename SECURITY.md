# Security Policy

## Supported Version

BinderLedger is an actively developed personal application. Only the current
`main` branch and the currently deployed commit receive security fixes.

## Reporting a Vulnerability

Use GitHub's private **Report a vulnerability** form in the repository Security
tab. Do not open a public issue for suspected vulnerabilities, leaked
credentials, private scans, or production data.

Include the affected component, reproduction steps, expected impact, and any
suggested mitigation. Reports are reviewed on a best-effort basis; this project
does not currently offer a formal response-time guarantee or bug bounty.

## Deployment Boundary

The current application is designed for a trusted private LAN. Its API is not
authenticated and must not be exposed to the public internet. Authentication,
authorization, and transport security are required before any external or
multi-user deployment.

Production credentials, provider responses, card scans, media, and database
backups are intentionally excluded from this repository and its container
images.
