# Review page: file tree

The page reads in a good order but shows files as bare path strings, so the
reader loses track of where each one lives. The tree sits beside the review
order as a second view; it does not replace it.

## Ideas

1. **Tree tab in the sidebar.** "Review order" and "Files" tabs. Files shows the
   changed files in their folders, single-child folder chains merged into one
   row, each file marked added, modified, renamed or deleted, with +/− and a
   read tick. Folders show "read of total". It follows the focused card, and
   clicking a file jumps to it.
2. **Moves and deletions in place.** A moved file shows at its new place plus a
   faded copy at its old place saying where it went. A deleted file stays,
   struck through, in its old folder. A folder that moved whole shows as one
   "folder moved" row. New folders are tagged.
3. **Whole repo, unchanged files greyed.** Build lists every tracked path with
   `git ls-tree`. Folders with changes open, the rest closed. Unchanged files
   open in the editor. Shows what did _not_ change around the edits.
4. **Breadcrumb paths on cards.** Each path part is clickable: reveal that
   folder in the tree, or filter the page to that folder's files.
5. **Change map in the overview.** A small tree shaded by how much changed
   where, so you see the branch's shape before reading.

## Open question

Previewing unchanged files inside the page. Either embed only the ones the notes
point to and their neighbours (page stays one file), or serve the checkout with
a small local server (`npx devkit review serve`) so any file opens. The server
also helps screenshots and "changed since read" checks.

## Status

1 to 3 are built in the prototype. The tree is rooted at the deepest folder
holding every change, not the whole repo, and an "Unchanged files" switch brings
back the changed-only view. 4, 5 and the preview question are open.
