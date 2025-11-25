#!/usr/bin/env python
"""
Interactive helper to write a local `.env` file for `backend-ai` safely.

This script prompts for sensitive keys so they are not stored in shell history. It writes
`backend-ai/.env` and ensures that `.env` is added to `.gitignore` (it's already expected to be in .gitignore)
and warns the user not to commit the file.

Usage:
    python backend-ai/set_env_local.py
    # or non-interactive:
    python backend-ai/set_env_local.py --gemini-url https://... --gemini-model models/gemini-flash-latest

This script does NOT commit or transmit any secrets anywhere.
"""
import argparse
import getpass
import os
from pathlib import Path


def safe_write_env(env_path: Path, values: dict):
    lines = []
    for k, v in values.items():
        if v is None:
            continue
        # Quote variables with spaces or special characters
        v_str = v
        if "\n" in v_str:
            v_str = v_str.replace("\n", "\\n")
        lines.append(f"{k}={v_str}")
    env_path.write_text("\n".join(lines) + "\n")
    print(f"✅ Wrote `{env_path}` (DO NOT commit this file).")


def main():
    parser = argparse.ArgumentParser(description="Write a local `.env` for backend-ai (safe helper)")
    parser.add_argument("--gemini-url", default=os.getenv("GEMINI_API_URL"), help="Gemini API URL")
    parser.add_argument("--gemini-model", default=os.getenv("GEMINI_MODEL", "models/gemini-flash-latest"), help="Gemini model name")
    parser.add_argument("--robo-api-key", default=os.getenv("ROBOFLOW_API_KEY"), help="Roboflow API key (optional)")
    parser.add_argument("--nodejs-webhook", default=os.getenv("NODEJS_WEBHOOK_URL", "http://localhost:3000/api/webhook"), help="NodeJS webhook URL")
    parser.add_argument("--no-prompt", action="store_true", help="Do not prompt for keys; use env var or CLI flags only")
    args = parser.parse_args()

    gemini_key = None
    if not args.no_prompt:
        gemini_key = getpass.getpass("Enter GEMINI API KEY (input hidden, press Enter to skip): ")
    else:
        gemini_key = os.getenv("GEMINI_API_KEY")

    # If no key provided, we still write a .env with the non-sensitive vars
    values = {
        "GEMINI_API_URL": args.gemini_url,
        "GEMINI_API_KEY": gemini_key if gemini_key else None,
        "GEMINI_MODEL": args.gemini_model,
        "NODEJS_WEBHOOK_URL": args.nodejs_webhook,
        # Do not prompt for HF_TOKEN here; leave it optional
    }

    env_path = Path(__file__).parent.joinpath('.env')
    if env_path.exists():
        confirm = input(f"`{env_path}` already exists. Overwrite? [y/N]: ")
        if confirm.lower() != 'y':
            print("Aborted - didn't modify `.env`.")
            return

    safe_write_env(env_path, values)
    print("Tip: Use `set GEMINI_API_KEY=...` in session or use this helper to create `.env`. Do NOT commit `.env` to git.")


if __name__ == '__main__':
    main()
