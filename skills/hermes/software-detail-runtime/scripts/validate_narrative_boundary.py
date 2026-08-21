#!/usr/bin/env python3
"""Validate document-unit headings and prevent internal model identifiers in prose."""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path


MARKDOWN_HEADING = re.compile(r"^#{2,6}\s+(?:\d+(?:\.\d+)*\s+)?(.+?)\s*$")
TEXT_HEADING = re.compile(r"^\d+(?:\.\d+)+\s+(.+?)\s*$")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Check that final prose uses only document-unit boundary identifiers."
    )
    parser.add_argument("--manifest", required=True, type=Path)
    parser.add_argument("--text", required=True, type=Path)
    parser.add_argument(
        "--format",
        choices=("auto", "markdown", "text"),
        default="auto",
        help="Use text for DOCX-extracted text; auto detects Markdown headings.",
    )
    return parser.parse_args()


def load_manifest(path: Path) -> dict:
    data = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(data.get("documentUnits"), list) or not data["documentUnits"]:
        raise ValueError("manifest.documentUnits must be a non-empty list")
    if not isinstance(data.get("allModelIdentifiers"), list):
        raise ValueError("manifest.allModelIdentifiers must be a list")
    return data


def heading_name(line: str, format_name: str) -> str | None:
    match = MARKDOWN_HEADING.match(line) if format_name == "markdown" else TEXT_HEADING.match(line)
    return match.group(1).strip() if match else None


def detect_format(text: str, requested: str) -> str:
    if requested != "auto":
        return requested
    return "markdown" if any(MARKDOWN_HEADING.match(line) for line in text.splitlines()) else "text"


def find_identifier_occurrences(text: str, identifiers: set[str]) -> set[str]:
    found: set[str] = set()
    for identifier in identifiers:
        if not identifier:
            continue
        pattern = rf"(?<![A-Za-z0-9_]){re.escape(identifier)}(?![A-Za-z0-9_])"
        if re.search(pattern, text):
            found.add(identifier)
    return found


def split_document_sections(
    text: str, format_name: str, document_names: set[str]
) -> tuple[dict[str, str], list[str]]:
    sections: dict[str, list[str]] = {}
    headings: list[str] = []
    current: str | None = None
    for line in text.splitlines():
        name = heading_name(line, format_name)
        if name is not None:
            headings.append(name)
            matched = next(
                (unit for unit in document_names if name == unit or name.startswith(unit + " ")),
                None,
            )
            current = matched
            if current is not None:
                sections.setdefault(current, []).append(line)
            continue
        if current is not None:
            sections[current].append(line)
    return {name: "\n".join(lines) for name, lines in sections.items()}, headings


def main() -> int:
    args = parse_args()
    try:
        manifest = load_manifest(args.manifest)
        text = args.text.read_text(encoding="utf-8")
    except (OSError, ValueError, json.JSONDecodeError) as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 2

    format_name = detect_format(text, args.format)
    units = {unit["name"]: unit for unit in manifest["documentUnits"]}
    document_names = set(units)
    analysis_names = {
        Path(unit.get("path", "")).name
        for unit in manifest.get("analysisUnits", [])
        if unit.get("path")
    }
    all_identifiers = {str(value) for value in manifest["allModelIdentifiers"]}
    sections, headings = split_document_sections(text, format_name, document_names)
    errors: list[str] = []

    for name in sorted(document_names - set(sections)):
        errors.append(f"missing document-unit heading: {name}")

    for heading in headings:
        if heading in analysis_names or any(heading.startswith(name + " ") for name in analysis_names):
            errors.append(f"analysis unit used as document heading: {heading}")

    for name, unit in units.items():
        section = sections.get(name)
        if section is None:
            continue
        allowed = {
            name,
            *map(str, unit.get("allowedInputs", [])),
            *map(str, unit.get("allowedOutputs", [])),
            *map(str, unit.get("approvedPublicIdentifiers", [])),
        }
        leaked = find_identifier_occurrences(section, all_identifiers) - allowed
        for identifier in sorted(leaked):
            errors.append(f"{name}: internal or foreign identifier leaked: {identifier}")

        excluded_outputs = set(map(str, unit.get("excludedOutputs", [])))
        required_outputs = set(map(str, unit.get("allowedOutputs", []))) - excluded_outputs
        missing_outputs = required_outputs - find_identifier_occurrences(section, required_outputs)
        for identifier in sorted(missing_outputs):
            errors.append(f"{name}: boundary output not mentioned: {identifier}")

    if errors:
        for error in errors:
            print(f"ERROR: {error}", file=sys.stderr)
        return 1

    print(
        f"PASS: {len(units)} document unit(s); headings and narrative identifiers stay within boundary."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
