# SignPath Code Signing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable free EV code signing for Windows installers via SignPath Foundation, eliminating SmartScreen warnings and Defender quarantine.

**Architecture:** The release workflow splits into 3 jobs: build (all platforms) → sign-windows (SignPath) → release (GitHub Release with signed Windows + unsigned others). A LICENSE file is added to satisfy the SignPath Foundation OSS requirement.

**Tech Stack:** GitHub Actions, SignPath action v2, Tauri action v0

---

### Task 1: Add MIT LICENSE file

**Files:**
- Create: `LICENSE`

- [ ] **Step 1: Create LICENSE**

```text
MIT License

Copyright (c) 2026 Nico Arriola

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

- [ ] **Step 2: Commit**

```bash
git add LICENSE
git commit -m "chore: add MIT LICENSE for SignPath Foundation eligibility"
```

---

### Task 2: Rewrite release workflow with SignPath signing

**Files:**
- Modify: `.github/workflows/release.yml` (replace entirely)

- [ ] **Step 1: Replace release.yml with 3-job workflow**

The new workflow has:
- **Job `build`**: Builds on all 4 platforms, uploads artifacts per platform
- **Job `sign-windows`**: Downloads Windows artifact, submits to SignPath, uploads signed artifact
- **Job `release`**: Creates GitHub Release with all artifacts (signed Windows + unsigned others)

```yaml
name: Release

on:
  push:
    tags: ['v*']

permissions:
  contents: write
  actions: read

jobs:
  build:
    strategy:
      matrix:
        include:
          - platform: ubuntu-22.04
            target: x86_64-unknown-linux-gnu
            artifact-name: linux-x64
          - platform: macos-latest
            target: aarch64-apple-darwin
            artifact-name: macos-arm64
          - platform: macos-13
            target: x86_64-apple-darwin
            artifact-name: macos-x64
          - platform: windows-latest
            target: x86_64-pc-windows-msvc
            artifact-name: windows-x64

    runs-on: ${{ matrix.platform }}

    steps:
      - uses: actions/checkout@v4

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm

      - name: Install Rust stable
        uses: dtolnay/rust-toolchain@stable

      - name: Install Linux dependencies
        if: matrix.platform == 'ubuntu-22.04'
        run: |
          sudo apt-get update
          sudo apt-get install -y libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev

      - name: Install npm dependencies
        run: npm ci

      - name: Build Tauri app
        uses: tauri-apps/tauri-action@v0
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}

      - name: Upload build artifacts
        uses: actions/upload-artifact@v4
        with:
          name: ${{ matrix.artifact-name }}
          path: |
            src-tauri/target/release/bundle/msi/*.msi
            src-tauri/target/release/bundle/nsis/*.exe
            src-tauri/target/release/bundle/deb/*.deb
            src-tauri/target/release/bundle/appimage/*.AppImage
            src-tauri/target/release/bundle/dmg/*.dmg
            src-tauri/target/release/bundle/macos/*.app
          if-no-files-found: ignore

  sign-windows:
    needs: build
    runs-on: ubuntu-latest
    steps:
      - name: Download unsigned Windows artifacts
        uses: actions/download-artifact@v4
        with:
          name: windows-x64
          path: unsigned/

      - name: Upload unsigned artifact for SignPath
        id: upload-unsigned
        uses: actions/upload-artifact@v4
        with:
          name: windows-x64-unsigned
          path: unsigned/

      - name: Submit signing request to SignPath
        id: sign
        uses: signpath/github-action-submit-signing-request@v2
        with:
          api-token: '${{ secrets.SIGNPATH_API_TOKEN }}'
          organization-id: '${{ secrets.SIGNPATH_ORGANIZATION_ID }}'
          project-slug: 'azu'
          signing-policy-slug: 'release-signing'
          github-artifact-id: '${{ steps.upload-unsigned.outputs.artifact-id }}'
          wait-for-completion: true
          output-artifact-directory: 'signed/'
          wait-for-completion-timeout-in-seconds: 600

      - name: Upload signed Windows artifacts
        uses: actions/upload-artifact@v4
        with:
          name: windows-x64-signed
          path: signed/

  release:
    needs: [build, sign-windows]
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Download signed Windows artifacts
        uses: actions/download-artifact@v4
        with:
          name: windows-x64-signed
          path: release-assets/

      - name: Download Linux artifacts
        uses: actions/download-artifact@v4
        with:
          name: linux-x64
          path: release-assets/
        continue-on-error: true

      - name: Download macOS ARM artifacts
        uses: actions/download-artifact@v4
        with:
          name: macos-arm64
          path: release-assets/
        continue-on-error: true

      - name: Download macOS x64 artifacts
        uses: actions/download-artifact@v4
        with:
          name: macos-x64
          path: release-assets/
        continue-on-error: true

      - name: Create GitHub Release
        uses: softprops/action-gh-release@v2
        with:
          tag_name: ${{ github.ref_name }}
          name: 'Azu ${{ github.ref_name }}'
          body: |
            ## Azu ${{ github.ref_name }}

            ### Downloads
            - **Windows** (.msi / .exe) — Signed with EV certificate via SignPath
            - **macOS** (.dmg) — Unsigned
            - **Linux** (.deb / .AppImage) — Unsigned

            See the [changelog](https://github.com/nikklasblz/Azu/commits/${{ github.ref_name }}) for details.
          draft: true
          files: release-assets/**/*
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

- [ ] **Step 2: Validate YAML syntax**

Run: `cd D:/Azu && npx yaml-lint .github/workflows/release.yml || python -c "import yaml; yaml.safe_load(open('.github/workflows/release.yml'))"`
Expected: No syntax errors

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/release.yml
git commit -m "feat: release workflow with SignPath EV code signing for Windows"
```

---

### Task 3: Clean up temporary files

**Files:**
- Delete: `docs/icon-review.html`

- [ ] **Step 1: Remove icon review HTML (was temporary)**

```bash
rm docs/icon-review.html
```

- [ ] **Step 2: Commit all icon + signing changes**

```bash
git add -A
git commit -m "chore: unified icons from SVG + cleanup temp files"
```

---

### Task 4: Post-implementation — user manual steps

These are NOT code tasks. After the code is merged and pushed:

- [ ] **Step 1: Apply to SignPath Foundation**

Go to https://signpath.org/apply, submit with the GitHub account that owns `nikklasblz/Azu`. The repo now has a LICENSE (MIT) which is required.

- [ ] **Step 2: Wait for approval (1-2 weeks)**

SignPath reviews the repo and approves.

- [ ] **Step 3: Configure SignPath dashboard**

1. Create project "Azu" with slug `azu`
2. Add artifact configuration: type "Windows Installer" (supports .msi and .exe)
3. Create signing policy `release-signing` using the EV certificate
4. Add trusted build system: link repo `nikklasblz/Azu`

- [ ] **Step 4: Add GitHub Secrets**

In GitHub repo Settings > Secrets and variables > Actions, add:
- `SIGNPATH_API_TOKEN` — from SignPath dashboard > API Tokens
- `SIGNPATH_ORGANIZATION_ID` — from SignPath dashboard > Organization settings

- [ ] **Step 5: Test with a release tag**

```bash
git tag v0.1.1
git push origin v0.1.1
```

Watch the Actions tab — should build → sign → release.
