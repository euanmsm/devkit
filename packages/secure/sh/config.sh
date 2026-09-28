#!/usr/bin/env bash
# =============================================================================
# Config Integrity Check
# =============================================================================
#
# Scans config files and .gitignore for supply chain attack indicators.
# Reusable by both the pre-commit hook and CI workflows.
#
# Config comes from the wrapper in bin/config-integrity.mjs, which reads
# .devkit/secure.json and passes it in as DEVKIT_* variables.
#
# Checks
# ------
# A. Malicious patterns in *.config.{js,mjs,ts} files
# B. Required .gitignore patterns still present
# C. Obfuscation in staged files (pre-commit only)
#
# Usage
# -----
#   bash scripts/security/check-config.sh           # CI mode
#   PRE_COMMIT=1 bash scripts/security/check-config.sh  # pre-commit mode

set -euo pipefail

FAILED=0
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
NC='\033[0m'

# -------------------------------------------------------------------------
# Check A — Malicious patterns in config files
# -------------------------------------------------------------------------

echo "--- Check A: Scanning config files for malicious patterns ---"

# Prints the files among "$@" whose content matches the pattern, batched so a
# long list cannot overflow the argument limit. Returns 2 when grep could not
# read a file, so an unreadable file fails the check instead of passing it.
grep_files() {
	local pattern=$1 status=0 rc n
	shift
	while [ $# -gt 0 ]; do
		n=$(( $# < 500 ? $# : 500 ))
		rc=0
		grep -lE -- "$pattern" "${@:1:n}" || rc=$?
		[ "$rc" -gt 1 ] && status=2
		shift "$n"
	done
	return "$status"
}

# Prints the staged files among "$@" whose staged content matches the pattern.
# Reads the index, not the working tree, so it checks what is being committed.
grep_staged() {
	local pattern=$1 status=0 rc n i
	local batch
	shift
	while [ $# -gt 0 ]; do
		n=$(( $# < 500 ? $# : 500 ))
		batch=()
		for (( i = 1; i <= n; i++ )); do batch+=(":(literal)${!i}"); done
		rc=0
		git grep --cached -lE -e "$pattern" -- "${batch[@]}" || rc=$?
		[ "$rc" -gt 1 ] && status=2
		shift "$n"
	done
	return "$status"
}

CONFIG_FILES=()
while IFS= read -r -d '' file; do
	CONFIG_FILES+=("$file")
done < <(find . \
	-not -path '*/node_modules/*' \
	-not -path '*/.next/*' \
	-not -path '*/dist/*' \
	-not -path '*/build/*' \
	-type f \( -name '*.config.js' -o -name '*.config.mjs' -o -name '*.config.ts' \) \
	-print0 2>/dev/null || true)

if [ ${#CONFIG_FILES[@]} -gt 0 ]; then
	# Pattern: description
	PATTERNS=(
		'eval\('                    # Direct code execution
		'Function\('                # Indirect eval via Function constructor
		'new Function'              # Indirect eval via new Function
		'global\['                  # Global namespace manipulation
		'globalThis\['              # Global namespace manipulation
		'\\x[0-9a-fA-F]{2}'        # Hex escape obfuscation
		'String\.fromCharCode'      # Character code obfuscation
		'atob\('                    # Base64 decode in config
		'btoa\('                    # Base64 encode in config
	)

	PATTERN_NAMES=(
		"eval()"
		"Function()"
		"new Function"
		"global["
		"globalThis["
		"hex escapes (\\x)"
		"String.fromCharCode"
		"atob()"
		"btoa()"
	)

	UNREADABLE=0
	for i in "${!PATTERNS[@]}"; do
		MATCHES=$(grep_files "${PATTERNS[$i]}" "${CONFIG_FILES[@]}" 2>/dev/null) || UNREADABLE=1
		if [ -n "$MATCHES" ]; then
			echo -e "${RED}FAIL: ${PATTERN_NAMES[$i]} found in config files:${NC}"
			echo "$MATCHES" | sed 's/^/  /'
			FAILED=1
		fi
	done

	if [ "$UNREADABLE" -ne 0 ]; then
		echo -e "${RED}FAIL: some config files could not be read, so they were not scanned:${NC}"
		grep_files 'x' "${CONFIG_FILES[@]}" 2>&1 >/dev/null | sed 's/^/  /' || true
		FAILED=1
	fi

	# Check for suspiciously long lines (code hidden beyond viewport)
	for file in "${CONFIG_FILES[@]}"; do
		LONG_LINES=$(awk -v max="${DEVKIT_MAX_CONFIG_LINE:-200}" 'length > max { print NR": "length" chars" }' "$file" 2>/dev/null || true)
		if [ -n "$LONG_LINES" ]; then
			echo -e "${RED}FAIL: Lines exceeding ${DEVKIT_MAX_CONFIG_LINE:-200} chars in $file:${NC}"
			echo "$LONG_LINES" | sed 's/^/  /'
			FAILED=1
		fi
	done
fi

if [ "$FAILED" -eq 0 ]; then
	echo -e "${GREEN}PASS: No malicious patterns found in config files${NC}"
fi

# -------------------------------------------------------------------------
# Check B — .gitignore required patterns
# -------------------------------------------------------------------------

echo ""
echo "--- Check B: Verifying .gitignore integrity ---"

GITIGNORE_CHECK_FAILED=0

REQUIRED_PATTERNS=()
while IFS= read -r line; do
	[ -n "$line" ] && REQUIRED_PATTERNS+=("$line")
done <<< "${DEVKIT_GITIGNORE_REQUIRED:-}"

if [ ${#REQUIRED_PATTERNS[@]} -eq 0 ]; then
	echo -e "${YELLOW}SKIP: no gitignoreRequired patterns configured${NC}"
fi

for pattern in ${REQUIRED_PATTERNS[@]+"${REQUIRED_PATTERNS[@]}"}; do
	if ! grep -qxF "$pattern" .gitignore 2>/dev/null; then
		echo -e "${RED}FAIL: Missing required .gitignore pattern: $pattern${NC}"
		GITIGNORE_CHECK_FAILED=1
		FAILED=1
	fi
done

if [ "$GITIGNORE_CHECK_FAILED" -eq 0 ]; then
	echo -e "${GREEN}PASS: All required .gitignore patterns present${NC}"
fi

# -------------------------------------------------------------------------
# Check C — Obfuscation in staged files (pre-commit only)
# -------------------------------------------------------------------------

if [ "${PRE_COMMIT:-0}" = "1" ]; then
	echo ""
	echo "--- Check C: Scanning staged files for obfuscation ---"

	STAGED_CHECK_FAILED=0
	STAGED_FILES=()
	while IFS= read -r -d '' file; do
		case "$file" in
			*.js | *.mjs | *.ts | *.tsx) STAGED_FILES+=("$file") ;;
		esac
	done < <(git diff --cached --name-only -z --diff-filter=ACMR 2>/dev/null || true)

	if [ ${#STAGED_FILES[@]} -gt 0 ]; then
		STAGED_PATTERNS=("global\\['" '(\\x[0-9a-fA-F]{2}){3,}')
		STAGED_NAMES=("Suspicious global['...'] pattern" "Consecutive hex escapes")

		UNREADABLE=0
		for i in "${!STAGED_PATTERNS[@]}"; do
			MATCHES=$(grep_staged "${STAGED_PATTERNS[$i]}" "${STAGED_FILES[@]}" 2>/dev/null) || UNREADABLE=1
			if [ -n "$MATCHES" ]; then
				echo -e "${RED}FAIL: ${STAGED_NAMES[$i]} in staged files:${NC}"
				echo "$MATCHES" | sed 's/^/  /'
				STAGED_CHECK_FAILED=1
				FAILED=1
			fi
		done

		if [ "$UNREADABLE" -ne 0 ]; then
			echo -e "${RED}FAIL: git could not search the staged files:${NC}"
			grep_staged 'x' "${STAGED_FILES[@]}" 2>&1 >/dev/null | sed 's/^/  /' || true
			STAGED_CHECK_FAILED=1
			FAILED=1
		fi
	fi

	if [ "$STAGED_CHECK_FAILED" -eq 0 ]; then
		echo -e "${GREEN}PASS: No obfuscation detected in staged files${NC}"
	fi
fi

# -------------------------------------------------------------------------
# Summary
# -------------------------------------------------------------------------

echo ""
if [ "$FAILED" -ne 0 ]; then
	echo -e "${RED}Config integrity check FAILED${NC}"
	if [ -n "${DEVKIT_DOCS_URL:-}" ]; then echo "See ${DEVKIT_DOCS_URL}"; fi
	exit 1
else
	echo -e "${GREEN}Config integrity check passed${NC}"
	exit 0
fi
