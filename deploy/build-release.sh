#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUT_DIR="${ROOT_DIR}/releases"
OUT_FILE="${OUT_DIR}/cowayangai-${STAMP}.tar.gz"
LIST_FILE="${OUT_DIR}/.${STAMP}.files"
mkdir -p "${OUT_DIR}"
trap 'rm -f "${LIST_FILE}"' EXIT

# Build from source/test/config paths only. Never archive tracked vendor,
# generated, ignored, credential, or unrelated project content.
{
  (cd "${ROOT_DIR}" && git ls-files --cached --others --exclude-standard backend frontend deploy) \
    | while IFS= read -r file; do [[ -e "${ROOT_DIR}/${file}" ]] && printf '%s\n' "${file}"; done \
    | grep -vE '(^|/)(node_modules|dist|\.git|\.venv|venv|__pycache__|releases)(/|$)' \
    | grep -vE '(^|/)\.env($|\.)' \
    | grep -vE '^backend-ai(/|$)|^ai(/|$)|^runs(/|$)|^logs(/|$)|^ecosystem\.foh\.cjs$'
} | sort -u > "${LIST_FILE}"

if [[ ! -s "${LIST_FILE}" ]]; then echo 'No source files selected for release.' >&2; exit 1; fi

tar -czf "${OUT_FILE}" -C "${ROOT_DIR}" -T "${LIST_FILE}"
if tar -tzf "${OUT_FILE}" | grep -Eq '(^|/)(node_modules|dist|\.env($|/)|\.env\.[^/]+$)|firebase-admin\.json|(^|/)backend-ai(/|$)|(^|/)ai(/|$)|\.(pt|onnx|engine)$'; then
  rm -f "${OUT_FILE}"
  echo 'Release archive contains a forbidden generated/secret path.' >&2
  exit 1
fi

printf 'Release archive: %s\n' "${OUT_FILE}"
sha256sum "${OUT_FILE}"
printf 'Files: '
wc -l < "${LIST_FILE}"
printf 'Upload: scp %q user@cowayangai.site:/tmp/\n' "${OUT_FILE}"
