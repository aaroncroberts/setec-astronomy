# Beads Setup Guide — Blank Repo

How to properly initialize beads in a fresh repository with a DoltHub remote.

---

## Prerequisites

- `bd` CLI installed and in PATH (`bd --version`)
- DoltHub account with a repository created (e.g. `aaroncroberts/setec-astronomy`)
- DoltHub credentials available (`~/.dolt/creds/` or `dolt login` completed)

---

## Step 1: Initialize beads

From the project root:

```bash
bd init --prefix <project-prefix>
```

The prefix becomes the issue ID namespace (e.g. `setec` → `setec-1`, `setec-2`).

This creates `.beads/` with:

- `config.yaml` — project configuration
- `metadata.json` — backend settings
- `dolt/` — local Dolt database
- `hooks/` — git hook scripts

---

## Step 2: Add the DoltHub remote

**Important:** Always use `bd dolt remote add`, never `dolt remote add` directly (it adds to the wrong directory).

```bash
bd dolt remote add origin <dolthub-org>/<repo-name>
```

Example:

```bash
bd dolt remote add origin aaroncroberts/setec-astronomy
```

Verify it was added:

```bash
bd dolt remote list
```

---

## Step 3: Update `.gitignore`

Add the credential key so it never gets committed:

```
# Beads runtime credentials (sensitive, never commit)
.beads/.beads-credential-key
```

Also ensure these are already present (bd init usually adds them):

```
.dolt/
*.db
```

---

## Step 4: Initial pull

```bash
bd dolt pull
```

On a brand new remote this will be a no-op (nothing to pull). That's fine.

---

## Step 5: Verify

```bash
bd doctor --verbose
```

Expected state:

- ✓ Dolt Connection — Connected successfully
- ✓ Dolt Schema — All required tables present
- ✓ Git Hooks — All recommended hooks installed
- No `✖` errors

Warnings to expect and ignore on a new branch:

- `⚠ Git Upstream` — No upstream for your branch (expected until you push)
- `⚠ CGO` checks — Skipped, requires CGO build (normal in macOS release builds)

---

## Step 6: First push to DoltHub

After creating your first issue, push to sync:

```bash
bd dolt push
```

---

## Common Issues

### "remote 'origin' not found" on `bd dolt pull`

The CLI remote and SQL remote got out of sync. Run:

```bash
bd dolt remote list          # Check current state
bd dolt remote add origin <org>/<repo>   # Re-add if missing
```

### Credential key tracked in git

```bash
git rm --cached .beads/.beads-credential-key
# Then add to .gitignore as shown in Step 3
```

Or: `bd doctor --fix --yes` will untrack it automatically.

### "No automatic fix available" warnings from `bd doctor --fix`

Some warnings (upstream branch, plugin version) require manual action:

- **Upstream**: Normal on ephemeral/feature branches — skip unless pushing to remote
- **Plugin version**: Run `/plugin update beads@beads-marketplace` in Claude Code

---

## Daily Workflow

```bash
# Start of session
bd dolt pull            # Pull latest from DoltHub
bd ready                # See what's available to work on

# End of session
bd dolt pull            # Pull before push to avoid conflicts
git add <files>
git commit -m "feat: ..."
```
