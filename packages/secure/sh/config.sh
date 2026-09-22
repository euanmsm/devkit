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

CONFIG_FILES=$(find . \
	-not -path '*/node_modules/*' \
	-not -path '*/.next/*' \
	-not -path '*/dist/*' \
	-not -path '*/build/*' \
	-type f \( -name '*.config.js' -o -name '*.config.mjs' -o -name '*.config.ts' \) \
	2>/dev/null || true)

if [ -n "$CONFIG_FILES" ]; then
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

	for i in "${!PATTERNS[@]}"; do
		MATCHES=$(echo "$CONFIG_FILES" | xargs grep -lE "${PATTERNS[$i]}" 2>/dev/null || true)
		if [ -n "$MATCHES" ]; then
			echo -e "${RED}FAIL: ${PATTERN_NAMES[$i]} found in config files:${NC}"
			echo "$MATCHES" | sed 's/^/  /'
			FAILED=1
		fi
	done

	# Check for suspiciously long lines (code hidden beyond viewport)
	while IFS= read -r file; do
		LONG_LINES=$(awk -v max="${DEVKIT_MAX_CONFIG_LINE:-200}" 'length > max { print NR": "length" chars" }' "$file" 2>/dev/null || true)
		if [ -n "$LONG_LINES" ]; then
			echo -e "${RED}FAIL: Lines exceeding ${DEVKIT_MAX_CONFIG_LINE:-200} chars in $file:${NC}"
			echo "$LONG_LINES" | sed 's/^/  /'
			FAILED=1
		fi
	done <<< "$CONFIG_FILES"
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
	STAGED_FILES=$(git diff --cached --name-only --diff-filter=ACM 2>/dev/null | grep -E '\.(js|mjs|ts|tsx)$' || true)

	if [ -n "$STAGED_FILES" ]; then
		# C2 identifier pattern: global['...']
		MATCHES=$(echo "$STAGED_FILES" | xargs grep -lE "global\['" 2>/dev/null || true)
		if [ -n "$MATCHES" ]; then
			echo -e "${RED}FAIL: Suspicious global['...'] pattern in staged files:${NC}"
			echo "$MATCHES" | sed 's/^/  /'
			STAGED_CHECK_FAILED=1
			FAILED=1
		fi

		# Consecutive hex escapes (3+ on one line)
		MATCHES=$(echo "$STAGED_FILES" | xargs grep -lE '(\\x[0-9a-fA-F]{2}){3,}' 2>/dev/null || true)
		if [ -n "$MATCHES" ]; then
			echo -e "${RED}FAIL: Consecutive hex escapes in staged files:${NC}"
			echo "$MATCHES" | sed 's/^/  /'
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
