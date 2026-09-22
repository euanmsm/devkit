#!/usr/bin/env bash
# =============================================================================
# Security Scan
# =============================================================================
#
# Runs security scanning tools against staged files and dependencies.
# Called from the pre-commit hook alongside config.sh.
#
# Config comes from the wrapper in bin/security-scan.mjs, which reads
# .devkit/secure.json and passes it in as DEVKIT_* variables.
#
# Tools
# -----
# A. Gitleaks — scans staged diffs for leaked secrets (API keys, tokens, etc.)
# B. Semgrep — scans staged files for malicious code patterns (backdoors,
#    obfuscation, dynamic code execution) using the Apiiro ruleset
# C. lockfile-lint — verifies package-lock.json integrity (registry URLs)
#
# Usage
# -----
#   secure               # CI mode (scans the whole tree)
#   PRE_COMMIT=1 secure   # pre-commit mode (staged files only)

set -euo pipefail

FAILED=0

SEMGREP_CONFIG_ARGS=()
while IFS= read -r c; do
	[ -n "$c" ] && SEMGREP_CONFIG_ARGS+=(--config "$c")
done <<< "${DEVKIT_SEMGREP_CONFIGS:-p/supply-chain
p/javascript}"

LOCKFILE_HOSTS="${DEVKIT_LOCKFILE_HOSTS:-npm}"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
NC='\033[0m'

# -------------------------------------------------------------------------
# Check A — Gitleaks (secret detection)
# -------------------------------------------------------------------------

echo "--- Check A: Gitleaks — scanning for leaked secrets ---"

if command -v gitleaks &>/dev/null; then
	if [ "${PRE_COMMIT:-0}" = "1" ]; then
		# Scan only staged changes
		if ! gitleaks git --pre-commit --staged --no-banner -v; then
			echo -e "${RED}FAIL: Gitleaks detected leaked secrets in staged files${NC}"
			FAILED=1
		else
			echo -e "${GREEN}PASS: No secrets detected in staged files${NC}"
		fi
	else
		# CI mode — scan the working directory (not git history).
		# Use verbose flag so findings are printed to stdout for debugging.
		if ! gitleaks dir . --no-banner -v; then
			echo -e "${RED}FAIL: Gitleaks detected leaked secrets in codebase${NC}"
			echo -e "${RED}      Review the findings above and either:${NC}"
			echo -e "${RED}        1. Remove the secret from the file${NC}"
			echo -e "${RED}        2. Add a path allowlist entry in .gitleaks.toml${NC}"
			FAILED=1
		else
			echo -e "${GREEN}PASS: No secrets detected in codebase${NC}"
		fi
	fi
else
	echo -e "${YELLOW}SKIP: gitleaks not installed (brew install gitleaks)${NC}"
fi

# -------------------------------------------------------------------------
# Check B — Semgrep + Apiiro malicious code ruleset
# -------------------------------------------------------------------------

echo ""
echo "--- Check B: Semgrep — scanning for malicious code patterns ---"

if command -v semgrep &>/dev/null; then
	if [ "${PRE_COMMIT:-0}" = "1" ]; then
		# Get staged JS/TS files
		STAGED_FILES=$(git diff --cached --name-only --diff-filter=ACM 2>/dev/null \
			| grep -E '\.(js|mjs|cjs|ts|tsx|jsx)$' || true)

		if [ -n "$STAGED_FILES" ]; then
			# Build a properly-quoted array of file paths (handles brackets in paths)
			SCAN_ARGS=()
			while IFS= read -r file; do
				SCAN_ARGS+=("$file")
			done <<< "$STAGED_FILES"

			if ! semgrep scan \
				"${SEMGREP_CONFIG_ARGS[@]}" \
				--no-git-ignore \
				--metrics off \
				--error \
				"${SCAN_ARGS[@]}"; then
				echo -e "${RED}FAIL: Semgrep detected suspicious patterns in staged files${NC}"
				FAILED=1
			else
				echo -e "${GREEN}PASS: No malicious patterns detected in staged files${NC}"
			fi
		else
			echo -e "${GREEN}PASS: No JS/TS files staged — skipping${NC}"
		fi
	else
		# CI mode — scan the project. On PRs we scan diff-aware: only files
		# changed since the base commit (SEMGREP_BASELINE_COMMIT). Falls back to
		# a full scan when the var is unset (scheduled/dispatch runs) or the
		# baseline commit isn't present locally (shallow checkout missed it).
		SEMGREP_ARGS=(
			"${SEMGREP_CONFIG_ARGS[@]}"
			--metrics off
			--error
		)

		if [ -n "${SEMGREP_BASELINE_COMMIT:-}" ] \
			&& git cat-file -e "${SEMGREP_BASELINE_COMMIT}^{commit}" 2>/dev/null; then
			echo "Diff-aware scan against baseline ${SEMGREP_BASELINE_COMMIT}"
			SEMGREP_ARGS+=(--baseline-commit "${SEMGREP_BASELINE_COMMIT}")
		else
			echo "Full-tree scan"
		fi

		if ! semgrep scan "${SEMGREP_ARGS[@]}"; then
			echo -e "${RED}FAIL: Semgrep detected suspicious patterns (see findings above)${NC}"
			FAILED=1
		else
			echo -e "${GREEN}PASS: No malicious patterns detected${NC}"
		fi
	fi
else
	echo -e "${YELLOW}SKIP: semgrep not installed (brew install semgrep)${NC}"
fi

# -------------------------------------------------------------------------
# Check C — lockfile-lint (lockfile integrity)
# -------------------------------------------------------------------------

echo ""
echo "--- Check C: lockfile-lint — verifying package-lock.json integrity ---"

if [ "${PRE_COMMIT:-0}" = "1" ]; then
	# Only run if package-lock.json is staged
	LOCKFILE_STAGED=$(git diff --cached --name-only --diff-filter=ACM 2>/dev/null \
		| grep -E 'package-lock\.json$' || true)

	if [ -z "$LOCKFILE_STAGED" ]; then
		echo -e "${GREEN}PASS: No lockfile changes staged — skipping${NC}"
	else
		HAS_LOCKFILE_LINT=0
		if npx --no-install lockfile-lint --help &>/dev/null 2>&1; then
			HAS_LOCKFILE_LINT=1
		fi

		if [ "$HAS_LOCKFILE_LINT" -eq 1 ]; then
			for lockfile in $LOCKFILE_STAGED; do
				if ! npx --no-install lockfile-lint \
					--path "$lockfile" \
					--type npm \
					--allowed-hosts "$LOCKFILE_HOSTS" \
					--validate-https 2>/dev/null; then
					echo -e "${RED}FAIL: lockfile-lint detected issues in $lockfile${NC}"
					FAILED=1
				else
					echo -e "${GREEN}PASS: $lockfile integrity verified${NC}"
				fi
			done
		else
			echo -e "${YELLOW}SKIP: lockfile-lint not installed${NC}"
		fi
	fi
else
	# CI mode — check all lockfiles
	for lockfile in $(find . -name 'package-lock.json' -not -path '*/node_modules/*' 2>/dev/null); do
		if npx --no-install lockfile-lint \
			--path "$lockfile" \
			--type npm \
			--allowed-hosts "$LOCKFILE_HOSTS" \
			--validate-https 2>/dev/null; then
			echo -e "${GREEN}PASS: $lockfile integrity verified${NC}"
		else
			echo -e "${RED}FAIL: lockfile-lint detected issues in $lockfile${NC}"
			FAILED=1
		fi
	done
fi

# -------------------------------------------------------------------------
# Summary
# -------------------------------------------------------------------------

echo ""
if [ "$FAILED" -ne 0 ]; then
	echo -e "${RED}Security scan FAILED — commit blocked${NC}"
	echo "Fix the issues above or use --no-verify to bypass (not recommended)."
	exit 1
else
	echo -e "${GREEN}Security scan passed${NC}"
	exit 0
fi
