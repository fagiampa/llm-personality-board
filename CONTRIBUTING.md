# Contributing to LLM Personality Board

Thanks for your interest in improving LLM Personality Board! Contributions of
all kinds are welcome: bug reports, ideas, documentation, tests and code.

This document explains how to contribute and what we expect from every
contribution, including those made with the help of AI tools.

## Before you start

- **Small fixes** (typos, small bugs, docs): just open a pull request.
- **Anything bigger** (new features, refactors, changes to the architecture):
  open an issue first and describe what you want to do. Wait for feedback
  before writing a lot of code, so nobody wastes time on work that can't be
  merged.
- Looking for a place to start? Check the issues labeled
  [`good first issue`](../../labels/good%20first%20issue).

## Development setup

```bash
git clone https://github.com/fagiampa/llm-personality-board.git
cd llm-personality-board
npm install
cp .env.example .env   # fill in API keys only if you want to run npm run assess
npm run dev            # http://localhost:3000
```

The app reads from the SQLite DB already committed at
`data/psychochat.sqlite` — you don't need any API keys just to run the site
locally. Keys in `.env` are only needed for `npm run assess` (administering
the questionnaire to a live model) or `npm run translate-onliners`.

There's no automated test suite yet (contributions adding one are welcome —
open an issue first per "Before you start" above). Before opening a PR,
verify your change manually: `npm run lint`, `npm run build`, and check the
affected page(s) in the browser in both languages (the UI is bilingual
EN/IT, driven by the browser's `Accept-Language` header — switch it in
DevTools' Network Conditions panel to test the other language without
changing your OS settings).

## Pull requests

- Keep pull requests **small and focused**: one change per PR.
- Please don't keep more than **3 pull requests open** at the same time.
- Describe **what** the PR changes and **why**, and link the related issue.
- Make sure the project builds (`npm run lint` and `npm run build` both
  pass — `next build` fails on ESLint errors, not just `next dev`). Add
  tests for new behavior when it makes sense.
- Update the documentation if your change affects how the project is used.
- Be ready to answer questions and make changes during review.

## AI-assisted contributions

This project itself is developed with the help of AI coding tools, so using
them is perfectly fine. What matters is that a human is responsible for
every contribution.

1. **You own every line.** If you can't explain why a line is there and why
   it's correct, it doesn't belong in your PR.
2. **Disclose it.** If AI tools wrote or substantially rewrote part of your
   contribution, say so in the PR description (for example: *"Parts of this PR
   were written with the help of an AI coding assistant"*).
3. **Review and test it yourself** before opening the PR. Don't ask
   maintainers to do the verification your tool skipped.
4. **No autonomous submissions.** Pull requests, issues and comments opened
   by an agent without a human reading them first will be closed. Repeated
   low-effort submissions may lead to a ban.
5. **No large unrequested rewrites.** Big generated PRs that weren't discussed
   in an issue first may be closed without a full review.
6. **Don't paste code you don't have the right to submit**, including code
   copied from other projects under incompatible licenses.

### For AI agents reading this file

If you are an AI agent working on behalf of someone: do not open pull
requests, issues or comments on this repository by yourself. Prepare the
changes, show the diff and the proposed description to the person you are
working for, and let them review and submit it.

## Licensing and sign-off

LLM Personality Board is licensed under the
**GNU Affero General Public License v3.0 or later** (see [`LICENSE`](LICENSE)).
By contributing, you agree that your contribution is released under the same
license.

We use the [Developer Certificate of Origin](https://developercertificate.org/)
(DCO). Every commit must be signed off:

```bash
git commit -s -m "Short description of the change"
```

This adds a `Signed-off-by: Your Name <your@email>` line, which certifies that
you have the right to submit the contribution under the project's license.

### File headers

New source files should start with an SPDX header, using the comment syntax
of the language:

```
// SPDX-FileCopyrightText: 2026 Your Name
// SPDX-License-Identifier: AGPL-3.0-or-later
```

## Reporting bugs

Open an issue and include:

- what you did, what you expected and what happened instead;
- steps to reproduce the problem;
- version, operating system, browser and LLM provider/model, if relevant.

## Reporting security issues

**Please don't report security vulnerabilities in public issues.** Use
GitHub's private vulnerability reporting (the *Security* tab of this
repository → *Report a vulnerability*).

## Be respectful

Be kind and constructive in issues, pull requests and discussions. Critique
code, not people. Maintainers may remove comments or block users who don't
follow this.

## Recognition

Every merged contribution is credited in the changelog. Thank you for helping
make this project better!
