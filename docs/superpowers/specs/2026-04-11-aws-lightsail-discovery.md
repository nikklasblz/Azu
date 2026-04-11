# AWS Lightsail Discovery — Cloud Integration

## Overview

Auto-discover AWS Lightsail instances and add them as SSH hosts in the host picker. Uses AWS SDK default credential chain (env vars or ~/.aws/credentials). Single Tauri command, one button in SshHostPicker.

## Backend

### `src-tauri/src/ssh/cloud_aws.rs` (new)

Single function:
- `discover_lightsail_instances()` → `Vec<SshHostConfig>`
- Uses `aws-sdk-lightsail` to call `get_instances()`
- Converts each instance to `SshHostConfig`:
  - `id`: `"aws-lightsail-{instance_name}"`
  - `name`: instance name
  - `host`: public IP address (skip instances without public IP)
  - `port`: 22
  - `user`: "ubuntu" (Lightsail default for Ubuntu/Debian/Amazon Linux)
  - `identity_file`: None (user configures via Azu host editor if needed)
  - `tags`: `["aws", "lightsail", region]`
  - `source`: `"aws-lightsail"`
- Filters: only instances with state "running" and a public IP
- Uses `aws_config::load_defaults(BehaviorVersion::latest())` for credentials

### Tauri Command

- `aws_lightsail_discover()` → `Vec<SshHostConfig>`
- Calls discover function, returns the list
- Frontend merges them into the host picker display (does NOT persist to ssh-hosts.json — ephemeral discovery)

## Frontend

### `src/components/Grid/SshHostPicker.tsx` (modified)

- "Scan AWS" button at bottom (before "Add new host")
- On click: calls `ssh.awsLightsailDiscover()`, appends results to a local `awsHosts` signal
- Shows AWS hosts in the list with "AWS" badge
- If error (no credentials, network): shows inline error

## Dependencies

- `aws-sdk-lightsail` — Lightsail API client
- `aws-config` — Default credential chain loader

## Error Handling

- Missing credentials: returns error string "AWS credentials not configured"
- Network/API errors: returns error string, shown inline in host picker
- No instances found: returns empty list (no error)

## Out of Scope

- Start/stop/create/delete instances
- Persisting discovered hosts (ephemeral, re-scan each time)
- Other cloud providers
- Custom SSH user per instance (always "ubuntu" for now)
