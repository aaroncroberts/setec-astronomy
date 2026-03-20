# Release Process

This document defines the mandatory steps for every setec-astronomy release.
Follow them in order. Do not skip steps.

---

## Philosophy

Work is visible from day one. The draft PR is opened at the **start** of the
release cycle, not the end. Commits accumulate on `aaron/agentic-coder` and
are pushed continuously. CI runs on every push. Contributors can participate
via the open PR. The PR stays open until CI is fully green, then it is merged,
tagged, and released.

```
Open draft PR → commit & push loop → CI passes → mark ready → merge → tag → release
```

All work happens on `aaron/agentic-coder`. **Never delete this branch.**

---

## Step 1 — Open the draft PR

At the start of any release cycle, open a draft PR from `aaron/agentic-coder`
targeting `main`. Do this before writing any code.

```bash
gh pr create \
  --base main \
  --draft \
  --title "feat: vX.Y.Z — <brief summary of the release>" \
  --body "$(cat <<'EOF'
## Summary
<!-- Fill in as work progresses -->

## Changes
<!-- Updated as commits land -->

## Test plan
- [ ] npm run ci passes (typecheck + lint + test)
- [ ] npm run typecheck clean
- [ ] npm run lint clean
- [ ] npm run format:check clean
- [ ] npm run test passes
- [ ] All CI jobs green
- [ ] CHANGELOG updated
- [ ] Version bumped in package.json

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Step 2 — Development loop

Work proceeds in normal commit cycles on `aaron/agentic-coder`. After each
logical unit of work:

```bash
git add <files>
git commit -m "feat|fix|chore|docs: description"
git push origin aaron/agentic-coder
```

**Picking up main's changes** (do this whenever main advances):

```bash
git fetch origin main
git merge origin/main --no-edit
# Resolve any conflicts locally, then:
git push origin aaron/agentic-coder
```

Never rebase a branch with an open PR — merge only.

---

## Step 3 — Local quality gates (before marking ready)

When all planned work is complete, run the full quality gate locally:

```bash
# Full CI gate — typecheck + lint + test
npm run ci

# Or individually:
npm run typecheck     # TypeScript type checking
npm run lint          # ESLint
npm run format:check  # Prettier formatting check
npm run test          # Vitest unit tests
```

All checks must exit 0. Fix any failures and push before marking the PR ready.

---

## Step 4 — Mark the PR ready for review

```bash
gh pr ready <pr-number>
```

Update the PR body with the final summary and change list.

---

## Step 5 — Wait for CI

Monitor the CI run:

```bash
gh run list --branch aaron/agentic-coder --limit 5
gh run watch <run-id>
```

**Do not proceed to Step 6 until all CI jobs are green.** If CI fails, fix
the issue on `aaron/agentic-coder`, push the fix, and wait for CI to re-run.

---

## Step 6 — Merge the PR

Once CI is fully green:

```bash
gh pr merge <pr-number> --squash --delete-branch=false
```

`--delete-branch=false` ensures `aaron/agentic-coder` is preserved on the
remote. Never use `--delete-branch` or `--delete-branch=true`.

---

## Step 7 — Tag the release

After the PR is merged:

```bash
git checkout main
git pull origin main
git tag vX.Y.Z
git push origin vX.Y.Z
```

Verify the release workflow started:

```bash
gh run list --branch main --limit 3
```

---

## Step 8 — Verify the release

```bash
gh release view vX.Y.Z
```

Confirm:
- GitHub release exists with the correct tag
- Release notes match the CHANGELOG `[X.Y.Z]` section
- Cloudflare Worker deployment succeeded (check Wrangler dashboard)

---

## Step 9 — Return to aaron/agentic-coder

Sync the working branch with the release commit so the next cycle starts clean:

```bash
git checkout aaron/agentic-coder
git fetch origin main
git merge origin/main --no-edit
git push origin aaron/agentic-coder
```

---

## Branch rules

| Branch | Purpose | Delete after release? |
| :--- | :--- | :--- |
| `main` | Release branch — always green, always releasable | Never |
| `aaron/agentic-coder` | Primary working branch | **Never** |

---

## Quick reference card

```bash
# Step 1 — Open draft PR
gh pr create --base main --draft --title "feat: vX.Y.Z — ..."

# Step 2 — Development loop
git commit -m "..." && git push origin aaron/agentic-coder

# Merge main changes
git fetch origin main && git merge origin/main --no-edit && git push

# Step 3 — Quality gates
npm run ci

# Step 4 — Mark ready
gh pr ready <pr-number>

# Step 5 — Watch CI
gh run list --branch aaron/agentic-coder --limit 5

# Step 6 — Merge (only when CI green)
gh pr merge <pr-number> --squash --delete-branch=false

# Step 7 — Tag
git checkout main && git pull origin main
git tag vX.Y.Z && git push origin vX.Y.Z

# Step 8 — Verify
gh release view vX.Y.Z

# Step 9 — Sync working branch
git checkout aaron/agentic-coder
git fetch origin main && git merge origin/main --no-edit
git push origin aaron/agentic-coder
```
