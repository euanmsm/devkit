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

# lockfile-lint takes each allowed host as its own argument
LOCKFILE_HOST_ARGS=()
while IFS= read -r h; do
	[ -n "$h" ] && LOCKFILE_HOST_ARGS+=("$h")
done <<< "$(printf '%s\n' "${DEVKIT_LOCKFILE_HOSTS:-npm}" | tr ',' '\n' | tr -d '[:blank:]')"
[ ${#LOCKFILE_HOST_ARGS[@]} -eq 0 ] && LOCKFILE_HOST_ARGS=(npm)

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
NC='\033[0m'

# Pre-commit checks read staged content from a copy of the index, so they scan
# what is being committed rather than the working tree.
STAGED_DIR=""
cleanup_staged() {
	if [ -n "$STAGED_DIR" ]; then rm -rf "$STAGED_DIR"; fi
}
trap cleanup_staged EXIT

# Copies the staged content of "$@" into STAGED_DIR, keeping each path.
copy_staged() {
	if [ -z "$STAGED_DIR" ]; then
		local tmp_root=${TMPDIR:-/tmp}
		STAGED_DIR=$(mktemp -d "${tmp_root%/}/secure-staged.XXXXXX") || return 1
	fi
	printf '%s\0' "$@" | git checkout-index --prefix="$STAGED_DIR/" -z --stdin
}

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
		# Staged JS/TS files, renames included. -z keeps unusual names unquoted.
		SCAN_ARGS=()
		while IFS= read -r -d '' file; do
			case "$file" in
				*.js | *.mjs | *.cjs | *.ts | *.tsx | *.jsx) SCAN_ARGS+=("$file") ;;
			esac
		done < <(git diff --cached --name-only -z --diff-filter=ACMR 2>/dev/null || true)

		if [ ${#SCAN_ARGS[@]} -gt 0 ]; then
			# semgrep runs inside the staged copy, so a config given as a local
			# path is made absolute and the repo's .semgrepignore comes along
			STAGED_CONFIG_ARGS=()
			for arg in "${SEMGREP_CONFIG_ARGS[@]}"; do
				case "$arg" in
					--config | /*) ;;
					*) if [ -e "$arg" ]; then arg="$PWD/$arg"; fi ;;
				esac
				STAGED_CONFIG_ARGS+=("$arg")
			done

			if ! copy_staged "${SCAN_ARGS[@]}"; then
				echo -e "${RED}FAIL: could not read the staged JS/TS files${NC}"
				FAILED=1
			elif ! (
				if [ -f .semgrepignore ]; then
					cp .semgrepignore "$STAGED_DIR/"
					while read -r directive included || [ -n "$directive" ]; do
						case "$included" in /* | *..*) continue ;; esac
						if [ "$directive" = ":include" ] && [ -f "$included" ]; then
							mkdir -p "$STAGED_DIR/$(dirname "$included")"
							cp "$included" "$STAGED_DIR/$included"
						fi
					done < .semgrepignore
				fi
				cd "$STAGED_DIR" && semgrep scan \
					"${STAGED_CONFIG_ARGS[@]}" \
					--no-git-ignore \
					--metrics off \
					--error \
					"${SCAN_ARGS[@]}"
			); then
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

LOCKFILES=()
if [ "${PRE_COMMIT:-0}" = "1" ]; then
	# Only the staged lockfiles, renames included
	while IFS= read -r -d '' file; do
		case "$file" in
			package-lock.json | */package-lock.json) LOCKFILES+=("$file") ;;
		esac
	done < <(git diff --cached --name-only -z --diff-filter=ACMR 2>/dev/null || true)
else
	# CI mode — every lockfile in the tree
	while IFS= read -r -d '' file; do
		LOCKFILES+=("$file")
	done < <(find . -name 'package-lock.json' -not -path '*/node_modules/*' -print0 2>/dev/null || true)
fi

if [ ${#LOCKFILES[@]} -eq 0 ]; then
	echo -e "${GREEN}PASS: No lockfiles to check — skipping${NC}"
elif ! npx --no-install lockfile-lint --help &>/dev/null; then
	echo -e "${YELLOW}SKIP: lockfile-lint not installed (npm i -D lockfile-lint)${NC}"
elif [ "${PRE_COMMIT:-0}" = "1" ] && ! copy_staged "${LOCKFILES[@]}"; then
	echo -e "${RED}FAIL: could not read the staged lockfiles${NC}"
	FAILED=1
else
	for lockfile in "${LOCKFILES[@]}"; do
		# Before a commit lockfile-lint reads the staged copy
		lockfile_path=$lockfile
		if [ "${PRE_COMMIT:-0}" = "1" ]; then lockfile_path="$STAGED_DIR/$lockfile"; fi
		if npx --no-install lockfile-lint \
			--path "$lockfile_path" \
			--type npm \
			--allowed-hosts "${LOCKFILE_HOST_ARGS[@]}" \
			--validate-https; then
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
