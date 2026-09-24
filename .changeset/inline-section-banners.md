---
'@euanmsm/terse': minor
---

Add a `sectionBanners` setting, so a repository can welcome inline banners
instead of only permitting them past a line count. Set it to `always` and a
banner is never a finding, and the generated contract gains a section on what a
banner should separate. `off` bans them outright; the default `large-files`
keeps today's `bannerMinCode` threshold.
