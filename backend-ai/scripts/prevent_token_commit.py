#!/usr/bin/env python
"""
Prevent committing common secrets (HuggingFace tokens and similar) by scanning staged files.
This script should be invoked by pre-commit to block commits containing accidental tokens.

Usage (pre-commit):
  python backend-ai/scripts/prevent_token_commit.py

The script checks staged files via `git diff --cached --name-only` and reads the staged content
with `git show :<path>` to avoid reading the working copy. It searches for patterns such as:
 - HF tokens that start with 'hf_'
 - explicit `HF_TOKEN=` environment assignment
 - potential generic secrets (api keys) tuned for minimal false positives

If secrets are found, the script prints details and exits with code 1 to block commit.
"""
import re
import subprocess
import sys
from pathlib import Path

SECRETS_PATTERNS = [
    # HuggingFace token (hf_ prefix + at least 8 chars; tokens are longer, but keep it permissive)
    re.compile(r"hf_[A-Za-z0-9_-]{8,}", re.IGNORECASE),
    # Explicit HF_TOKEN assignment in code or .env (common mistake)
    re.compile(r"HF_TOKEN\s*=\s*['\"]?hf_[A-Za-z0-9_-]{8,}['\"]?", re.IGNORECASE),
    # Common API key patterns (limited length to reduce false positives)
    re.compile(r"AIza[0-9A-Za-z\-_]{10,}"),  # Google API keys
    re.compile(r"AKIA[0-9A-Z]{16}"),  # AWS Access Key ID style (still permissive)
    # Gemini API key assignment (generic detect of GEMINI_API_KEY=..., avoids committing secrets)
    re.compile(r"GEMINI_API_KEY\s*=\s*['\"]?[A-Za-z0-9_\-\.]{8,}['\"]?", re.IGNORECASE),
]


def get_staged_files():
    try:
        out = subprocess.check_output(["git", "diff", "--cached", "--name-only"])  # stdout as bytes
        files = out.decode("utf-8").strip().splitlines()
        return [f for f in files if f.strip()]
    except subprocess.CalledProcessError:
        return []


def get_staged_file_content(path: str):
    # Use git show to read the staged version (index): git show :<path>
    try:
        out = subprocess.check_output(["git", "show", f":{path}"], stderr=subprocess.DEVNULL)
        return out.decode("utf-8", errors="ignore")
    except subprocess.CalledProcessError:
        return None


def main():
    staged_files = get_staged_files()
    if not staged_files:
        return 0

    problems = []
    for f in staged_files:
        # Only check certain text file types to reduce noise
        path = Path(f)
        if path.suffix.lower() in [
            ".py",
            ".env",
            ".txt",
            ".md",
            ".json",
            ".yaml",
            ".yml",
            ".cfg",
            ".ini",
        ]:
            content = get_staged_file_content(f)
            if not content:
                continue
            for patt in SECRETS_PATTERNS:
                for match in patt.finditer(content):
                    snippet = match.group(0)
                    # Keep token snippet short for privacy in logs
                    display = snippet[:8] + "..." if len(snippet) > 8 else snippet
                    problems.append((f, patt.pattern, display))

    if problems:
        print("\n🚨 Commit blocked: potential secrets found in staged files:\n")
        for fname, pattern, display in problems:
            print(f" - {fname}: {display} (pattern: {pattern})")
        print("\nPlease remove secrets from the staged files, move them into a .env or secrets manager, and try again.")
        print("Tip: to unstage a file: git reset -- <file>")
        return 1

    return 0


if __name__ == "__main__":
    sys.exit(main())
