# SingleFax for n8n

Send a fax from an n8n workflow. Quote, status, credits, and the received-fax inbox use the same API key. You are charged only when delivery succeeds.

This is not Secure Mode. Do not send protected health information. HIPAA stays on the SingleFax website.

## Nodes

| Node | What it does |
| --- | --- |
| SingleFax | Send Fax, Get Fax Status, Quote Fax, Get Credits, List Received Faxes |
| SingleFax Received Fax | Polls the inbox. The first run records faxes already there and does not emit them. |
| SingleFax Fax Delivered | Webhook for `fax.delivered` and `fax.failed`. Verifies `SingleFax-Signature`. |

Send Fax takes the binary file from the previous node, or a public `https` URL. It uploads the original file, then creates the fax. Do not convert the file to PDF first.

## Credential

Create an API key at https://singlefax.com/dashboard.

| Operation | Scope |
| --- | --- |
| Send Fax | `fax:send` |
| Get Fax Status, Quote Fax | `fax:read` |
| List Received Faxes, On Received Fax | `inbox:read` |
| Get Credits | `credits:read` |

The key stays in the n8n credential. This package does not contain one.

## Delivery trigger

1. Activate the workflow so n8n shows the production webhook URL.
2. Add that URL at https://singlefax.com/dashboard/webhooks.
3. Enable `fax.delivered` and `fax.failed`.
4. Paste the signing secret (`whsec_…`, shown once) into the credential field **Webhook Signing Secret**.

The node checks the HMAC over the raw request body. Other event types are acknowledged and do not start the workflow.

## Install

- Self-hosted n8n: Settings → Community nodes → install `@singlefax/n8n-nodes-singlefax`.
- n8n Cloud: the node appears in the nodes panel after n8n verifies it.

Example workflow: [`workflows/send-fax.json`](workflows/send-fax.json). Replace the destination number and attach your own file.

## Release

Merging to `main` runs tests, bumps the patch version if npm is behind, commits `chore(n8n): x.y.z [skip ci]`, and publishes with GitHub Actions provenance. Push a `vX.Y.Z` tag to publish that exact version without a patch bump. Manual publish: Actions → Publish → Run workflow with **publish** checked.
