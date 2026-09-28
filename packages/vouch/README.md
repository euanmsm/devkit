# @euanmsm/vouch

Lets a named handful of packages run their install scripts while every other
package is blocked from running anything at all.

A dependency's `postinstall` script runs arbitrary code on your machine, with
your permissions, the moment you type `npm install` — and you almost never read
it. That is the route most npm supply-chain attacks take. Setting
`ignore-scripts=true` closes it, but also breaks the few packages that genuinely
need a script: `sharp` downloading a native binary, `esbuild` fetching a
platform build.

This runs those few, by name, and nothing else.

## Installing

```sh
npm i -D @euanmsm/vouch
```

Block scripts in `.npmrc`:

```
ignore-scripts=true
```

Then run the allowlist after each install, as its own step:

```json
{ "scripts": { "setup": "npm install && vouch" } }
```

```sh
npm run setup           # locally
npm ci && npx vouch     # in CI and Docker builds
```

Do not hook it to your own `postinstall`. `ignore-scripts` also skips your root
package's lifecycle scripts (`preinstall`, `postinstall`, `prepare`, and the
`pre`/`post` hooks of any script), so `npm install` would finish without running
vouch and without saying so. A script you name directly, like `npm run setup`,
still runs.

## Configuring

```sh
cp node_modules/@euanmsm/vouch/vouch.example.json \
   .devkit/vouch.json
```

```json
{
  "allowed": [
    {
      "pkg": "sharp",
      "script": "install",
      "reason": "Downloads prebuilt libvips binary"
    }
  ]
}
```

`reason` is required by convention rather than by code: an entry nobody can
explain is a hole nobody can review. Add `"timeout"` in milliseconds to override
the five-minute default for a slow native build.

The config is read from the git root, or, when there is no `.git` as in a Docker
build, from the nearest directory above the cwd that has one. Each package is
looked for in `node_modules` from the cwd up to the git root, as Node resolves
modules, so an app below the git root or a workspace member with hoisted
dependencies finds its packages. Its script runs from the directory where it was
found.

With no config file it runs nothing and says so. An allowlisted package that is
not installed is skipped with a line saying where it looked; one whose script
fails is reported, and the command exits non-zero.
