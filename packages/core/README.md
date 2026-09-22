# @euanmsm/devkit-core

Config loading shared by the devkit tools. Installed as a dependency of the
others — there is no reason to install it directly.

Every devkit tool runs from inside `node_modules`, so it cannot work out which
repository it is being run against from its own location. This does that:
`repoRoot()` walks up from the working directory to the nearest `.git`, and
`loadConfig()` reads a named JSON file out of that root's `.devkit/` directory.

`compile()` turns a config file's regex strings into matchers, dropping any that
will not compile with a warning rather than crashing the tool — a typo in one
pattern should not stop the other twenty working.
