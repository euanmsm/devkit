# Deep code review — 28 September 2026

A swarm review of every package that ships to other repos. `crib` was left out.
Each package was read by three reviewers with different roles (logic,
environment, robustness). Their findings were merged, and each one was then
checked by two independent skeptics who tried to disprove it, usually by
reproducing it in a scratch folder. A finding is listed here only if both
skeptics upheld it, or one of them reproduced it.

Severity is the lower of the two skeptics' ratings, so it is sometimes lower
than what the original reviewer said.

**119 confirmed bugs**: 6 high, 49 medium, 64 low. 8 other claims were rejected;
they are listed at the end.

## core+vouch (8)

### [high] The documented setup never runs vouch: ignore-scripts=true also blocks the root project's own postinstall

`packages/vouch/README.md:33` Reproduced.

The README says to set `ignore-scripts=true` in .npmrc and add
`"postinstall": "vouch"` to the root package.json (line 30). Line 33 then claims
'A root postinstall in your own package.json still runs — ignore-scripts governs
your dependencies, not you.' That claim is false. When ignore-scripts is set,
npm install also skips the root project's own preinstall, install, postinstall
and prepare scripts. So vouch never runs and none of the allowlisted scripts
run. Install still exits 0 and prints nothing about it. Two reviewers reproduced
this with npm 11.16.0: a root postinstall that touches a marker file did not run
under ignore-scripts=true, and it did run with --ignore-scripts=false.

**When it happens:** A user follows the README: .npmrc with
`ignore-scripts=true`, `"postinstall": "vouch"`, and .devkit/vouch.json
allowlisting sharp. They run `npm install`. It succeeds, but vouch never runs
and sharp never downloads libvips. The app later crashes at runtime with a
missing native binding.

**Suggested fix:** Remove the false claim. Document an explicit step that
actually runs, such as `"setup": "npm install && vouch"` or running `npx vouch`
after install in CI and Docker. Do not rely on the root postinstall hook.

### [medium] vouch throws an uncaught error wherever there is no .git (Docker builds, tarballs, before git init)

`packages/vouch/src/allowlist.mjs:48` Reproduced.

main() calls repoRoot() without catching its error. repoRoot() in
packages/core/src/index.mjs (line 26) throws 'No git repository above …' when no
ancestor holds `.git`. vouch then dies with a stack trace and exits 1. This
happens even with no vouch.json, because the loadConfig fallback is never
reached. That contradicts the README's 'With no config file it runs nothing and
says so.' Installs often happen without .git: Docker builds that exclude .git
through .dockerignore, source tarballs, and fresh projects before `git init`.
Reproduced by running bin/vouch.mjs in a directory with no .git above it.

**When it happens:** A Dockerfile runs `COPY package*.json .npmrc .devkit ./`
and then `RUN npm ci && npx vouch`. The build context has no .git. vouch throws
'No git repository above /app', the image build fails, and the allowlisted
binaries are never installed.

**Suggested fix:** Resolve the project root from the npm context
(process.env.INIT_CWD / npm_config_local_prefix, or the nearest package.json
from cwd). Treat repoRoot as best effort only: catch the throw and fall back, so
a missing .git means 'no config' rather than a crash.

### [medium] Allowlisted packages are skipped silently when the npm project is not at the git root

`packages/vouch/src/allowlist.mjs:28` Reproduced.

run() checks `existsSync(join(root, 'node_modules', pkg))` and runs
`npm explore` with cwd set to root, where root is the git root. npm installs
node_modules next to the project's package.json, which is often not the git
root. Examples: an app in a subdirectory, a home directory that is itself a
dotfiles repo, or an unhoisted dependency in a workspace package's own
node_modules. In those cases every entry misses the check and is skipped with no
output, and vouch exits 0. The gate fails open with no signal. Reproduced: with
.git and .devkit/vouch.json at the repo root and app/node_modules/sharp present,
running vouch from app/ printed nothing and exited 0.

**When it happens:** The repo has /repo/.git, /repo/.devkit/vouch.json
allowlisting sharp, and /repo/web/package.json with /repo/web/node_modules/sharp
installed. Running vouch from /repo/web checks /repo/node_modules/sharp, which
does not exist. It skips sharp silently and exits 0, so sharp's install script
never runs.

**Suggested fix:** Use INIT_CWD or process.cwd() (or the nearest package.json)
as the node_modules root and as the cwd for npm explore. Keep repoRoot only for
finding .devkit/vouch.json. Print a line for each allowlisted package that is
not found, so a wrong root is visible.

### [medium] On Windows every entry fails because execFileSync cannot launch npm

`packages/vouch/src/allowlist.mjs:33`

`execFileSync('npm', ...)` runs without `shell: true`. On Windows npm is
`npm.cmd`, so a bare `npm` fails with ENOENT. On Node >= 18.20.2 and 20.12.2, a
.cmd file cannot be spawned without a shell at all (EINVAL). Every installed,
allowlisted package is reported as failed and vouch exits 1.

**When it happens:** A Windows developer with sharp allowlisted runs vouch. It
prints 'install for sharp failed: spawnSync npm ENOENT' and exits 1, and sharp's
install script never runs.

**Suggested fix:** When process.env.npm_execpath is set, run it with
process.execPath. Otherwise use `shell: true` on win32 and quote the arguments
safely.

### [low] A malformed vouch.json crashes with a raw TypeError instead of a clear config error

`packages/vouch/src/allowlist.mjs:50` Reproduced.

`config.allowed ?? []` only guards against a missing key; nothing checks the
config's shape. A vouch.json containing `null` throws when reading `.allowed`.
If `allowed` is an object, `entries.length` is undefined, so the empty check
passes and `for…of` throws 'entries is not iterable'. An entry without `pkg`
makes `join()` throw ERR_INVALID_ARG_TYPE outside the try block, which aborts
the run so valid entries never run either. An entry without `script` runs
`npm run undefined`.

**When it happens:** .devkit/vouch.json is
`{"allowed": {"pkg": "sharp", "script": "install"}}` (missing array brackets) or
`{"allowed": [{"package": "sharp", "script": "install"}]}` (wrong key name).
vouch crashes with a TypeError stack trace, runs nothing, and never says what is
wrong with the config.

**Suggested fix:** Check that config is an object, that `allowed` is an array,
and that each entry has string `pkg` and `script` fields. Report problems with a
clear message naming .devkit/vouch.json.

### [low] Native addons with an implicit node-gyp install fail with 'Missing script: install'

`packages/vouch/src/allowlist.mjs:33` Reproduced.

vouch runs `npm explore <pkg> -- npm run <script>`. A package that ships
binding.gyp without declaring an install or preinstall script gets an implicit
`node-gyp rebuild` from npm's lifecycle install. `npm run install` does not add
that implicit step. Verified with npm 11.16: the command fails with
`Missing script: "install"`, so vouch reports a failure and exits 1.

**When it happens:** The allowlist has { pkg: 'some-native-addon', script:
'install' }, and that package has binding.gyp but no scripts in its
package.json. vouch runs `npm run install` inside it, npm prints 'Missing
script: "install"', and vouch exits 1.

**Suggested fix:** Run the lifecycle through npm, for example
`npm rebuild <pkg> --ignore-scripts=false` from the install root, which applies
the gyp default. Or run `node-gyp rebuild` when the script is install, none is
declared, and binding.gyp exists.

### [low] core compile() splits a string pattern into single-character regexes and crashes on null

`packages/core/src/index.mjs:61` Reproduced.

compile() iterates `patterns` with for…of and never checks that it is an array.
Callers pass raw config values straight in, such as `compile(config.exclude)`. A
string is iterated character by character, so each character becomes its own
regex, and a '^' or '.' matches every path. The default parameter only covers
undefined, so `null` throws 'patterns is not iterable'.

**When it happens:** A user writes `"exclude": "^dist/"` in .devkit/terse.json
(a string, not an array). compile returns [/^/, /d/, /i/, /s/, /t/, /\//]. /^/
matches every file, so terse silently excludes the whole repo and reports clean.
`"exclude": null` crashes the tool instead.

**Suggested fix:** Return [] for null, wrap a string in an array, and warn or
throw for any other non-array value.

### [low] loadConfig rejects valid JSON that starts with a UTF-8 BOM

`packages/core/src/index.mjs:45` Reproduced.

`readFileSync(path, 'utf8')` keeps a leading U+FEFF byte order mark, and
JSON.parse rejects it. A config saved by an editor or shell that writes a BOM is
reported as 'not valid JSON', and every devkit tool that loads that config
fails.

**When it happens:** A Windows user creates .devkit/vouch.json with Windows
PowerShell 5 `Set-Content -Encoding utf8`, which writes a BOM. vouch throws
'.devkit/vouch.json is not valid JSON — Unexpected token' even though the
contents are valid JSON.

**Suggested fix:** Strip a leading ﻿ before parsing:
`JSON.parse(text.replace(/^﻿/, ''))`.

## preflight (5)

### [medium] Repo root comes from the hook's cwd, not the edited file, so nested repos and worktrees escape the gate

`packages/preflight/src/gate.mjs:199` Reproduced.

main() calls repoRoot() from process.cwd() and never uses the file's own
location. There are two ways this goes wrong. (a) If the session cwd is inside a
nested repo (a submodule or vendored clone with its own .git), that inner repo
becomes the root. It usually has no .devkit/preflight.json, so every edit is
allowed, including edits to superproject files. After `cd /tmp`, repoRoot()
throws and every call is allowed. (b) If the session cwd is the main checkout
and the file is in a checkout nested under it, such as a Claude Code worktree at
.claude/worktrees/<name>/, line 174 treats the file as in-repo. Its rel then
carries the nested prefix, so every ^-anchored primary and exclude rule misses.
This contradicts the comment 'A file in another checkout is not this repo's to
govern'.

**When it happens:** With the map's primary rule '^src/' -> ['x'] and cwd at the
repo root, writing <root>/.claude/worktrees/w/src/a.ts gives rel
'.claude/worktrees/w/src/a.ts'. No rule matches and the hook exits 0, while
<root>/src/a.ts is denied. Also, after `cd vendor/lib` (a nested .git), editing
<root>/src/a.ts is allowed because vendor/lib has no config. Both were
reproduced.

**Suggested fix:** For path rules, find the root with
repoRoot(dirname(filePath)), load that checkout's config, and compute rel
against it. For tool rules, or calls with no file_path, use input.cwd and fall
back to process.cwd().

### [low] Symlinked repo path is treated as outside the repo, so edits skip the gate

`packages/preflight/src/gate.mjs:171` Reproduced.

repoRoot() starts from process.cwd(), which Node returns with symlinks resolved.
The payload's file_path is used as given. relative(root, filePath) compares the
two as plain strings, with no realpath. When the spellings differ, rel starts
with '..', gateFor returns null, and the edit is allowed with no message. On
macOS the /tmp -> /private/tmp and /var -> /private/var links cause this, as
does any project folder reached through a symlink (for example ~/Coding linked
to another volume). Tests do not catch it because makeRepo() calls realpathSync
on the temp dir.

**When it happens:** The repo is at .../real/repo with a primary rule '^src/' ->
['x'], and .../link is a symlink to .../real. The hook runs with cwd
.../link/repo, so process.cwd() reports .../real/repo. Writing
.../link/repo/src/a.ts gives rel '../../link/repo/src/a.ts', and the hook exits
0 with no output. The same file through the real path is denied. Reproduced by
several reviewers.

**Suggested fix:** Before calling relative(), canonicalise both sides with
realpathSync: the root, and the file's nearest existing ancestor directory,
since a Write can target a file that does not exist yet.

### [low] Skills loaded with a /skill-name slash command are not counted, so edits stay blocked

`packages/preflight/src/gate.mjs:110` Reproduced.

loadedSkills only matches Skill tool_use records. A skill the user runs as a
slash command is written to the transcript as a user message with
<\command-name>/x<\/command-name>, and no Skill tool_use is recorded. The
skill's content is in context, but the gate still reports it missing. Claude
Code's Skill tool guidance also tells the model not to call a skill again when
its command block is already present, so the model gets two opposite
instructions and can stall on the deny.

**When it happens:** preflight.json maps README.md to the 'readmes' skill. The
user types /readmes and asks for a README edit. The Write is denied with
Skill(skill: "readmes"), even though the skill is loaded. A reviewer checked
real transcripts: in 40 of 40 sessions where /pull-requests was typed, there was
no matching Skill tool_use.

**Suggested fix:** Also count <\command-name>/?NAME<\/command-name> markers in
loadedSkills, including the plugin-qualified form.

### [low] In-repo paths whose first segment starts with '..' are treated as outside the repo

`packages/preflight/src/gate.mjs:174` Reproduced.

The outside-the-repo check is rel.startsWith('..'). That also matches in-repo
names whose first segment starts with two dots, such as '..prettierrc.js',
'..cfg/a.ts' or '...config.ts'. gateFor returns null for these, so exclude,
primary and universal rules are never checked.

**When it happens:** The map's universal rule is '\.(tsx?|mjs)$'. Writing
<root>/..src/a.ts gives rel '..src/a.ts', and the edit is allowed with no
output. Reproduced by three reviewers.

**Suggested fix:** Treat rel as outside only when rel === '..', rel starts with
'..' + path.sep, or path.isAbsolute(rel) is true.

### [low] Path rules never match on Windows because rel uses backslashes

`packages/preflight/src/gate.mjs:171` Reproduced.

On Windows, path.relative returns paths separated by backslashes. All documented
and example patterns ('^src/api/', 'node_modules/', '(^|/)README\.md$') use
forward slashes, so any primary, universal or exclude rule with a directory
separator never matches, and the gate lets those edits through. A file on
another drive also gives an absolute rel that does not start with '..'.

**When it happens:** On Windows, editing C:\repo\src\api\x.ts gives rel
'src\api\x.ts'. /^src\/api\// does not match, so the edit is allowed with no
skill loaded.

**Suggested fix:** Normalise rel with rel.split(path.sep).join('/') before
matching, and treat path.isAbsolute(rel) as outside the repo.

## shellgate (20)

### [medium] A '<<WORD' that isn't a real heredoc makes the gate skip every later line

`packages/shellgate/src/gate.mjs:90` Reproduced.

stripHeredocs applies HEREDOC (line 72) to the raw line before any quote or
arithmetic handling. So '<<' inside a quoted string, inside $((1<<4)), or in a
comment is read as a heredoc opener. Every later line is then dropped until one
equals that 'delimiter', and usually no such line exists. None of the checks see
the dropped lines.

**When it happens:** All of these return null (allowed):
`echo "use <<EOF"\necho x > src/a.ts`,
`git commit -m "docs: explain <<EOF usage"\necho x > src/a.ts` and
`echo $((1<<4))\nsed -i "s/a/b/" src/a.ts`. In the last one, '4' is taken as the
delimiter and never closes. Each command writes a repo file.

**Suggested fix:** Look for heredoc openers only on quote-blanked text, with
$((...)) also removed. Start skipping only when the opener is a real redirect
token. If the closing delimiter never appears, keep the lines rather than
dropping them.

### [medium] A quoted or escaped path with a space is cut short, so redirects and cd into a repo whose path has a space get through

`packages/shellgate/src/gate.mjs:127` Reproduced.

REDIRECT, TEE and CD (line 168) capture targets with `[^\s...]+`, and they run
on `unquoted`, where quotes and spaces are kept. If the repo root's absolute
path has a space (common on macOS: 'My Projects', iCloud 'Mobile Documents',
'Google Drive'), a quoted or backslash-escaped absolute path stops at the first
space. toAbsolutePath then resolves that shorter path to somewhere outside the
repo. A truncated cd target moves the tracked directory out of the repo too, so
every later relative redirect in the command also counts as outside.

**When it happens:** Repo at `/Users/x/My Projects/repo`. All return null:
`echo x > "/Users/x/My Projects/repo/a.txt"`,
`echo x > /Users/x/My\ Projects/repo/a.txt` and
`cd "/Users/x/My Projects/repo" && echo x > a.txt`.

**Suggested fix:** Read redirect, tee and cd targets using shell quoting: take a
whole quoted string, or join backslash-escaped spaces, e.g.
`"(?:[^"\\]|\\.)*"|'[^']*'|(?:\\.|[^\s<>|;&()])+`. Remove the quotes and escapes
before resolving.

### [medium] The inline-script check is skipped when the repo path has a space or a non-ASCII character

`packages/shellgate/src/gate.mjs:227` Reproduced.

ABSOLUTE_PATH is `/[\w.-]+/[\w./-]*` with no `u` flag, so `\w` is ASCII only.
Spaces, non-ASCII letters, `~`, `@` and `+` end the match. When a script names a
repo file by its absolute path, the match stops partway through the root. That
shorter prefix counts as outside the repo, so mentionsPathOutside returns true
and findWritingScript allows the write.

**When it happens:** With root `/Users/josé/repo`,
`python3 -c "open('/Users/josé/repo/a.txt','w').write('x')"` returns null. With
root `/Users/x/My Projects/repo`, the equivalent command also returns null. With
root `/Users/x/repo` the same command is correctly blocked.

**Suggested fix:** Ignore any match that is a prefix of the root, or test
command.includes(root) first and treat that as in-repo. Or pull paths out with a
Unicode-aware pattern that stops only at quotes or unquoted whitespace.

### [medium] A cd inside a subshell or $(...) is treated as changing the directory for the rest of the command

`packages/shellgate/src/gate.mjs:180` Reproduced.

resolveCwdAt applies every earlier cd match in order, including ones inside (
... ) or $( ... ). Those run in a subshell and don't change the outer directory.
A later relative redirect or tee is then resolved against the wrong directory,
lands outside the repo, and is allowed.

**When it happens:** Both return null: `(cd /tmp && ls) && echo x > src/a.ts`
and `d=$(cd /tmp && pwd); echo x > src/a.ts`. Each writes <root>/src/a.ts.

**Suggested fix:** Track ( and $( nesting, and ignore a cd whose subshell has
closed before the redirect's position.

### [medium] Bun and Deno file-write APIs are missing from WRITE_CALL, although the README says they are blocked

`packages/shellgate/src/gate.mjs:224` Reproduced.

The README says the gate blocks an inline Bun or Deno script that calls a
file-writing API. WRITE_CALL has no Bun.write and no Deno.writeTextFile /
writeTextFileSync. So bun and deno are recognised as interpreters, but their
main write calls pass.

**When it happens:** Both return null:
`bun -e "await Bun.write('src/a.ts','x')"` and
`deno eval "await Deno.writeTextFile('src/a.ts','x')"`.

**Suggested fix:** Add \bBun\.write\b and \bwriteTextFile(?:Sync)?\b to
WRITE_CALL, plus fs.writeSync and similar.

### [medium] The interpreter is only recognised as the first word of a command, so env prefixes, wrappers and path-qualified interpreters get through

`packages/shellgate/src/gate.mjs:220` Reproduced.

INTERPRETER requires python/node/ruby/bun/deno right after the start of the
command, a separator, or xargs. A variable assignment, a launcher (env, time, uv
run, npx tsx) or a path-qualified binary (.venv/bin/python, /usr/bin/python3)
stops the match, so WRITE_CALL is never checked.

**When it happens:** Each returns null and writes src/a.ts:
`PYTHONPATH=. python3 -c "open('src/a.ts','w').write('x')"`,
`uv run python -c ...`, `.venv/bin/python -c ...`,
`time node -e "require('fs').writeFileSync('src/a.ts','x')"` and
`npx tsx -e ...`.

**Suggested fix:** Match the interpreter as any word, allowing a path prefix
(e.g. `(?:^|[\s|;&(/])(?:python[\d.]*|node|ruby|bun|deno|tsx)\b`), or strip
leading VAR=val, env, time, uv run, npx and similar before testing.

### [medium] Any absolute-looking token in a script turns off the inline-script check, including JS regex literals and URL paths

`packages/shellgate/src/gate.mjs:227` Reproduced.

mentionsPathOutside allows a writing script if any substring matches
ABSOLUTE_PATH and is outside the repo. ABSOLUTE_PATH also matches a JS regex
literal like /oldName/g (after '(') and strings like '/api/v1/users'. These are
typical in a find-and-replace rewrite script, the kind of script the gate exists
to stop.

**When it happens:** Both return null:
`node -e "const fs=require('fs');const p='src/a.ts';fs.writeFileSync(p, fs.readFileSync(p,'utf8').replace(/oldName/g,'newName'))"`,
and a python3 heredoc that does
`s=open(p).read().replace('/api/v1/users','/api/v2/users')` then
`open(p,'w').write(s)`.

**Suggested fix:** Count only tokens that look like real filesystem locations (a
known root such as /tmp, /private, /var or /Users, or a first segment that
exists on disk). Or require every write target, not just some mention, to be
outside the repo.

### [low] Shell-in-shell runs every edit unchecked (bash -c, sh -c, eval, bash <<EOF)

`packages/shellgate/src/gate.mjs:30` Reproduced.

Quoted text is emptied (`bare`) or has its operators blanked (`unquoted`), and
heredoc bodies are removed. That is right for data, but a string passed to
bash/sh/zsh -c or eval, or a heredoc fed to a shell, is code. Nothing detects
these wrappers, so any edit written that way goes through. The README's Known
gaps don't mention this route.

**When it happens:** All return null: `bash -c 'echo x > src/a.ts'`,
`sh -c "sed -i '' 's/a/b/' src/a.ts"` and
`bash <<'EOF'\nsed -i '' 's/a/b/' src/a.ts\nEOF`.

**Suggested fix:** Treat (ba|z|da)?sh -c, eval, and sh/bash reading a heredoc or
here-string as an interpreter. Unwrap the inner string or body and run
findShellEdit on it recursively, or deny when it can't be parsed.

### [low] A cd or target using $CLAUDE_PROJECT_DIR, $PWD or $(git rev-parse) turns off redirect and tee checks

`packages/shellgate/src/gate.mjs:198` Reproduced.

toAbsolutePath returns null for any path containing
'$', and isRepoPath(null) returns false. Once a cd target contains '$',
resolveCwdAt (line 182) makes the directory null for everything after it, so
every later relative redirect or tee target counts as outside the repo. Agents
often anchor to the repo root this way, so the gate goes quiet exactly when the
command is working in the repo. This contradicts the README's claim that
redirects are caught 'including after a cd earlier in the same command'.

**When it happens:** All return null:
`cd "$(git rev-parse --show-toplevel)" && echo x > src/a.ts`,
`cd "$CLAUDE_PROJECT_DIR" && echo x > src/a.ts`,
`echo x > "$CLAUDE_PROJECT_DIR/src/a.ts"` and `echo x > "$PWD/src/a.ts"`.

**Suggested fix:** Expand $CLAUDE_PROJECT_DIR, ${CLAUDE_PROJECT_DIR},
$PWD and $(git rev-parse --show-toplevel) to known values before resolving.
After a cd the gate can't resolve, treat later relative targets as possibly in
the repo (fail closed).

### [low] The '>& file' redirect form is treated as fd duplication and allowed

`packages/shellgate/src/gate.mjs:127` Reproduced.

REDIRECT uses (?![&(]) after '>' to skip fd duplication such as >&2. But in
bash, `>&word` where word is not a digit or '-' sends both stdout and stderr to
the file word, the same as &>.

**When it happens:** `echo x >& src/a.ts` and `echo x >&src/a.ts` both return
null and write src/a.ts.

**Suggested fix:** Skip >& only when it is followed by digits or '-'. Treat any
other word as a file target.

### [low] The Symlinked or differently-cased paths to the repo count as outside it

`packages/shellgate/src/gate.mjs:212` Reproduced.

isRepoPath calls path.relative on unresolved strings. Write targets are never
passed through realpath. On macOS, /tmp and /var are symlinks into /private,
people often reach code through a symlinked directory, and APFS ignores case by
default. A write through any such alias of the repo path counts as outside the
repo.

**When it happens:** With root `/private/tmp/repo`, `echo x > /tmp/repo/a.txt`
returns null. With root `/Users/x/code/repo` and a symlink `~/work -> ~/code`,
`echo x > ~/work/repo/a.txt` is allowed. On case-insensitive APFS,
`echo x > /users/x/code/repo/a.txt` is allowed.

**Suggested fix:** realpath both the root and the target before calling
relative(). For a file that doesn't exist yet, realpath its nearest existing
parent. On darwin, also compare case-insensitively.

### [low] In-place editor detection misses BSD sed -I, ruby -i, some perl flag combinations and gawk --include

`packages/shellgate/src/gate.mjs:99` Reproduced.

The sed pattern only accepts a lowercase i flag, but macOS/BSD sed also edits in
place with -I. There is no ruby -i entry. The perl pattern only allows [0lnpw]
before i and a .word backup suffix, so -0777pi, -i~ and -lapi are missed. gawk's
--include=inplace is also missed.

**When it happens:** All return null and rewrite the file in place:
`sed -I '' 's/a/b/' src/a.ts`, `ruby -pi -e 'gsub(/a/,"b")' src/a.ts`,
`perl -0777pi -e 's/a/b/' src/a.ts`, `perl -i~ -pe 's/a/b/' src/a.ts` and
`gawk --include=inplace '{print}' src/a.ts`.

**Suggested fix:** Use -[EInrsuz]*[iI] for sed. Add a ruby -i entry. Widen
perl's flag class to digits and a/F/s, and allow any non-space backup suffix
after -i. Match --include[= ]inplace for gawk.

### [low] git apply is missed when git options come before the subcommand, or when --stat is combined with --apply

`packages/shellgate/src/gate.mjs:107` Reproduced.

The pattern requires git followed directly by apply, so global options such as
-C <dir> or -c k=v in between skip the check. The --stat exemption also applies
when --apply is added, even though --apply makes it write the files.

**When it happens:** All return null: `git -C . apply fix.patch`,
`git -C packages/foo apply ../fix.patch` and
`git apply --stat --apply fix.patch`.

**Suggested fix:** Allow `(?:\s+-[Cc]\s+\S+|\s+--?\S+)*` between git and apply.
Don't exempt --stat or --check when --apply is also present.

### [low] The Python open() pattern misses r+ mode and paths built with a nested call

`packages/shellgate/src/gate.mjs:224` Reproduced.

The open( pattern only accepts modes starting with w, a or x, so 'r+'
(read-write) is missed. Its [^)]* also stops at the first ')', so when the path
is built with os.path.join(...) or Path(...), the check never reaches the mode
argument.

**When it happens:** Both return null:
`python3 -c "import os; open(os.path.join('src','a.ts'),'w').write('x')"` and
`python3 -c "f=open('src/a.ts','r+'); f.write('x')"`.

**Suggested fix:** Match a mode string anywhere later in the open( call, and
accept [rwax][bt]?\+ modes.

### [low] Heredocs with a '\EOF' or hyphenated delimiter are not stripped, so harmless body text gets blocked

`packages/shellgate/src/gate.mjs:72` Reproduced.

HEREDOC only accepts \w+ delimiters, optionally in matching quotes. The common
<<\EOF form and delimiters like 'END-DOC' are not recognised, so the body is
kept and scanned as shell. Any '>' in prose or code inside the body is then read
as a redirect into the repo.

**When it happens:** Both are denied with 'redirect into b', although only
/tmp/x is written: `cat > /tmp/x <<'END-DOC'\na > b\nEND-DOC` and
`cat > /tmp/x <<\\EOF\na > b\nEOF`.

**Suggested fix:** Widen the opener to `<<-?\s*\\?(['"]?)([^\s'"<>|;&()]+)\1`.

### [low] False positive: the word 'tee' anywhere in a command, even inside quotes, is read as a tee write

`packages/shellgate/src/gate.mjs:130` Reproduced.

TEE runs on `unquoted`, which keeps quoted words and blanks only <>|;&. It also
doesn't require tee to be the command word. So any 'tee' followed by a word, in
a grep pattern, commit message or PR body, is taken as a tee into a repo file,
and a harmless command is blocked.

**When it happens:** `grep -rn tee src/` is denied as 'tee into src/'.
`git commit -m "pipe through tee instead"` is denied as 'tee into instead"'.

**Suggested fix:** Anchor tee to command position (`(?:^|[|;&\n(])\s*tee\b`) and
match on text where quoted strings are fully emptied.

### [low] In-place editors are blocked even when the target is outside the repo, and read-only git apply flags are blocked

`packages/shellgate/src/gate.mjs:118` Reproduced.

findInPlaceEditor matches sed -i, perl -i, patch and git apply anywhere in the
command, and never checks the target path or the directory. The README says
writes outside the repository (/tmp, a scratch directory) are let through, but
that only holds for redirects and tee. Separately, the git apply exemption only
covers --check, --stat and --cached, so the read-only --numstat and --summary
are blocked.

**When it happens:** All denied, though none touches the repo:
`sed -i '' 's/a/b/' /tmp/scratch/x.txt`, `cd /tmp/x && patch -p1 < fix.patch`
and `git apply --numstat fix.patch`.

**Suggested fix:** Read the file operands of in-place editors, plus the cwd from
resolveCwdAt, and block only when one resolves inside the repo. Add --numstat
and --summary to the git apply exemption.

### [low] False positives: '>' in arithmetic, and inline-script writes after cd out of the repo

`packages/shellgate/src/gate.mjs:237` Reproduced.

REDIRECT (line 127) treats '>' inside (( )) or [[ ]] as a redirect to a repo file. findWritingScript ignores the working directory entirely, so a script that writes relative files after cd /tmp is blocked. The README says writes outside the repo, such as /tmp, are let through.

**When it happens:** `(( n > 5 )) && echo big` is denied as 'redirect into 5'.
`cd /tmp && python3 -c "open('x.txt','w').write('1')"` is denied as an inline
script that writes a file.

**Suggested fix:** Skip text inside (( )) and [[ ]] when matching redirects. In findWritingScript, allow the command when resolveCwdAt at the interpreter's position is outside the root.

### [low] The inline-script check can match an interpreter and a write API in two unrelated commands

`packages/shellgate/src/gate.mjs:238` Reproduced.

findWritingScript tests INTERPRETER anywhere in `bare` and WRITE_CALL anywhere
in the full command. It never checks that the write call belongs to the
interpreter's script. So searching code for a write API in the same compound
command as any node or python run is denied.

**When it happens:** `grep -rn "writeFileSync" src && node --version` is denied
as 'an inline script that writes a file'.

**Suggested fix:** Check WRITE_CALL only in the interpreter invocation's own
script (the quoted -c/-e argument or its attached heredoc body).

### [low] A repo path whose first segment starts with '..' is treated as outside the repo

`packages/shellgate/src/gate.mjs:213` Reproduced.

isRepoPath treats any relative path that starts with '..' as leaving the root.
That also catches ordinary names that begin with two dots, such as '..env' or
'..cache'.

**When it happens:** At the repo root, `echo x > ..env` returns null, and the
file is written inside the repo.

**Suggested fix:** Test `rel === '..' || rel.startsWith('..' + sep)` instead of
`rel.startsWith('..')`.

## secure (13)

### [high] A config or staged file path with a space or quote silently disables the grep checks

`packages/secure/sh/config.sh:72` Reproduced.

Check A (line 72) and Check C (lines 138 and 147) run
`echo "$LIST" | xargs grep ... 2>/dev/null || true`. xargs splits its input on
whitespace and treats quote characters specially. A path with a space is broken
into pieces that don't exist, so that file is never grepped. A single path with
an apostrophe makes xargs abort with 'unterminated quote', so no file at all is
scanned. The errors are hidden by 2>/dev/null and || true, so the check prints
PASS.

**When it happens:** Reviewers reproduced this. With a.config.js containing
eval("...") and a harmless file named it's.config.js anywhere in the tree,
config.sh prints 'PASS: No malicious patterns found' and exits 0. That turns off
all nine pattern checks. `my app/next.config.js` containing eval(...) also
passes, and a staged `my comp.js` containing global['x'] passes Check C. A
directory such as "Client's Site/" is enough to trigger it.

**Suggested fix:** Use NUL-delimited lists:
`find ... -print0 | xargs -0 grep -lE` and
`git diff --cached -z --name-only | xargs -0 grep`. Or build a bash array and
call grep "${FILES[@]}". Don't hide grep's exit status 2.

### [high] In CI, a missing lockfile-lint is reported as a lockfile integrity failure

`packages/secure/sh/scan.sh:177` Reproduced.

lockfile-lint is not a dependency of @euanmsm/secure, and the README only tells
users to install gitleaks and semgrep. Pre-commit mode checks that lockfile-lint
is available (line 153) and SKIPs when it isn't. CI mode has no such check. It
runs `npx --no-install lockfile-lint ... 2>/dev/null` directly, so on a clean
runner npx exits 1 ('npx canceled due to missing packages') and the script
prints 'FAIL: lockfile-lint detected issues in ./package-lock.json'. The real
error is hidden.

**When it happens:** A reviewer verified with an empty npm cache that
`npx --no-install lockfile-lint --help` exits 1. A consumer who follows the
README (npm i -D @euanmsm/secure, brew install gitleaks semgrep) and runs
`npx secure` in GitHub Actions gets a red build that blames every
package-lock.json. The same repo passes pre-commit locally.

**Suggested fix:** Add lockfile-lint as a dependency and call its bin directly,
or run the same availability check in CI mode and fail with a clear
'lockfile-lint not installed' message. Stop sending stderr to /dev/null.

### [medium] Multiple lockfileAllowedHosts are joined with commas and lockfile-lint reads the result as one host, so every lockfile fails

`packages/secure/bin/_run.mjs:33` Reproduced.

_run.mjs joins lockfileAllowedHosts with ',' and scan.sh passes the result as a
single argument, `--allowed-hosts "$LOCKFILE_HOSTS"` (scan.sh:162 and 180).
lockfile-lint's --allowed-hosts is an array option that expects separate words
and does not split on commas, so 'npm,yarn' becomes one literal host that no
package matches. Because lockfile-lint's stderr is sent to /dev/null, the reason
never shows.

**When it happens:** .devkit/secure.json sets "lockfileAllowedHosts": ["npm",
"yarn"] or adds a private registry. A reviewer reproduced this: lockfile-lint
prints 'invalid host, expected: npm,yarn, actual: registry.npmjs.org' and exits
1, while `--allowed-hosts npm yarn` passes. Every commit that stages
package-lock.json is blocked, and every CI run fails with 'lockfile-lint
detected issues'.

**Suggested fix:** Pass the hosts as separate words. Join them with '\n' in
_run.mjs, read them into a bash array in scan.sh (the same way the semgrep
configs are handled), and expand with --allowed-hosts "${HOSTS[@]}".

### [medium] Pre-commit checks scan the working tree instead of the staged content

`packages/secure/sh/scan.sh:93` Reproduced.

In PRE_COMMIT mode, the file names come from `git diff --cached`, but semgrep
(scan.sh:93-98), the config.sh Check C greps (config.sh:138 and 147) and
lockfile-lint (scan.sh:159) read those files from disk. When the index and the
working copy differ, the content that actually gets committed is never scanned.
Only gitleaks (--staged) reads the index.

**When it happens:** A reviewer verified this:
`echo "eval('1')" > evil.js; git add evil.js; echo 'const ok = 1' > evil.js; PRE_COMMIT=1 bash sh/scan.sh`
prints 'PASS: No malicious patterns detected in staged files', and
`git show :evil.js` still contains the eval. Check C behaves the same way with
hex escapes or global['x']. It also happens by accident with `git add -p` or any
edit made after staging, giving both false passes and false fails.

**Suggested fix:** Scan the index content. Copy the staged blobs into a temp
directory with `git checkout-index --prefix=$tmp/ -- <files>` and scan that,
cleaning it up afterwards. Or use `git show :path` for each file in the grep
checks.

### [medium] Renamed files skip pre-commit semgrep, the obfuscation check and the lockfile check

`packages/secure/sh/scan.sh:83` Reproduced.

scan.sh:83, scan.sh:146 and config.sh:134 all use
`git diff --cached --name-only --diff-filter=ACM`. Git detects renames by
default, so a staged file that was moved (and possibly edited) is listed as R,
and the filter drops it. A renamed package-lock.json is dropped the same way.

**When it happens:** A reviewer tested this: `git mv b.config.js c.config.js`,
append `eval(2)`, then `git add`. `--diff-filter=ACM` prints nothing, while
--name-status shows `R050 b.config.js c.config.js`. Malicious code added to a
renamed JS/TS file is never seen by pre-commit semgrep or by Check C.

**Suggested fix:** Use --diff-filter=ACMR, or pass --no-renames so a rename is
listed as an added file.

### [medium] Staged files with non-ASCII names are never scanned by semgrep or the obfuscation check

`packages/secure/sh/scan.sh:83` Reproduced.

Under git's default core.quotePath=true, `git diff --cached --name-only` prints
non-ASCII paths (and paths containing quotes, backslashes or tabs) as C-quoted
strings such as "caf\303\251.js", with the quotes included. The line then ends
in '"', so the `\.(js|...)$` extension filter drops it. config.sh:134 has the
same flaw.

**When it happens:** A reviewer verified this: stage src/café.js containing a
malicious payload and run PRE_COMMIT=1 scan.sh. It prints 'PASS: No JS/TS files
staged — skipping', and Check C also skips the file.

**Suggested fix:** Use
`git -c core.quotePath=false diff --cached --name-only -z ...` and read the
entries with `while IFS= read -r -d '' f`, passing them to grep and semgrep as
an array or through xargs -0.

### [medium] The .gitignore check passes when the required pattern is negated later in the file

`packages/secure/sh/config.sh:114` Reproduced.

Check B only confirms that a line exactly equal to the pattern exists
(`grep -qxF`). It never checks whether the path is still ignored, so a later
`!.env.local` line un-ignores it and the check still passes. This is exactly the
tampering the README says the check catches.

**When it happens:** A reviewer verified this: with a .gitignore of
'.env.local\n!.env.local' and gitignoreRequired ['.env.local'], config.sh prints
'PASS: All required .gitignore patterns present' and exits 0.
`git check-ignore .env.local` exits 1, so `git add .` would commit the secrets
file.

**Suggested fix:** Test the effect, not the text: run
`git check-ignore -q --no-index <name>` for literal names and a representative
filename for globs. At minimum, reject any `!` line that matches a required
pattern.

### [medium] The 'Function(' pattern flags any identifier that ends in Function

`packages/secure/sh/config.sh:49` Reproduced.

The ERE `Function\(` has no word boundary, so it matches isFunction(,
defineFunction(, createFunction( and so on, and Check A fails with 'Function()
found in config files'. `eval\(` also matches retrieval(, and atob(/btoa( match
any identifier that ends in those letters.

**When it happens:** A reviewer reproduced this: app.config.mjs containing
`isFunction(1)` gives 'FAIL: Function() found in config files' and exit 1. That
blocks every commit in pre-commit mode and fails CI.

**Suggested fix:** Anchor the patterns, e.g.
`(^|[^A-Za-z0-9_$.])Function[[:space:]]*\(`, and add the same boundary to eval,
global[, atob and btoa.

### [low] The .gitignore check fails on CRLF line endings or trailing whitespace

`packages/secure/sh/config.sh:114` Reproduced.

`grep -qxF` needs the whole line to match exactly, so '.env.local\r' (or a line
with trailing spaces) never equals '.env.local', even though git treats the
pattern as present.

**When it happens:** A reviewer verified this: a .gitignore saved as
'.env.local\r\n' (a Windows editor or core.autocrlf) gives 'FAIL: Missing
required .gitignore pattern: .env.local' and exit 1. Every commit is blocked
even though git ignores the file correctly.

**Suggested fix:** Strip CR and trailing whitespace before comparing, e.g.
`tr -d '\r' < .gitignore | sed 's/[[:space:]]*$//' | grep -qxF "$pattern"`, or
switch to the git check-ignore approach.

### [low] Lockfile loops split paths on whitespace

`packages/secure/sh/scan.sh:176` Reproduced.

`for lockfile in $LOCKFILE_STAGED` (line 158) and `for lockfile in $(find ...)`
(line 176) iterate over unquoted command output. A path containing whitespace is
split into pieces that don't exist, lockfile-lint fails on each piece with its
stderr hidden, and the real lockfile is never validated.

**When it happens:** A monorepo with apps/my app/package-lock.json: CI (or a
commit that stages the lockfile) reports 'FAIL: lockfile-lint detected issues in
./apps/my' and 'app/package-lock.json', blocking the run even though the
lockfile is fine.

**Suggested fix:** Iterate NUL-delimited:
`find ... -print0 | while IFS= read -r -d '' f`, and `git diff --cached -z` for
the staged files.

### [low] Config scan walks gitignored build output and blocks commits on generated files

`packages/secure/sh/config.sh:37` Reproduced.

Check A uses `find .` and excludes only node_modules, .next, dist and build, and
it runs in pre-commit mode too. Any other ignored or generated directory that
holds a *.config.{js,mjs,ts} is scanned. Minified output trips the long-line
rule and the pattern rules.

**When it happens:** A bundled *.config.mjs under .output/, .svelte-kit/,
.turbo/, coverage/ or out/ has a line over 200 chars or a \x escape, so every
`git commit` fails with 'Config integrity check FAILED' until the directory is
deleted.

**Suggested fix:** List candidates with
`git ls-files -z --cached --others --exclude-standard -- '*.config.*'` instead
of find.

### [low] The launcher exits silently when bash is missing and prints a raw stack trace when there is no repo root

`packages/secure/bin/_run.mjs:39` Reproduced.

When spawnSync cannot start 'bash' (ENOENT), result.status is null and
result.error is ignored, so the process exits 1 with no output. repoRoot() at
line 23 throws uncaught when there is no .git, which prints a stack trace.

**When it happens:** The hook runs where bash is not on PATH (Windows cmd, a
minimal container), and the commit is blocked with exit 1 and no message.
Running `npx secure` from a source tarball with no .git prints 'Error: No git
repository above ...' as a stack trace.

**Suggested fix:** Check result.error and print it, e.g. 'secure: could not run
bash: ENOENT'. Catch the repoRoot() error and print a one-line message.

### [low] A wrongly typed secure.json field crashes the launcher with a raw TypeError

`packages/secure/bin/_run.mjs:31` Reproduced.

runScript calls .join() on config fields without checking their type (lines
31-33), and dereferences config without checking that it is an object.

**When it happens:** {"gitignoreRequired": ".env.local"} in .devkit/secure.json
makes every commit fail with 'TypeError: config.gitignoreRequired.join is not a
function'. A file containing `null` fails with 'Cannot read properties of null'.
Neither message points at the config file.

**Suggested fix:** Normalise first: treat a non-object config as {}, wrap scalar
values in an array (or reject them), and print a clear error that names
.devkit/secure.json.

## terse (16)

### [high] CI check passes everything when run from a subdirectory

`packages/terse/src/check.mjs:22` Reproduced.

The git calls in check.mjs run without a cwd, so they use process.cwd().
`git diff --name-only` (line 60) returns paths relative to the repo root. Those
paths are then passed back as pathspecs to `git diff -U0 ... -- <paths>`, in the
batched addedRangesByFile (line 124) and in the per-file fallback (line 165).
Git resolves pathspecs against the cwd, so from any subdirectory nothing
matches. Every span comes back empty, checkFile returns [] and the check
exits 0. The CI gate fails open.

**When it happens:** Reproduced by two reviewers. A branch adds
`// we used to do this. Second one.` to pkg/src/a.mjs. Running `terse` from the
repo root gives 4 violations and exit 1. Running it from `pkg/` (for example
`npm run check:comments -w pkg`, turbo or `pnpm -r`) prints 'No new
comment-contract violations across 1 changed file(s).' and exits 0.

**Suggested fix:** Resolve repoRoot() once and pass `cwd: root` to every
execFileSync in check.mjs, as watch.mjs and scan.mjs already do. Alternatively,
prefix each pathspec with `:(top)`.

### [high] terse-watch reports nothing in a git worktree or submodule

`packages/terse/src/watch.mjs:137` Reproduced.

seenPath (line 97) and unreported (line 137) write to
`join(root, '.git', 'terse')`. In a linked worktree or a submodule, `.git` is a
file, not a directory. repoRoot still accepts it because it only calls
existsSync. mkdirSync then throws ENOTDIR, and it throws exactly when there are
fresh findings to report. The bin catches the error, prints 'nothing reported'
to stderr and exits 0, so no violation ever reaches the agent.

**When it happens:** Reproduced by three reviewers. Run
`git worktree add -b wtb ../wt2`, write `// you used to do this.` into a
governed file there, then pipe `{"cwd":"<wt2>","session_id":"s1"}` to
terse-watch. The output is
`terse-watch: nothing reported — ENOTDIR: not a directory, mkdir '<wt2>/.git/terse'`.
The same payload in the main checkout reports 3 violations. This affects every
Claude Code session running in a worktree.

**Suggested fix:** Find the state directory with `git rev-parse --git-dir` (or
`--git-common-dir`) run with cwd root, or fall back to os.tmpdir(). Also
consider returning the findings even when saving the seen state fails.

### [medium] terse-watch dedupe key drops later violations with the same message in a file

`packages/terse/src/watch.mjs:86` Reproduced.

The seen key is `file|rule|message` with digits replaced. It has no line number
and no comment text. Most messages are fixed strings, such as 'Declaration has
no JSDoc.'. After one such finding is reported for a file, every later violation
with the same rule and message in that file counts as seen for the rest of the
session, even after the first one is fixed. Within one run, the second of two
identical findings is skipped (line 129). A violation that is fixed and later
reintroduced is never reported again.

**When it happens:** Reproduced. x.js has an undocumented `function a() {}`, and
unreported() reports 'x.js:5 [exported-jsdoc] Declaration has no JSDoc.'. Append
`function b() {}` and call unreported() again: it returns []. In another case,
two new `// we ...` comments written in one Bash command produce '1 new comment
violation'.

**Suggested fix:** Include the finding's line text or a content hash in the key,
or count occurrences per file|rule|message and report only those beyond the
stored count. Prune keys for findings that no longer exist.

### [medium] Files with non-ASCII names are silently skipped by check and watch

`packages/terse/src/check.mjs:60` Reproduced.

changedFiles in check.mjs and changedSinceCommit in watch.mjs (lines 46 and 48,
`diff --name-only` and `ls-files --others`) parse newline-separated git output
without -z. core.quotePath is on by default, so git prints non-ASCII paths
quoted and escaped, for example `"pkg/src/caf\303\251.ts"`. The trailing quote
makes the governed regex `\.(tsx?|mjs|cjs|js)$` fail, and the file is dropped
without a message. The same happens to names containing quotes, backslashes or
tabs. The batched diff header parsing also fails on quoted headers. scan.mjs
already uses -z and is not affected.

**When it happens:** Reproduced. On a branch that adds café.js with an
undocumented function, `terse HEAD~1` prints 'No new comment-contract violations
across 0 changed file(s).' and exits 0. An untracked `naïve.mjs` with violations
is never reported by terse-watch.

**Suggested fix:** Use -z and split on NUL for --name-only, --name-status and
ls-files, or pass `-c core.quotePath=false` to every git call.

### [medium] Edit gate fails open on multi-line Edits to CRLF files

`packages/terse/src/gate.mjs:80` Reproduced.

applyEdit looks for old_string in the raw file text with includes and indexOf
(lines 80 and 84). Claude Code's Edit tool gives the model LF-normalised content
and normalises line endings when it matches. A multi-line old_string contains
`\n` while the file holds `\r\n`, so the lookup fails and applyEdit returns
null. main (line 141) then allows the edit, and Claude Code applies it
unchecked.

**When it happens:** src/a.ts has CRLF endings (Windows with core.autocrlf). The
agent edits it with a two-line old_string and a new_string that adds
`// we changed this as discussed`. The gate finds no match and exits 0 with no
output, so the violating comment is written.

**Suggested fix:** Normalise `\r\n` to `\n` in the source and in
old_string/new_string before matching and scanning. When there is still no
match, scan new_string on its own instead of allowing the edit.

### [medium] A line added below an existing logic comment is never caught

`packages/terse/src/scanner.mjs:1111` Reproduced.

logic-comment-length is anchored at runStart, the first line of the `//` run.
When a line is added under an existing one-line comment, the finding lands on
the old line, which is outside the added span. newFindings discards it, so the
gate and CI never enforce the rule when a comment is extended downward.

**When it happens:** Reproduced. The before-file has
`// The regex matches a slug.` above `const b = 2;`. The after-file inserts
`// The regex matches a code.` below it at line 9. scan(after) reports
logic-comment-length at line 8, but newFindings(before, after, [{from:9,to:9}])
returns [], so the gate allows the edit.

**Suggested fix:** Anchor the finding on the first line past the cap (runStart +
1), or report it whenever any line of the run is inside the span.

### [medium] Header or JSDoc cap is missed when a line is inserted above the cap point

`packages/terse/src/scanner.mjs:730` Reproduced.

header-cap is anchored at top+HEADER_MAX+1, and jsdoc-cap at the (max+1)th prose
line (line 846). Both assume the block grows at its end. When a line is inserted
earlier in the block, the anchor is an old, shifted line outside the edit span,
and newFindings discards the finding.

**When it happens:** Reproduced. Insert `// Inserted.` at line 5 of a header
that already has 8 lines. newFindings(before, after, [{from:5,to:5}]) returns []
although the header now has 9 lines. Inserting ' * Extra.' as the first prose
line of a 4-line JSDoc block (span line 6) also returns [].

**Suggested fix:** Keep the block's line range on the finding, and report it in
newFindings whenever the span overlaps the block.

### [medium] Single-line /** */ comments skip every content rule

`packages/terse/src/scanner.mjs:1088` Reproduced.

The main loop sends a doc block to checkJsdoc only when it spans more than one
line. checkProperty handles only interface and type properties and checks only
for a second sentence. A one-line `/** ... */` above a function or const
therefore escapes no-person, no-history, no-issue-id, no-justification,
todo-form, comment-length and jsdoc-tags.

**When it happens:** Reproduced.
`/** We previously used this, see ABC-123. It is fine. */` above
`export function f() {}` gives no findings. The same text as a multi-line block
gives no-history, no-issue-id and no-person.

**Suggested fix:** Run checkContent and the tag checks on single-line doc blocks
too, and leave only the one-sentence check to checkProperty.

### [medium] Lines inside multi-line template literals are scanned as comments

`packages/terse/src/scanner.mjs:1100` Reproduced.

The main loop classifies each line by its trimmed start and does not track open
template literals. A line inside a backtick string that starts with `//` or `/*`
is checked as a comment. This produces false no-person, no-history, todo-form,
logic-comment-length and no-commented-code findings, and the gate blocks
legitimate writes to code generators, fixtures and embedded snippets.

**When it happens:** Reproduced. `export const t = `\n// we used to do this\n//
TODO fix\n`;` reports no-history, no-person, logic-comment-length and todo-form
on the string's contents.

**Suggested fix:** Track whether a line ends inside an unterminated template
literal and skip comment classification until it closes.

### [medium] Decorated or directive-preceded declarations are flagged as missing JSDoc

`packages/terse/src/scanner.mjs:873` Reproduced.

docAbove checks only the first non-blank line above the declaration and requires
it to end with `*/`. A decorator, a multi-line decorator argument list, or a
`// eslint-disable-next-line` or `// @ts-expect-error` line between the JSDoc
and the declaration makes a documented declaration count as undocumented. The
gate then blocks new files that contain such declarations, and CI fails on the
added lines.

**When it happens:** Reproduced.
`/** A service. */\n@Injectable()\nexport class Foo {}` gives exported-jsdoc
'Declaration has no JSDoc.'. So does
`/** Parses. */\n// eslint-disable-next-line no-explicit-any\nexport function f(a) {...}`.
Every decorated NestJS or Angular class is affected.

**Suggested fix:** In docAbove, skip decorator lines (including multi-line
decorator arguments) and `//` directive lines before looking for the closing
`*/`.

### [low] TypeScript overloads after the first are flagged as undocumented

`packages/terse/src/scanner.mjs:876` Reproduced.

With the standard pattern of one JSDoc above the first overload, the later
overloads and the implementation have an overload signature directly above them,
not `*/`. docAbove returns null for each of them.

**When it happens:** Reproduced. A JSDoc followed by
`export function f(a: string): string;`, `export function f(a: number): number;`
and `export function f(a: any): any {` gives exported-jsdoc on the second and
third lines.

**Suggested fix:** When the line above is a `;`-terminated overload signature of
the same function, walk up past it to find the shared JSDoc.

### [low] In semicolon-free code, a parenthesised const is treated as a function

`packages/terse/src/scanner.mjs:547` Reproduced.

FN_ASSIGNED and FN_BINDS (lines 241 and 243) accept any `const x = (` as a
possible arrow function. readTail (line 530) then scans up to 8 lines for a `{`
at depth 0 and stops only at `;`. Without semicolons, the `{` of the next
statement is taken as a function body, so the const is required to have JSDoc.

**When it happens:** Reproduced. `const x = (a || b)\nif (x) {\n  run()\n}`
gives exported-jsdoc 'Declaration has no JSDoc.' on the const line in repos
written in standard (no-semicolon) style.

**Suggested fix:** For assigned forms, require `=>` (optionally after a return
type) right after the closing paren.

### [low] A return or throw on the body's opening line is ignored for tag coverage

`packages/terse/src/scanner.mjs:622` Reproduced.

bodyFacts checks for return and throw only when i > start.line, but the first
line is already sliced to the text after the opening `{`. In a one-line function
body, the return or throw is never registered, so jsdoc-tag-coverage misses a
missing @returns or @throws.

**When it happens:** Reproduced. A JSDoc with only @param above
`export function f(a) { return a + 1; }` gives no findings. The same function
split over three lines reports 'Function returns a value but has no @returns.'.

**Suggested fix:** Apply the return and throw checks to the sliced first line as
well, and keep `i > start.line` only for nested-function detection.

### [low] A logic comment run at the end of a file is never reported

`packages/terse/src/scanner.mjs:1111` Reproduced.

The length of a run of consecutive `//` lines is checked only when a non-comment
line follows it. When the file ends while a run is still open, the loop exits
(around line 1143) without emitting logic-comment-length.

**When it happens:** Reproduced. A file that ends with
`// One line.\n// Two line.` and no line after them gives no findings.

**Suggested fix:** After the loop, emit logic-comment-length when the open run
is longer than the cap.

### [low] User git color or external diff config makes check and watch find nothing

`packages/terse/src/check.mjs:124` Reproduced.

The unified diffs that addedRanges parses are requested without --no-color or
--no-ext-diff. With color.ui=always or color.diff=always, every `@@` line starts
with an ANSI escape, so the `^@@` regex never matches. Every span is empty and
every file passes. A configured diff.external breaks the parsing the same way.
This affects check.mjs (lines 124 and 165) and watch.mjs (line 69).

**When it happens:** Reproduced. In a scratch repo that normally gives 4
violations,
`GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=color.ui GIT_CONFIG_VALUE_0=always terse`
prints 'No new comment-contract violations' and exits 0.

**Suggested fix:** Add --no-color and --no-ext-diff to every `git diff` call in
check.mjs and watch.mjs.

### [low] terse-watch crashes with exit 1 on a bad config, despite its fail-open wrapper

`packages/terse/bin/terse-watch.mjs:2` Reproduced.

The bin statically imports src/watch.mjs, which imports scanner.mjs. scanner.mjs
calls loadConfig and compiles governed, todoPrefix and the bans patterns at
module load (lines 171, 226 and 229). Any error there is thrown before the bin's
try/catch and its process.exit(0), so Node prints a stack trace and exits 1.
gate.mjs avoids this with a dynamic import.

**When it happens:** Reproduced. Put `{bad` or a trailing comma in
.devkit/terse.json and pipe `{}` to terse-watch. It prints an uncaught
SyntaxError stack and exits 1, and with a matcher-less PostToolUse config this
is a hook error after every tool call. An invalid governed or ban pattern has
the same effect.

**Suggested fix:** Load ../src/watch.mjs with a dynamic `await import()` inside
the try block.

## dead-code (5)

### [high] In a git hook, `dead-code branch` overwrites the index being committed with the fork-point tree, or fails on every run

`packages/dead-code/src/worktree.mjs:365` Reproduced.

Every git child process gets the parent's whole environment: git.mjs run() at
line 27 passes `{ ...process.env, ...env }`, and with no env it inherits
everything. Inside the pre-commit, prepare-commit-msg and commit-msg hooks, git
exports GIT_INDEX_FILE, and in a linked worktree it also exports GIT_DIR. The
`git worktree add` call at worktree.mjs:365 fills the new worktree with an
internal `reset --hard`. That reset keeps the inherited GIT_INDEX_FILE, so it
writes the fork-point tree into the index of the commit in progress, and
`git commit` re-reads the index after the hook. When GIT_INDEX_FILE is relative
(`.git/index`, from a plain `git commit` in the main worktree), `worktree add`
fails instead. The same inherited variables send presentWorkspaces'
`git ls-files` (branch.mjs:77) and fillSubmodules' `git read-tree`
(worktree.mjs:311) to the wrong repository or index.

**When it happens:** Both reviewers reproduced this. Take a feature branch off
main that adds src/b.js, src/c.js and src/d.js, with a pre-commit hook running
`dead-code branch main`. (1) With `git commit -a`, which exports an absolute
GIT_INDEX_FILE, the hook runs normally, but the new commit holds only the
fork-point tree. b.js, c.js and d.js are silently dropped from the commit and
left untracked. A plain `git commit` in a linked worktree drops staged files the
same way. Setting `GIT_INDEX_FILE=$PWD/.git/index` by hand leaves `git status`
showing `D lib.js`, `?? lib.js`, `?? staged.txt`, `MM index.js`. (2) A plain
`git commit` in the main worktree makes dead-code fail with
`At the fork point …, fatal: .git/index: index file open failed: Not a directory`
and exit 2, which blocks every commit.

**Suggested fix:** In git.mjs run(), always build the child's environment from a
copy of process.env with git's repo-local variables removed: GIT_INDEX_FILE,
GIT_DIR, GIT_WORK_TREE, GIT_PREFIX, GIT_COMMON_DIR, GIT_OBJECT_DIRECTORY,
GIT_ALTERNATE_OBJECT_DIRECTORIES and the rest of
`git rev-parse --local-env-vars`. Then apply the explicit overrides (the
throwaway GIT_INDEX_FILE, NO_LFS) on top. Do the same for the knip spawn. Add a
test that runs `dead-code branch` from a pre-commit hook during `git commit -a`
and checks that the committed tree is unchanged.

### [medium] Branch mode reports the remaining exports of a revived dead file as new when `files` is not in include

`packages/dead-code/src/branch.mjs:161` Reproduced.

`deadFiles` is built from the fork-point findings of type `file`. atFork passes
the user's `include` straight to analyse, so when `include` leaves out `files`,
the fork point reports no unused files and `deadFiles` is empty. The fork point
also reports no exports for the unreachable file. Once the branch imports one
export from that file, every other export in it counts as new debt. The README
promises the opposite.

**When it happens:** Confirmed by running it. On main, src/orphan.ts is unused
and exports orphan, spare and spare2. The feature branch makes src/index.ts
import { orphan }. `dead-code branch main` exits 0.
`dead-code branch main --include exports,types`, or a config with
`include: ["exports","types"]`, exits 1 and reports spare and spare2 as new
unused exports.

**Suggested fix:** In branch mode, always ask knip for `files` on both sides.
Use the fork-point `file` findings to build `deadFiles`, then drop `file`
findings from the output when the user's include does not name `files`.
analyse() already does this for `unresolved`.

### [medium] A renamed project folder or configured workspace makes all existing debt look new in branch mode

`packages/dead-code/src/branch.mjs:99` Reproduced.

atFork looks for the project at `join(tree, prefix)` and filters workspaces by
their current paths or names. Neither is mapped back through `renames`. If the
branch renamed the project folder, the fork point has no package.json at the new
path, so atFork returns empty findings (line 103). If the branch renamed the
only configured workspace, presentWorkspaces drops it and the fork run is
skipped (line 104). Either way, moved() never gets to carry the old findings
forward, so every existing finding is reported as new. The README says renamed
files keep their old findings.

**When it happens:** Confirmed by running it. (a) The config sets
`{directory:"app"}`. The branch runs `git mv app web` and sets directory to web.
`dead-code branch main` exits 1 and reports the old debt in web/src/lib.ts and
web/src/orphan.ts as new. (b) The config sets `workspaces:["packages/a"]`. The
branch runs `git mv packages/a packages/b` and updates the config.
`dead-code branch main` exits 1 and reports all of packages/a's old debt as new.

**Suggested fix:** Before analysing the fork point, map `prefix` and each folder
workspace back to its fork-point path with the inverse of `renames` (for example
on `<path>/package.json`). Run knip at the fork with the old paths, and let
moved() carry the findings forward.

### [low] Branch mode crashes when a configured workspace existed at the fork only as a plain folder

`packages/dead-code/src/branch.mjs:84` Reproduced.

presentWorkspaces keeps a folder filter whenever `existsSync(join(dir, ws))` is
true, even when that folder is not a workspace at the fork point (it has no
package.json there). Knip then fails with `Workspace directory "..." not found`,
and the command exits 2. This function exists precisely so that workspaces the
branch added are dropped instead of making knip fail.

**When it happens:** Confirmed by running it. On main, packages/c holds only a
README.md. The config has `workspaces: ["packages/c"]`, or the user passes
`--workspace packages/c`. The branch adds packages/c/package.json and
src/index.ts. `dead-code branch main` prints
`At the fork point <sha>, knip could not run. ERROR: Workspace directory "packages/c" not found.`
and exits 2.

**Suggested fix:** Keep a folder filter only when
`join(dir, ws, 'package.json')` exists at the fork, ideally only when that
folder is also one of the fork's workspace folders. Leave the handling of globs
and package names as it is.

### [low] Any file that merely contains the skills marker text has all its findings hidden as generated

`packages/dead-code/src/config.mjs:245` Reproduced.

applyGenerated treats a file as generated whenever the substring 'Generated by
@euanmsm/skills' appears anywhere in its first 2 KB (head() at line 269). It
does not check for the header comment that sync actually writes. Any source file
that quotes the marker has every finding moved silently to `known` as
'generated'. These entries never come from the config, so they can never be
flagged as stale either.

**When it happens:** Run `dead-code` on the devkit repo.
packages/skills/src/sync.mjs (which contains
`export const MARKER_TAG = 'Generated by @euanmsm/skills'`) and
packages/dead-code/src/config.mjs (line 18, `const GENERATED_TAG = ...`) both
count as generated. An unused export added to either file is never reported, and
the run exits 0.

**Suggested fix:** Match only the header the generator writes: a comment opener
followed by the marker on one of the first few lines, the same
`opener + MARKER_TAG` shape that sync.mjs builds. A string literal containing
the text should not match.

## wt (19)

### [medium] `wt supabase` in a worktree with no override config runs against the main checkout's stack

`packages/wt/src/supabase/project.mjs:112` Reproduced.

workdir() quietly falls back to the tracked supabase folder whenever
.wt-supabase/supabase/config.toml is missing, and never checks whether the
checkout is a slotted linked worktree. The tracked config holds the main
checkout's project_id and ports, so every `wt supabase ...` in that worktree
(cli.mjs:100) acts on the main checkout's containers and volumes. buildProject
(project.mjs:74) returns null without a warning when the branch has no
supabase/config.toml, so create can leave a worktree in exactly this state.

**When it happens:** Run `wt feat -b feat -f old-tag` from a base that predates
supabase/config.toml, so no override is written. Later, merge main into feat so
config.toml appears, then run `wt supabase db reset` in the worktree. It uses
./supabase/config.toml (project_id "app", port 54322) and resets the main
checkout's local database, losing its data. `wt kill` and `wt -d` never stop it
either, because ownProjectId() finds no override.

**Suggested fix:** In cli.mjs supabase(), when slotOf(root) > 0 and the override
is missing, refuse or rebuild the override with buildProject() instead of
falling back to the tracked folder. Also warn in create() when buildProject
returns null while a supabase block is configured.

### [medium] wt port, ports(), wt supabase and the Supabase guard ignore .devkit/wt.local.json inside a linked worktree

`packages/wt/src/ports.mjs:23` Reproduced.

create, list, kill and remove call loadWtConfig(checkoutRoot, mainRoot), so the
untracked wt.local.json is read from the main checkout. offset() and ports()
(ports.mjs:23 and 67), cli.mjs supabase() (line 83) and target.mjs
supabaseConfig() (line 65) call loadWtConfig(root) with no second argument, so
main defaults to the worktree. The local file never exists there: it is
gitignored and not matched by env.copy. Inside a worktree, every local override
is silently dropped, and these commands see a different config from the one
create used.

**When it happens:** (a) wt.local.json sets {"ports":{"step":50}}.
`wt feat -b x` makes slot 1 and rewrites .env to :3050, but inside the worktree
`next dev -p $(wt port app)` binds 3100, so the app and its env files disagree
(and 3100 may belong to another lane). (b) The supabase block or
supabase.envFiles lives only in wt.local.json. create boots the worktree's
stack, but `wt supabase start` in the worktree fails with 'No "supabase" block',
and requireSupabaseTarget() checks the wrong env files.

**Suggested fix:** Pass the main checkout as the second argument,
loadWtConfig(root, mainRoot(root)), in ports.mjs offset/ports, cli.mjs
supabase() and target.mjs supabaseConfig().

### [medium] wt -d cannot remove a worktree whose folder is gone when preDelete hooks are configured

`packages/wt/src/remove.mjs:37` Reproduced.

remove() runs the preDelete hooks with cwd set to the worktree path before it
checks whether the folder exists. When the folder is missing, spawn fails with
ENOENT, exec() turns that into exit code 127, and a required hook throws 'Delete
stopped, nothing removed'. The
`existsSync(path) ? worktree remove : worktree prune` branch at line 57, written
for exactly this case, can never be reached while any required preDelete hook is
configured. The error also blames the hook rather than the missing folder.

**When it happens:** Config has hooks.preDelete: ["npm run db:dump"]. The user
runs `rm -rf ../app-wt/feat`, then `wt -d feat`. Output:
`wt: Delete stopped, nothing removed: "npm run db:dump" exited 127 in .../feat.`
The worktree entry and branch cannot be removed with wt until the config is
edited. (Reproduced: runHooks(['true'], '/nonexistent') throws 'exited 127'.)

**Suggested fix:** Skip the preDelete hooks, with a note, when existsSync(path)
is false. Report a spawn error on the cwd as its own message rather than as
exit 127.

### [medium] Supabase guard misreads the API port when the [api] header has a comment or inner spaces

`packages/wt/src/supabase/target.mjs:99` Reproduced.

readApiPort only enters the api table when the trimmed line is exactly '[api]'.
patchConfig in project.mjs accepts `[api] # comment` and `[ api ]` through its
HEADER regex, so the override config and env files get the shifted port.
readApiPort misses the header, returns null, and the expected port falls back to
54321, the main checkout's port. The guard then refuses the worktree's correct
stack and passes the main stack's URL.

**When it happens:** Tracked supabase/config.toml has `[api] # REST API`. In
slot 1, .env.local is rewritten to http://127.0.0.1:55321, but
`wt supabase check` exits 1 with 'not this tree's stack', and every script
calling requireSupabaseTarget() throws. If .env.local instead still points at
:54321 (hand-edited or copied before ports were configured), the guard passes,
and a seed script writes to the main checkout's database with the service-role
key. Verified in scratch: expectedUrl 54321, mismatch null.

**Suggested fix:** Match headers with the same tolerant regex as project.mjs
HEADER, or reuse getValue(text, 'api', 'port') from project.mjs.

### [medium] Concurrent creates can take the same slot, sharing ports and one Supabase project id

`packages/wt/src/create.mjs:146` Reproduced.

nextSlot(usedSlots()) is worked out before `git worktree add`, and the slot
record is only written after the checkout (writeRecord at line 153). There is no
lock, so two creates running at the same time both see the same free slot. Both
worktrees get the same service ports and the same `<id>-wtN` project id, so they
share Docker containers and volumes.

**When it happens:** Two terminals or agents run `wt a -b a` and `wt b -b b`
within a few seconds of each other. Both get slot 1. b's provision runs
`supabase db reset` on the `*_app-wt1` containers and wipes a's freshly seeded
database. Their dev servers fight over the same ports, and `wt kill a` also
stops b's servers.

**Suggested fix:** Claim the slot atomically before the checkout, for example
with an exclusive-create lock file per slot (openSync with 'wx') in the common
git dir. Or re-check usedSlots after writeRecord and abort or retry on a clash.

### [medium] --all and wt -d kill editors and multiplexers that the docs promise never to stop

`packages/wt/src/kill.mjs:23` Reproduced.

PROTECTED only covers a few shells, plus code, cursor, vim, nvim, vi and claude.
The README says --all 'never stops shells, editors, Claude sessions'. Other
editors (nano, emacs, hx, micro, zed, sublime_text), shells (pwsh, nu, xonsh)
and multiplexers (tmux, screen, zellij) whose cwd is inside the worktree get
SIGTERM, then SIGKILL. remove() runs with folder: true, so every `wt -d` does
this too.

**When it happens:** The user has `nano .env.local` or emacs open in the
worktree with unsaved edits, or a tmux server started from the worktree folder,
and runs `wt kill feat --all` or `wt -d feat`. The editor is killed and the
unsaved edits are lost, or the tmux server and all its sessions, including ones
for other projects, are killed.

**Suggested fix:** Extend PROTECTED to cover common editors, shells and
multiplexers (nano, emacs, hx, micro, zed, subl/sublime_text, pwsh, nu, xonsh,
tmux, screen, zellij).

### [medium] An unreadable folder or broken .env symlink aborts create after the worktree is already added

`packages/wt/src/env.mjs:48` Reproduced.

envFiles walks the main checkout with readdirSync and has no error handling. An
unreadable folder throws EACCES, and a dangling `.env*` symlink makes
copyFileSync (line 76) throw ENOENT. create runs this after `git worktree add`
and writeRecord, so the worktree is left half-built: no env files, no Supabase
override, no hooks and nothing opened. Running create again only prints 'already
exists'.

**When it happens:** On Linux, a docker-compose bind mount `./pgdata` is owned
by uid 999 with mode 0700. `wt feat -b feat` fails with
`EACCES: permission denied, scandir '<repo>/pgdata'` after the branch and
worktree exist. A stale `.env.local -> ../secrets/.env` symlink does the same.

**Suggested fix:** Wrap readdirSync in try/catch and skip unreadable folders.
Skip dangling symlinks, or catch per file in copyFiles and warn. List the env
files before `git worktree add`.

### [low] Target guard parses env files differently from dotenv, so it passes or refuses the wrong URL

`packages/wt/src/supabase/target.mjs:36` Reproduced.

readEnvFile() uses `^KEY=(.+)$` and takes the first match. dotenv and Next.js
also accept `export KEY=...` and `KEY = value`, strip inline `# comments` from
unquoted values, and let a later duplicate win. When the guard does not see a
line the app will load, it falls back to expectedUrl and reports no mismatch, so
it fails open. An inline comment makes it reject a correct URL.

**When it happens:** A slot 1 worktree's apps/main/.env.local has
`NEXT_PUBLIC_SUPABASE_URL = http://127.0.0.1:54321` or
`export NEXT_PUBLIC_SUPABASE_URL=...:54321`. The guard passes, then the script
loads the file with dotenv and talks to the main checkout's stack with the
service-role key. Separately,
`NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:55321 # this tree` is rejected as
'not a valid URL'. Both were verified in scratch.

**Suggested fix:** Parse like dotenv: allow an optional `export ` prefix and
whitespace around `=`, strip unquoted inline comments, and let the last
occurrence win. If a line names the key but cannot be parsed, report a mismatch
instead of falling back to expectedUrl.

### [low] Service ports that overlap across slots are accepted, so wt kill stops another worktree's servers

`packages/wt/src/config.mjs:230` Reproduced.

validate() checks each port on its own but never checks that the spread between
services is smaller than ports.step. With app 3000 and api 3100 at step 100,
slot 1's app port (3100) is the main checkout's api port, and slot 1's api port
(3200) is slot 2's app port. lanePorts() (kill.mjs) only drops ports the main
checkout uses, so it stops a port that belongs to another worktree. Verified in
scratch: validate() reports no problems, and lanePorts gives 3200 to both slot 1
(api) and slot 2 (app).

**When it happens:** Config services { app: 3000, api: 3100 }, step 100.
Worktree 2 runs next dev on 3200. `wt kill wt1` or `wt -d wt1` finds the
listener on 3200 and sends SIGTERM, then SIGKILL, killing worktree 2's app.

**Suggested fix:** In validate(), reject configs where max(services) -
min(services) >= ports.step, or where a shifted port lands in the Supabase
ranges. Or have lanePorts exclude ports owned by any other used slot.

### [low] Dev servers whose path or arguments contain 'docker', 'colima' and similar words are never stopped

`packages/wt/src/kill.mjs:385` Reproduced.

The DOCKER regex, meant for Docker's port-forwarding daemons, is tested against
the whole ps command line, including paths and arguments, not just the program
name. Any listener whose path contains docker, colima, lima, orbstack, vpnkit or
rootlesskit is treated as Docker itself and left running.

**When it happens:** The repo is ~/code/docker-dashboard, so the worktree is
~/code/docker-dashboard-wt/feat.
`node .../docker-dashboard-wt/feat/node_modules/.bin/next dev -p 3100` is left
alone ('held by Docker itself (node)'). `wt -d feat` deletes the folder and
leaves an orphan holding 3100, so the next slot 1 worktree hits EADDRINUSE.

**Suggested fix:** Test DOCKER only against holder.command and the executable's
basename, not the full argument string.

### [low] Supabase data is deleted before a worktree removal that can still fail

`packages/wt/src/remove.mjs:51` Reproduced.

remove() calls teardown() (`supabase stop --no-backup`, which drops the volumes)
before `git worktree remove --force` at line 57. A locked worktree needs
`-f -f`, so git refuses after the database is already gone.

**When it happens:** The user ran `git worktree lock ../app-wt/feat`, then
`wt -d feat`. The app-wt1 volumes are deleted, then git worktree remove fails,
and the worktree is left with an empty stack.

**Suggested fix:** Check the `locked` line in `git worktree list --porcelain`
first and refuse, or run the git removal before teardown.

### [low] Config validation crashes with a TypeError when ports.services is null and supabase.appService is set

`packages/wt/src/config.mjs:283` Reproduced.

validate() records that ports.services is not an object but carries on.
validateSupabase() then evaluates `sb.appService in config.ports.services`,
which throws on null. The user gets a raw JS error instead of the promised
message naming the bad setting.

**When it happens:** wt.json has "ports": {"services": null} and "supabase":
{"appService": "app"}. Every wt command prints
`wt: Cannot use 'in' operator to search for 'app' in null`.

**Suggested fix:** Only test appService membership when config.ports.services is
a non-null object.

### [low] Slots are unbounded, so Supabase ports go past 65535 from slot 12 with the defaults

`packages/wt/src/slots.mjs:102` Reproduced.

nextSlot has no upper limit, and nothing checks that the shifted service or
Supabase ports stay within the valid range. create writes impossible ports into
the override config.toml and the env files without a warning.

**When it happens:** With basePort 54320 and step 1000, the 12th concurrent
worktree gets Supabase ports 66320-66329. `supabase start` fails and the env
URLs point at invalid ports, while the summary reports success.

**Suggested fix:** In create, work out the highest port the slot needs and
refuse with a clear message if it is over 65535.

### [low] mainRoot is wrong in a git submodule, so worktrees land inside the superproject's .git

`packages/wt/src/git.mjs:87` Reproduced.

mainRoot takes dirname(git rev-parse --git-common-dir), which is only the
checkout root when the git dir is <root>/.git. For a submodule the common dir is
<super>/.git/modules/<name>, so mainRoot returns <super>/.git/modules.
worktreesDir, the env file search and findWorktree then all use the wrong path.

**When it happens:** In a repo that is a submodule, `wt feat -b feat` creates
the worktree at <super>/.git/modules-wt/feat. Verified in scratch.

**Suggested fix:** Take the main checkout from the first entry of
`git worktree list --porcelain` instead of dirname of the common dir.

### [low] wt supabase exits 127 with no message when the supabase CLI is missing

`packages/wt/src/cli.mjs:100` Reproduced.

exec resolves 127 on a spawn 'error' event and prints nothing. The `wt supabase`
passthrough returns that code with no onPath('supabase') check, unlike create.

**When it happens:** Without the supabase CLI on PATH, `npm run supabase:start`
(`wt supabase start`) exits 127 with no output at all.

**Suggested fix:** Print `wt: could not run <program>: <message>` on spawn error
in exec, or check onPath('supabase') in supabase().

### [low] wt port and ports() throw outside a git checkout, breaking dev scripts in Docker or zip installs

`packages/wt/src/ports.mjs:22` Reproduced.

offset and ports default root to repoRoot(), which throws when there is no .git
above. The documented `next dev -p $(wt port app)` pattern and in-code ports()
then fail, although the correct answer outside a checkout is the base ports
(offset 0).

**When it happens:** In a Docker image with .git in .dockerignore, `npm run dev`
prints 'wt: No git repository above /app' and runs `next dev -p` with no value,
which errors. A config file calling ports() crashes at load.

**Suggested fix:** Catch the repoRoot error and fall back to process.cwd() with
offset 0.

### [low] kill --all protects any process whose command line contains the word 'claude'

`packages/wt/src/kill.mjs:236` Reproduced.

isProtected exempts a process when /\bclaude\b/i matches anywhere in the full
command line, including paths. A worktree path like
~/code/claude-plugins-wt/feat makes every node dev process inside it protected.

**When it happens:** With the repo at ~/code/claude-plugins, `vitest --watch`
runs in the worktree. `wt kill feat --all` prints 'Nothing running.', and
`wt -d feat` removes the folder while vitest keeps running.

**Suggested fix:** Match 'claude' only against the program name or the basename
of argv[0]/argv[1].

### [low] supabase.link entries are not validated, so '.' or '../x' overwrite or delete files outside the override folder

`packages/wt/src/supabase/project.mjs:84` Reproduced.

validate() only checks that link is a list of strings. buildProject does
rmSync(join(out, name), recursive) and then symlinks. '.' or '' replaces the
override folder with a symlink to the tracked supabase folder, so the patched
config.toml is written over the tracked one. '../x' deletes a folder elsewhere
in the worktree.

**When it happens:** With `"link": ["."]`, `wt feat -b feat` rewrites the
worktree's tracked supabase/config.toml with project_id app-wt1 and shifted
ports, which shows up as a diff that can be committed. `"link": ["../src"]`
wipes the worktree's src folder.

**Suggested fix:** In validateSupabase, require each link entry to be a single
non-empty path segment with no '/', '\\', '.' or '..'.

### [low] An inherited offset variable overrides the new worktree's ports inside postCreate hooks

`packages/wt/src/create.mjs:185` Reproduced.

Hooks run with {...process.env, ...WT_*}, and offsetFromEnv() gives
process.env[offsetEnv.name] priority over the env files and the slot. When wt
runs from a shell that already exports that variable, any `wt port` or ports()
call in the new worktree's hooks uses the parent's offset.

**When it happens:** offsetEnv is WORKTREE_PORT_OFFSET, and direnv exports 100
in the slot 1 worktree. From there, `wt b -b b` gets slot 2, but a postCreate
hook calling `wt port app` writes 3100 (slot 1's port) into b's generated
config.

**Suggested fix:** When ports.offsetEnv is set, add [offsetEnv.name]:
String(shift) to the env passed to runHooks, in both create and remove.

## skills-sync (7)

### [medium] clean-commit-history rewrites against a stale local base branch and pulls upstream commits into the branch

`packages/skills/templates/clean-commit-history/SKILL.md:52` Reproduced.

The preflight sets BASE to the local branch name ({{baseBranch}}, line 47) and
takes FORK = `git merge-base "$BASE" HEAD` (line 52). Nothing checks
origin/<base> or prefers it. If local main is behind origin/main, FORK is an
older commit. `git reset --soft FORK` then re-commits everything between FORK
and HEAD, which includes other people's upstream commits, and they end up
squashed into the branch's new layered commits. The tree-identity check still
passes, so the skill reports success.

**When it happens:** Local main is at W and origin/main is at X, ahead of W. The
user runs `git switch -c feat origin/main`, commits, then runs
/clean-commit-history. FORK = merge-base(main, HEAD) = W. After the rewrite and
the suggested `git push --force-with-lease`, the branch no longer contains
commits W..X as separate commits. Their content sits inside the branch's own
commits, and the GitHub PR diff shows all of that upstream work as the PR's
changes.

**Suggested fix:** Resolve the base the way the dead-code and pr skills do:
prefer origin/<base> when refs/remotes/origin/<base> exists and fall back to the
local branch. Alternatively, abort when the local base is behind origin.

### [medium] CRLF checkouts make sync refuse its own files and make check report them as hand-written

`packages/skills/src/sync.mjs:175` Reproduced.

markerLine splits on '\n' only and compares lines[0] with '---' exactly. In a
CRLF checkout the first line is '---\r', so frontmatter is not detected,
markerLine returns '---\r', and isGenerated returns false for every generated
SKILL.md and agent/rule file that has frontmatter. sync treats these files as
hand-written and refuses to write, check reports them as 'not generated by
skills sync', and orphan cleanup cannot find them. Even when the marker is
detected, CRLF content never matches the rendered LF content byte for byte, so
check reports the file as edited.

**When it happens:** A Windows developer with core.autocrlf=true clones a repo
that has committed .claude/skills/*/SKILL.md. Running
`npx --no-install skills sync` prints 'These files were not written by skills
sync, so it will not overwrite them: ...' and exits 1, and `skills check` also
exits 1. The only way out is --force, which also removes the protection for real
hand-written files. The scratchpad reproduction confirmed this.

**Suggested fix:** Normalise line endings in markerLine (split on /\r?\n/) and
compare contents after converting CRLF to LF in both sync and check.
Alternatively, ship a .gitattributes rule (eol=lf) for generated paths.

### [medium] code-review diff mode prefers a stale local base, so the review covers unrelated upstream commits

`packages/skills/templates/code-review/SKILL.md:93` Reproduced.

BASE_REF uses local refs/heads/<base> whenever it exists and falls back to
origin/<base> only when the local branch is missing. The pr prepass and the
dead-code skill do the opposite and prefer origin/<base>, because GitHub diffs
against it. When local main is behind origin/main, the merge-base is older, so
CHANGED_FILES, the per-file patches and the prepass --base all include commits
that landed upstream later. Reviewers then file findings against already-merged
code, and the dead-code branch check blames the branch for it. clean-comments'
`{{baseBranch}}...HEAD` has the same stale-local-base problem and has no
fallback when the local branch is missing.

**When it happens:** In a worktree created with
`git worktree add -b feat ../feat origin/main`, where local main is weeks old,
running /code-review on feat diffs from the old local main and reviews dozens of
upstream files the branch never touched.

**Suggested fix:** Check
refs/remotes/origin/$BASE_BRANCH first and fall back to refs/heads/$BASE_BRANCH,
as the dead-code template does. Apply the same fix to clean-comments.

### [low] Changing skillsDir, agentsDir or rulesDir orphans earlier generated files where neither sync nor check can see them

`packages/skills/src/sync.mjs:131` Reproduced.

generatedOnDisk only scans the directories named in the current config. After a
folder setting changes, files that sync wrote into the old folder keep their
marker but are never removed, and check never reports them as 'no longer in the
config'. The docs promise both behaviours.

**When it happens:** A repo synced into the default .claude/skills follows the
README's Codex advice, sets "skillsDir": ".agents/skills" and runs sync.
.claude/skills/code-review/SKILL.md and review.workflow.js stay on disk and
never update again, while `skills check` prints 'in step'. Claude Code keeps
loading the stale copies, and creating the recommended .claude/skills symlink
fails because the folder is not empty. rulesDir behaves the same way: the old
.claude/rules/pr-reviews.md stays loaded next to the new copy.

**Suggested fix:** Also scan the default folders (SHARED_DEFAULTS) for files
carrying the marker, or record the folders used on the last sync (for example
under .devkit), so sync removes old generated files and check reports them.

### [low] sync crashes with ENOENT when agentsDir and rulesDir name the same folder

`packages/skills/src/sync.mjs:140` Reproduced.

generatedOnDisk loops over [agentsDir, rulesDir] and does not de-duplicate, so
when both settings name the same folder, every generated .md there is listed
twice. The removal loop (rmSync at line 246) deletes the first entry and throws
ENOENT on the second. readConfig accepts this configuration.

**When it happens:** skills.json has "agentsDir": ".claude/shared" and
"rulesDir": ".claude/shared", with clean-comments enabled. The user removes
clean-comments and runs `skills sync`. comments-specialist.md is deleted, the
second rmSync throws, and sync exits 1 partway through cleanup. `skills check`
also lists the file twice.

**Suggested fix:** De-duplicate the candidates (return [...new Set(candidates)])
or reject overlapping folder settings in readConfig.

### [low] `skills --help` and `skills help` exit 1 as unknown commands

`packages/skills/bin/skills.mjs:62` Reproduced.

Any command other than the known ones falls into the else branch, including
--help, -h and help. That branch prints USAGE to stderr and calls
process.exit(command ? 1 : 0), so a request for help reports failure.

**When it happens:** Running `npx --no-install skills --help` prints the usage
and exits 1, which breaks a `&&` chain or a CI step that probes the tool with
--help.

**Suggested fix:** Treat 'help', '--help' and '-h' like no command: print USAGE
to stdout and exit 0.

### [low] code-review SKILL mixes cwd-relative shell paths with root-relative prepass paths and relies on shell variables carrying over between Bash calls

`packages/skills/templates/code-review/SKILL.md:65` Reproduced.

The skill writes SCRATCH_DIR="tmp/code-reviews" and _files.tmp.txt (line 181)
relative to the shell's current directory. `skills prepass` resolves --out,
--scratch and --files-from against the repo root. Unlike clean-comments and
clean-commit-history, this skill never says to run from the repo root, and it
never warns that variables such as BRANCH, SCRATCH_DIR, BASE, TARGET and the
undefined FILES array do not survive between Bash calls.

**When it happens:** In a monorepo, the session's Bash cwd is packages/web. The
file list is written to packages/web/tmp/code-reviews/_files.tmp.txt, then
`skills prepass tools --files-from tmp/code-reviews/_files.tmp.txt` looks for it
under <root>/tmp/code-reviews/, fails with ENOENT, and never writes the
sentinel. In a fresh shell, `${FILES[@]}` expands to nothing and the tools run
on an empty file list without any error.

**Suggested fix:** Add the instruction to run from the repository root (or cd
"$(git rev-parse --show-toplevel)" in each block) and the note that values must be written out literally in every command. Replace ${FILES[@]}
with an explicit instruction to write out the resolved list.

## skills-review (17)

### [medium] `${BASE:+--base "$BASE"}` becomes one argument under zsh, so diff mode drops --base and the branch-wide dead-code check never runs

`packages/skills/templates/code-review/SKILL.md:183` Reproduced.

The prepass launch line depends on bash splitting the unquoted
`${BASE:+--base "$BASE"}` into words. zsh does not split unquoted expansions, so
argv gets the single string `--base <sha>`. parseFlags (src/review/cli.mjs:90)
stores it under the key `base <sha>`, `flags.base` is undefined, and runTools
gets `base: null`. The Claude Code Bash tool runs in the user's shell, which is
zsh by default on macOS.

**When it happens:** On macOS with zsh, run `/code-review` on a branch in a repo
with @euanmsm/dead-code installed.
`zsh -c 'BASE=abc; printf "[%s]\n" ${BASE:+--base "$BASE"}'` prints
`[--base abc]` as one argument. The deadCode tool runs its target-mode command
(`dead-code --json -- <files>`) instead of `dead-code branch --json <base>`, so
exports the branch left dead in files it did not touch are never reported.
Nothing shows an error.

**Suggested fix:** Always pass `--base "$BASE"`, with BASE empty in target mode,
since the CLI already treats an empty --base as unset. Optionally make
parseFlags reject or split a `--key value` token.

### [medium] Duplicate bundle keys are accepted, and the earlier bundle's lenses silently never run

`packages/skills/src/review/config.mjs:543` Reproduced.

resolveBundles (starts at line 498) never checks that bundle keys are unique.
`byKey` and the workflow's BUNDLE_BY_KEY keep only the last bundle with a given
key. After overrides, the workflow filters each active bundle's lenses to
`BUNDLE_BY_KEY.get(bundle.key).lenses`, which removes every lens in the earlier
bundle with the same key. The review quietly does less than the config says,
even though the module header says the config refuses cases like this.

**When it happens:** Reproduced: a config with bundles
`{key:'x', lenses:[bugs,error-handling,security,performance]}` and
`{key:'x', model:'sonnet', lenses:[dry,readability,typing,comments,dead-code]}`
resolves without error. The workflow runs one `review:x` agent on sonnet with
only the craft lenses. bugs, error-handling, security and performance never run.

**Suggested fix:** In resolveBundles, fail when a bundle key repeats. Also
consider refusing keys that collide with split-half names (`<key>-<n>`).

### [medium] Scratch, file-list and target paths are relative to cwd in the skill but to the repo root in the prepass

`packages/skills/templates/code-review/SKILL.md:65` Reproduced.

The skill sets SCRATCH_DIR="tmp/code-reviews" and writes `_files.tmp.txt`
relative to the session's cwd. `skills prepass` finds the root by walking up to
`.git`, then resolves --scratch, --files-from and --out against that root and
checks target files with path.join(root, file). Reviewers and the wait loop read
`${SCRATCH_DIR}/_prepass.done.json` relative to their own cwd. The two only
agree when Claude Code runs from the repository root.

**When it happens:** Claude Code is opened in `<repo>/packages/api` and the user
runs /code-review. The skill writes
`packages/api/tmp/code-reviews/_files.tmp.txt`, but `prepass tools` reads
`<repo>/tmp/code-reviews/_files.tmp.txt`, dies with ENOENT and writes no
sentinel. `prepass split` writes patches under `<repo>/tmp/...`, not where
PATCH_DIR points. Every reviewer waits out the full sentinel loop and reviews
with no tool reports. In target mode, a package-relative `src/x.ts` is checked
as `<repo>/src/x.ts` and silently dropped.

**Suggested fix:** Anchor the skill on `git rev-parse --show-toplevel`: either
cd there first, or set SCRATCH_DIR to "$(git rev-parse
--show-toplevel)/tmp/code-reviews" and make TARGETS root-relative before writing
the list. Or resolve CLI paths against process.cwd().

### [medium] Diff mode prefers a stale local base branch over origin, so other people's commits get reviewed as the branch's changes

`packages/skills/templates/code-review/SKILL.md:93` Reproduced.

BASE_REF is `refs/heads/<base>` whenever a local branch exists. It falls back to
origin/<base> only when there is no local branch. BASE is then the merge-base
with that ref. If local main is behind origin, which is normal with worktrees,
the merge-base is the old local tip rather than the real fork point.

**When it happens:** Local `main` was last pulled a week ago, and the feature
branch was cut from a freshly fetched `origin/main` (for example a Claude Code
worktree). `git merge-base HEAD main` returns last week's main, so
CHANGED_FILES, the patches and the dead-code base include every commit merged
that week. In `pr` mode, findings on those lines are not in the GitHub PR diff,
and the review POST fails with 422 'Line could not be resolved'.

**Suggested fix:** Prefer `origin/<base>` when it exists, or whichever of the
local and origin refs descends from the other (`git merge-base --is-ancestor`).
In pr mode, run `git fetch origin $PR_BASE` and always use `origin/$PR_BASE`.

### [medium] Target-mode paths are not normalised, so './src/x.ts' empties the knip report and breaks the import graph

`packages/skills/src/review/cli.mjs:117` Reproduced.

readFileList only trims each line and never normalises it to a root-relative
path. Every consumer compares these paths as exact strings against tool output.
keepFilesUnderReview checks knip's `src/x.ts` against the listed paths.
groupCallSites strips `./` from rg hits but not from `symbol.file`. Reproduced:
keepFilesUnderReview(`{issues:[{file:'src/a.ts'}]}`, ['./src/a.ts']) returns
`issues: []` with `filesOutsideReview: 1`.

**When it happens:** The user runs `/code-review ./src/billing`, tab-completes
`./src/...`, or passes an absolute path. The knip report comes back `ok` with no
issues and says every issue was outside the review, so dead exports go
unreported without any sign of a problem. The import graph treats each symbol's
own file as a caller, so real orphans never appear under 'No call sites found'.

**Suggested fix:** In readFileList, normalise each entry to
`path.relative(root, path.resolve(root, line))` with forward slashes.

### [medium] appendFiles tools fail with E2BIG on Linux for large diffs because the whole command is one `sh -c` argument

`packages/skills/src/review/prepass.mjs:311` Reproduced.

For an appendFiles tool, runTool joins every file under review into one command
string and spawns it with `shell: true` (line 411), so it reaches `/bin/sh -c`
as a single argument. Linux limits one argument to 128 KiB (MAX_ARG_STRLEN), so
spawn fails with E2BIG and the tool is marked failed. Diff mode has no file cap.
macOS has no per-argument limit, so this fails only on Linux and in CI.

**When it happens:** On Linux, a branch renames an import across about 2,000 to
2,500 files (roughly 150 KB of paths). The built-in `comments` tool
(`npx --no-install terse scan <files...>`) and any user appendFiles tool fail
with spawn E2BIG. The comments lens gets no terse report on exactly the large
diffs where it would help most.

**Suggested fix:** Pass the files as separate argv entries without the shell, or
through a file or stdin, or chunk the list below about 100 KB and merge the
outputs.

### [low] Reused finding ids in one bundle share a uid, so one file's verdict overwrites another's

`packages/skills/templates/code-review/review.workflow.js:1318` Reproduced.

The uid is `${active.key}::${finding.id}`, and the id comes straight from the
model with no uniqueness check. Two findings with the same id share a uid. The
verifier mapping (`batch.findings.find(one => one.id === verdict.id)`) sends
each verdict to the first finding with that id, and verdictByUid (line 1425) is
a Map, so the last verdict wins for both findings, even when they are about
different files.

**When it happens:** The correctness reviewer returns `bugs-1` for src/a.ts (a
real bug) and `bugs-1` again for src/b.ts. The files go to separate verifiers.
b.ts is refuted and a.ts is confirmed. If the refutation arrives last, the real
a.ts bug is listed under 'Refuted and dropped' and never reaches the report. The
opposite order promotes an unverified finding.

**Suggested fix:** Have the script assign the uid, for example
`${active.key}::${index}::${finding.id}`. Send that uid to the verifier and map
verdicts back by it or by position, not by the model's id.

### [low] Empty strings in a verifier's `corrected` object blank the finding, and an empty `lens` crashes the run at Compose

`packages/skills/templates/code-review/review.workflow.js:871` Reproduced.

correctionOf keeps every string field of `verdict.corrected`, including empty
strings. A verifier that fills the fields it left unchanged with "" overwrites
the finding's issue, file, line, detail and evidence with blanks. If `lens` is
"", groupByLens calls titleFor(""), which reads `word[0].toUpperCase()` on
undefined. That TypeError fires in top-level Compose code, so the whole run
fails after every review and verify agent has already run. A config lens key
with an empty dash segment, such as `e2e-` or `a--b`, crashes titleFor the same
way inside buildReviewerPrompt. That bundle is then dropped without being listed
in bundlesDied.

**When it happens:** Reproduced with test/workflow.mjs runWorkflow. The verifier
replied
`{verdict:'amended', corrected:{id:'',lens:'',file:'',line:'',issue:'',detail:'',whyItMatters:'',evidence:'',severity:'low',convention:null}}`.
The run threw `Cannot read properties of undefined (reading 'toUpperCase')` and
returned no report.

**Suggested fix:** In correctionOf, drop empty-string values and accept `lens`
only if it is a known LENSES key. Make titleFor tolerate empty segments
(`.filter(Boolean)` or `word.charAt(0)`). Validate lens keys in resolveLenses,
for example with `/^[a-z0-9]+(-[a-z0-9]+)*$/`.

### [low] An earlier prepass still running can drop stale reports and a sentinel into a new run

`packages/skills/src/review/prepass.mjs:284` Reproduced.

Every run writes the same fixed report and sentinel names in the shared scratch
dir. The only guard against stale output is deleting those files when a run
starts. A `prepass tools` still running in the background is never stopped or
told apart from the new run, and it later renames its reports and
`_prepass.done.json` into place. Both runs also write the same `.partial` files,
so one run's renameSync (line 511) can throw ENOENT inside a child 'close'
handler. That exception is uncaught, and the crashed process never writes a
sentinel.

**When it happens:** A user starts `/code-review src/a`, aborts after Recon
starts, then immediately runs `/code-review src/b`. Step 3 deletes the sentinel,
then the first prepass finishes and writes src/a's reports plus a sentinel. The
second run's reviewers see the sentinel straight away and read src/a's knip,
terse and import-graph reports as if they covered src/b.

**Suggested fix:** Pass a run nonce (`--run <id>`), write it into the sentinel
and report headers, and have reviewers check it. Or hold a lock file in the
scratch dir and kill or refuse a concurrent run.

### [low] pnpm-workspace.yaml entries with a trailing comment or a `**` glob are missed, so tools are not auto-enabled

`packages/skills/src/review/config.mjs:195` Reproduced.

workspacePatterns (starts at line 179) takes everything after `- ` to the end of
the line, so `  - 'apps/*' # apps` becomes the pattern `'apps/*' # apps`.
installedPackages expands only a trailing `/*` (line 151), so `packages/**`, a
form the pnpm docs use, is read as a literal directory that does not exist.
Dependencies declared only in those workspaces are invisible, and nothing says
why.

**When it happens:** Reproduced: a root package.json with no deps, plus a
pnpm-workspace.yaml with `  - 'apps/*' # apps` and `  - packages/**`, where
apps/web depends on typescript and packages/ui on knip. installedPackages
returns an empty set. The default `tsc` tool is dropped and
`knip`/`deadCode: 'auto'` resolve to false, so the review has no typecheck or
dead-code report.

**Suggested fix:** Strip a trailing ` #...` comment before matching an item.
Expand `**` and other globs with a real glob walk (for example fs.globSync)
instead of handling only a trailing `/*`.

### [low] Tools enabled by a dependency in one workspace only cannot run from the root under pnpm

`packages/skills/src/review/config.mjs:158` Reproduced.

installedPackages counts dependencies from every workspace manifest, and that
enables the default `tsc` tool and the auto `knip`, `comments` and `deadCode`
checks. Every tool then runs as `npx --no-install <bin>` from the repository
root. pnpm does not link a workspace package's bins into the root
node_modules/.bin, so npx cannot find them.

**When it happens:** In a pnpm monorepo, `knip` or `typescript` is a
devDependency of `packages/web` only. The check is auto-enabled,
`npx --no-install knip` at the root prints 'could not determine executable to
run', and every review's sentinel shows the tool as failed.

**Suggested fix:** Auto-enable a tool only when its bin resolves from the root
(`node_modules/.bin/<bin>`), or run it with the package manager's
workspace-aware exec.

### [low] Import graph reports any export whose name contains `$` as having no call sites

`packages/skills/src/review/prepass.mjs:666` Reproduced.

groupCallSites builds
`new RegExp(`\\b${name}\\b`)` without escaping the name. `$`is a valid identifier character but a regex end anchor, and`\b`does not match next to`$`,
so the pattern never matches. ripgrep finds the uses, but every hit is then
thrown away.

**When it happens:** A file under review has `export const $store = …`, which is
imported in five places. The graph lists `$store` under 'No call sites found
outside the defining file', a false dead-code lead for the dead-code lens.

**Suggested fix:** Escape the name and use identifier-aware boundaries, for
example `(?<![\\w$])${escape(name)}(?![\\w$])`.

### [low] Import graph is discarded when ripgrep exits 2 because of one unreadable file

`packages/skills/src/review/prepass.mjs:651` Reproduced.

findCallSites treats only exit code 1 as a valid result. ripgrep exits 2 on any
error, including one permission-denied file, even after printing every other
match. execFileAsync rejects, and the whole graph is replaced with
'unavailable', even though `err.stdout` holds the complete results.

**When it happens:** The repo has a root-owned file that is not gitignored, such
as a docker volume or a file generated with sudo. Every review reports 'Import
graph — unavailable', and Recon and the reviewers fall back to building
call-site maps by hand.

**Suggested fix:** On `err.code === 2` with non-empty stdout, use the stdout and
add rg's stderr to the graph header as a warning.

### [low] An interrupted prepass leaves detached tsc, knip and lint process groups running

`packages/skills/src/review/prepass.mjs:413` Reproduced.

Each tool is spawned with `detached: true` so the timeout can kill its whole
process group. That in-process timer is the only kill. The prepass installs no
SIGTERM, SIGINT or exit handler, so if the prepass process is killed, the tool
groups sit outside the signalled group and keep running with no timeout.

**When it happens:** A user cancels a review, or the session ends, while the
backgrounded `skills prepass tools` is running. `tsc --noEmit`, `npm run lint`
and knip keep running as orphans. A lint script in watch mode never exits and
holds CPU until the user kills it.

**Suggested fix:** Track the child pids, and on SIGTERM, SIGINT, SIGHUP and
exit, call `process.kill(-pid, 'SIGKILL')` for each child still running.

### [low] A lens `bundle` field cannot name a default bundle whose built-in lenses were all removed

`packages/skills/src/review/config.mjs:503` Reproduced.

With the default bundles, the filter that drops bundles emptied by `lens: false`
runs before the lenses are placed by their `bundle` field. So you cannot replace
a built-in lens with your own lens in the same bundle, even though the docs say
`bundle` names an existing bundle and `ci` is a documented default.

**When it happens:** The config
`lenses: { ci: false, 'gh-actions': { route: {...}, judges: '…', bundle: 'ci' } }`
makes sync fail with `lens "gh-actions" names bundle "ci", which does not exist`
(line 551). The only workaround is to write out the whole bundles list.

**Suggested fix:** Place lenses by their `bundle` field before dropping empty
default bundles, or drop only bundles that are still empty afterwards.

### [low] A config module with no default export is silently treated as an empty config

`packages/skills/src/review/config.mjs:67` Reproduced.

`(await import(url)).default ?? {}` falls back to all defaults when the file
exists but has no default export. There is no warning, so every custom lens,
bundle and prompt is ignored.

**When it happens:** `.devkit/code-review.mjs` contains
`export const review = { lenses: {...} }`. `skills sync` succeeds and generates
the stock roster, and `skills check` passes, so the repo's own lenses never run.

**Suggested fix:** When the file exists and `default` is undefined, fail with
`must export default an object`.

### [low] The skill says 'Clean' when stats.findings is 0, even if coverage gaps survived

`packages/skills/templates/code-review/SKILL.md:377`

stats.findings counts only non-coverage findings. In diff mode, a run whose only
surviving findings are coverage gaps has `stats.findings === 0`. The skill then
tells the agent to lead with 'Clean — every finding was refuted under
verification.', which is false.

**When it happens:** A diff adds an untested function and gets one confirmed
`coverage-testing-1` finding and nothing else. The user is told the review is
clean and everything was refuted, even though the report lists a coverage gap.

**Suggested fix:** Show the Clean line only when
`stats.findings === 0 && stats.coverage === 0`, or base its wording on the
refuted count.

## skills-pr (9)

### [medium] A file moved out of a layer is not counted in that layer or listed as deleted

`packages/skills/src/pr/prepass.mjs:74` Reproduced.

The changed and deleted lists come from `git diff --name-only --diff-filter=d`
and `--diff-filter=D`. Git detects renames by default, so a moved file shows up
only under its new path. Its old path is in neither list, so classifyFiles never
sees it. The layer that covered the old location is reported as untouched, and
the removed path is missing from 'Deleted files'. The backend scope treats a
removed route as an entry, so this loss matters.

**When it happens:** Reproduced by a reviewer. With layers
api=/^src\/app\/api\// (backend) and lib='src/lib/', run
`git mv src/app/api/users/route.ts src/legacy/users.ts`. The result is
layers.api=false and sections.backend=false. The facts file lists only
src/legacy/users.ts, under 'no layer', and shows 'Deleted files: (none)'. The
workflow drafts no backend checks and may publish the no-manual-checks checklist
even though a route has disappeared.

**Suggested fix:** Pass --no-renames to both name-only diffs, so a rename shows
as a delete plus an add. Or use `git diff --name-status -z` and record both
paths of each R entry.

### [medium] Non-ASCII paths are C-quoted by git, so they match no layer, test or importer

`packages/skills/src/pr/prepass.mjs:74` Reproduced.

The changed and deleted lists (lines 74-90) and the tracked list
(`git ls-files`, line 92) run without -z and without `-c core.quotePath=false`.
With git's default core.quotePath=true, any path with a non-ASCII byte, or with
a quote, tab or backslash, comes back quoted and escaped, e.g.
`"src/caf\303\251.ts"`. That string matches no layer prefix or regex, and the
test-beside, story, importer and boot.read lookups also miss it. The review
prepass already passes `-c core.quotePath=false`, but this code does not.

**When it happens:** Reproduced by a reviewer. A branch adds src/café.ts and
src/b.ts with the layer paths ['src/']. The facts file lists
`"src/caf\303\251.ts"` under 'no layer', and the file is missing from Importers
even though src/b.ts imports './café'. A branch that only touches
src/ui/Préférences.tsx marks every section false, and the workflow publishes 'No
manual checks needed'.

**Suggested fix:** Run these git calls as `git -c core.quotePath=false ...`.
Better still, use -z with --name-only and ls-files and split on NUL.

### [medium] The gate trusts author_association as seen by GITHUB_TOKEN, but publish checks it with the user's token

`packages/skills/src/pr/gate.mjs:174`

findChecklistComments keeps only comments whose author_association is in
TRUSTED_AUTHORS (OWNER, MEMBER, COLLABORATOR; defined at line 34). The publish
side filters the same way but lists comments through `gh` with the user's own
token, which can see their private org membership. The gate runs with the
workflow's GITHUB_TOKEN. For an org member with private membership who has write
access through the org or a team, not as a direct collaborator, GitHub can
report CONTRIBUTOR or NONE to that token. The gate then drops the comment that
publish treated as the checklist. This is widely reported GitHub API behaviour;
the reviewers did not test it here.

**When it happens:** In an org-owned repo, a developer with private org
membership runs /pr. Publish posts the checklist, but the gate finds main=null,
so every event sets Manual QA to failure with 'no QA checklist — run /pr'.
Running /pr again only PATCHes the same comment, so the required check blocks
the merge for good.

**Suggested fix:** Trust an author by their write permission (GET
/repos/{repo}/collaborators/{user}/permission) or by the PR author's login,
instead of relying only on author_association. At minimum, document that
membership must be public, and have publish warn when the association it sees
could differ from what the gate sees.

### [medium] In stack mode, any `gh stack` failure silently falls back to the main base and flattens the stack

`packages/skills/src/pr/prepass.mjs:162` Reproduced.

stackParent catches every error, such as the extension not being installed,
expired gh auth, a network failure or unexpected JSON, and returns null. null is
also what it returns for 'bottom of the stack or not in a stack'. With base:
'stack' set, prPrepass then falls back to baseBranch. The skill passes that base
to publish, which runs `gh pr edit --base <main>` on the existing PR. SKILL.md
says this must never happen because it flattens the stack.

**When it happens:** The repo sets base: 'stack'. Branch feat-3 sits above
feat-2, and its PR targets feat-2. The gh token has expired, so
`gh stack view --json` exits non-zero. The prepass reports main as the base,
builds the checklist from the whole diff against main, and publish retargets the
PR from feat-2 to main.

**Suggested fix:** Return null only when the command succeeds and the branch is
at the bottom of the stack or not in it. When config.base is 'stack' and
`gh stack view` fails or its output cannot be parsed, throw an error that says
why, or require --base.

### [medium] The prepass crashes when ripgrep hits any unreadable path, even when it found matches

`packages/skills/src/pr/prepass.mjs:609` Reproduced.

ripgrep() accepts only ENOENT and exit status 1 (no matches) and rethrows
everything else. rg exits 2 whenever any file or directory could not be read,
even when it printed matches and even with --no-messages. findImporters then
throws, and `skills pr prepass` fails with a raw 'Command failed: rg ...' error.
It never falls back to 'find the importers yourself'.

**When it happens:** Reproduced by two reviewers. With src/b.ts readable and
src/c.ts at mode 000, the prepass's rg call prints a match and exits 2, and
ripgrep() throws. In a real repo this happens with a root-owned Docker
bind-mount directory or a 0600 file owned by another user that is not in
.gitignore. /pr stops at the prepass.

**Suggested fix:** When status is 2, return error.stdout (or '') instead of
throwing, and note in the facts that the importer search was incomplete. Rethrow
only when there is no stdout, such as for a bad pattern.

### [medium] The prepass's diff and diffStat pick up the user's color and external-diff git config

`packages/skills/src/pr/prepass.mjs:66` Reproduced.

pr-qa-diff.tmp.patch is written from a plain `git diff mergeBase HEAD` (line
66), and diffStat comes from a plain `git diff --stat` (line 124). Neither has
the hardening the review prepass uses (--no-ext-diff --no-color --src-prefix=a/
--dst-prefix=b/). With diff.external set (e.g. difftastic), the patch every
agent reads as 'the diff' contains no unified diff. With color.ui=always, the
patch and diffStat are full of ANSI escapes. diff.noprefix or
diff.mnemonicPrefix change the header prefixes.

**When it happens:** Reproduced with `git config color.ui always`. The patch
file begins `^[[1mdiff --git a/src/b.ts ...^[[m`, and the printed diffStat
contains `\u001b[32m+\u001b[m`. With diff.external=difft, the patch file holds
difftastic's side-by-side output instead of a unified diff.

**Suggested fix:** Build both commands from hardened arguments:
`git -c core.quotePath=false diff --no-ext-diff --no-color --src-prefix=a/ --dst-prefix=b/`,
and add --no-color to the --stat call.

### [low] A missing continuation comment lets the Manual QA gate go green

`packages/skills/src/pr/gate.mjs:321` Reproduced.

computeStatus checks only the main comment and whichever part=N comments happen
to exist. Nothing records how many parts the checklist should have. The '(part 1
of 3)' heading is never parsed. If a part is never posted, or is deleted, the
gate loses its boxes without noticing and can report success.

**When it happens:** A long checklist splits into 3 comments. Publish posts
parts 1 and 2, then the POST for part 3 fails on a network error or rate limit,
and publish throws. A reviewer ticks every box in parts 1 and 2, and the gate
posts success for the head SHA, so the PR can merge with a third of the checks
never seen. Deleting a part comment has the same effect: the delete event
re-runs the gate and turns it green.

**Suggested fix:** Put the expected part count in the main comment as a hidden
marker, e.g. `<!-- pr-qa:parts=3 -->`. In computeStatus, return failure when any
part from 2 to N is missing.

### [low] Reset and status ignore task items GitHub still renders as checkboxes

`packages/skills/src/pr/gate.mjs:45` Reproduced.

BOX_PATTERN and TICKED_BOX_PATTERN (lines 45 and 48) only match -, * or +
followed by exactly one space and then [ ]. GFM also renders a checkbox for an
ordered item (`1. [ ]`) and for more than one space or a tab after the bullet
(`-  [x]`). A ticked box in one of these forms survives a push reset. An
unticked one is left out of countBoxes, so it does not keep the gate red.

**When it happens:** A reviewer adds `1. [ ] Re-check on Safari` to the
checklist. The gate reports green while that rendered box is unticked. Or a step
reformatted as `-  [x] ...` keeps its stale tick after a push, and the gate
stays green against new code.

**Suggested fix:** Widen both patterns to GFM's list-item grammar:
`^[ \t]*(?:[-*+]|\d{1,9}[.)])[ \t]+\[[ xX]\](?=\s|$)`, and the same shape with
capture groups for the ticked version.

### [low] A reset that races a re-publish can overwrite the new checklist with the old one

`packages/skills/src/pr/gate.mjs:482` Reproduced.

runGate('reset') reads the comments, then PATCHes each stale comment with
resetBody(oldBody). It does not re-read the comment or check that it is
unchanged before writing. If publish PATCHes the same comment with a new
checklist between the read and the write, the reset puts the old checklist's
steps back, stamped with the new head.

**When it happens:** Publish refuses with 'push first'. The user pushes and
immediately re-runs publish, as SKILL.md instructs. The synchronize-triggered
reset lists the comments while they still carry the old SHA, publish PATCHes the
new checklist, and then reset PATCHes over it with the old content stamped to
the new SHA. Reviewers tick the old steps, and the gate goes green against code
the checklist does not describe.

**Suggested fix:** Re-fetch each comment just before the PATCH, and skip it if
it already carries the head SHA or its body has changed. Or have publish re-read
the comment after writing and post again if it was overwritten.

## Rejected claims

Each of these was raised by a reviewer and then refuted by the skeptics.

- **preflight** — loadedSkills only matches when 'skill' is the first key of the
  Skill input (`packages/preflight/src/gate.mjs`)
- **secure** — Config scan misses .cjs, .cts and .mts config files
  (`packages/secure/sh/config.sh`)
- **terse** — One bad bans, todoPrefix or governed value silently turns off the
  gate (`packages/terse/src/scanner.mjs`)
- **wt** — Deleting a worktree whose folder is gone leaks its Supabase stack,
  and the slot is reused (`packages/wt/src/remove.mjs`)
- **skills-sync** — Reviewer sentinel wait (up to 180s) is longer than the Bash
  tool's default 120s timeout
  (`packages/skills/templates/code-review/review.workflow.js`)
- **skills-review** — The Bash tool's default 120s timeout kills the 180s
  reviewer sentinel wait early
  (`packages/skills/templates/code-review/review.workflow.js`)
- **skills-pr** — Relative --scratch and --result paths resolve against the repo
  root, not the working directory (`packages/skills/src/pr/prepass.mjs`)
- **skills-pr** — An empty localCi list lets a no-surface checklist go green
  with nothing ticked (`packages/skills/src/pr/config.mjs`)
