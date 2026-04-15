# Encoding Workflow

## Purpose

This file defines the required workflow for editing Chinese or other non-ASCII text files in this repository.

Default rule:

- When a task touches Chinese or other non-ASCII text, follow `windows-utf8-guard` by default.
- Treat encoding safety as part of correctness.

## Required Steps

1. Inspect before editing.
2. Prefer the smallest possible change.
3. Prefer patch-based edits over full rewrites.
4. If a script must write text, use explicit UTF-8.
5. Verify that nearby non-ASCII text was preserved after editing.

## Red Flags

- Rewriting a whole file just to change a few lines.
- Using PowerShell text output commands without explicit UTF-8.
- Assuming terminal mojibake means the file bytes are already broken.

## Project Shortcut

When the user says "follow the project encoding convention", it means this workflow plus `windows-utf8-guard`.
