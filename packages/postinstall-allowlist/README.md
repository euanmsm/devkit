# @euanmsm/postinstall-allowlist

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
npm i -D @euanmsm/postinstall-allowlist
```

Block scripts in `.npmrc`:

```
ignore-scripts=true
```

Then run the allowlist after each install:

```json
{ "scripts": { "postinstall": "devkit-postinstall-allowlist" } }
```

A root `postinstall` in your own `package.json` still runs — `ignore-scripts`
governs your dependencies, not you.

## Configuring

```sh
cp node_modules/@euanmsm/postinstall-allowlist/postinstall-allowlist.example.json \
   .devkit/postinstall-allowlist.json
```

```json
{
	"allowed": [
		{ "pkg": "sharp", "script": "install", "reason": "Downloads prebuilt libvips binary" }
	]
}
```

`reason` is required by convention rather than by code: an entry nobody can
explain is a hole nobody can review. Add `"timeout"` in milliseconds to override
the five-minute default for a slow native build.

With no config file it runs nothing and says so. An allowlisted package that
is not installed is skipped silently; one whose script fails is reported, and
the command exits non-zero.
