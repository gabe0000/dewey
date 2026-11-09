# Dewey: an offline shelf

A small working prototype for offline reading and search. Three original CC0 demonstration texts are included; separate commands can import the King James Version and Bible in Basic English. The running app uses no AI, downloads, telemetry, accounts, external scripts, fonts, or npm dependencies. General text search is case-insensitive, literal, all-words full-text matching across title, shelf and source text. Bible search matches words within a verse or looks up a book/chapter/verse reference. Neither search is semantic.

## Try locally (Node 22 or newer)

From this project directory:

```sh
DEWEY_SETUP=1 npm start
```

Open http://127.0.0.1:8080 and click **Install starter collection**. The setup panel shows source and index locations. Stop with Ctrl-C, then run `npm start` for normal read-only application behavior. The default server listens only on loopback. No production service is installed.

To choose different storage, set `DEWEY_LIBRARY_ROOT=/absolute/path/to/library` and `DEWEY_INDEX=/absolute/path/to/local-index` before starting either mode. Do not point setup at an existing nonempty collection: it refuses to overwrite. Do not use symlink source roots, manifests, or source files. Local directories and bind mounts are supported.

## Storage: three things, three lifecycles

1. **Application:** this code, or the Docker image `dewey:local`. Replaceable software. It contains the tiny bundled installer, but it is not the installed library.
2. **Library root:** `../dewey-library/` by default. This is the portable, authoritative unit: original text files plus `manifest.json`, which records titles, shelves, provenance, license identifiers and SHA-256 fingerprints. Back up this entire directory together. No absolute machine paths are stored in the manifest. No other app shares its database or directory.
3. **Index:** `../dewey-cache/` by default. Disposable local JSON cache, rebuilt from verified sources on every start. It can be omitted during migration. Keep it on the computer running Dewey, not a NAS. The prototype loads these few texts into memory for searching; it is not sized for large collections.

The default library and cache are siblings of the application checkout, never inside it. You can move or replace the application directory without moving either. For a durable installation, choose a dedicated library root outside the checkout (for example `/srv/dewey/library`) and a separate local index directory (for example `/var/lib/dewey-index`). These are examples, not directories this prototype creates. A future NAS mount can be the library root; configuring that mount is separate work.

A **bind mount** exposes a specific host directory to a container. In `compose.yaml`, `../dewey-library:/sources:ro` means “show these host files at /sources inside the container, read-only.” Changing or replacing the container does not remove the host files. `:rw` permits writes. Only setup gets source write access. The index always gets its own writable bind mount.

A **Docker named volume** is also persistent storage, but Docker chooses its host location. Bind mounts are used here so you can see, back up, exclude, and move Dewey's folders explicitly. Neither kind of volume is a backup, a physical disk, a RAID array, or a NAS storage pool. NAS snapshots and independent backup copies remain separate layers.

### Move just Dewey

Stop setup or the app first. Copy the entire library root to its new location, including the manifest and every original. Verify the copy with `node scripts/verify.mjs /path/to/copied/library`. Point the new runtime at that root and an empty local index directory; startup rebuilds the index. Compare source counts and search results. Keep the original until the copied library has been verified. Copy the app/image separately if the destination is offline.

### Move everything except Dewey

Exclude the single dedicated Dewey library root from that migration, and exclude the separate disposable index too. Leave the originals in place. The code/image is independently movable or replaceable. With the defaults, exclude the `dewey-library` and `dewey-cache` sibling directories specifically. Do not rely on excluding a Docker container: the persistent data lives outside it.

### Backups and interrupted setup

Back up the complete library root while setup/import is stopped. An index is not a substitute for originals. Checksums detect changed bytes relative to this manifest, not authenticity or trustworthiness: an attacker who changes both can defeat this check.

Setup writes files exclusively and writes the manifest last. An interruption can leave partial files but cannot overwrite an existing collection. If setup reports a nonempty incomplete folder, stop the app, preserve/rename that folder for inspection, and point setup at a new empty directory. Do not delete unknown files to “fix” setup. A missing manifest is treated as no installed collection; a malformed manifest, bad checksum, missing source or unavailable writable index prevents startup. Fix storage access or restore from your verified backup, then restart. Do not bypass checksum failures.

## Containers, offline operation and permissions

No container has been deployed by this project. Build only after the official `node:22-bookworm-slim` base is present locally:

```sh
# Create dedicated directories as your non-root local user.
mkdir -p ../dewey-library ../dewey-cache
export DEWEY_UID=$(id -u) DEWEY_GID=$(id -g)
docker build --pull=false --network=none -t dewey:local .
docker compose --profile setup up --no-build setup
# Open localhost:8080, install, then Ctrl-C and stop setup before normal mode.
docker compose up --no-build library
```

Compose publishes only `127.0.0.1:8080`. The internal Docker network has no external routing; the server binds all interfaces inside its container only to receive that loopback-published connection. The image runs as non-root; Compose drops capabilities, disallows privilege escalation, and uses a read-only root filesystem. Normal mode mounts originals read-only. It is intentionally not an Internet-facing server and has no authentication for remote use.

On Linux, bind-mount permissions must allow the selected container user to read sources and write the index (and sources during setup). The fallback is UID/GID 1000; the quickstart explicitly selects your current non-root user. Long-form bind mounts refuse to auto-create missing directories, avoiding accidental root ownership. For a dedicated non-root owner, set `DEWEY_UID` and `DEWEY_GID` to that owner's numeric IDs. Do not use root or world-writable directories as a shortcut. Permission/mount changes are not performed automatically. Docker Desktop handles host ownership differently; validate writes with the local setup profile.

Once the image exists, startup and use require no Internet. For another compatible machine:

```sh
docker save -o dewey-image.tar dewey:local
# Transfer image archive, Compose file, and library root separately.
docker load -i dewey-image.tar
docker compose up --no-build library
```

An exported image is specific to its CPU architecture. For a different architecture, prepare a compatible image while online; do not assume an ARM image works on x86. Keep the image archive separate from the library backup. Never include real library data in a source-code archive or repository. Live library/cache directories are outside the checkout by default; `.gitignore` also excludes sample scratch data; `.dockerignore` excludes all data from image builds. No prune/remove commands are needed for recovery.

## Verification

```sh
npm test
npm run verify -- /path/to/library
```

Tests cover install refusal on repeated/partial setup, copying/rebuilding, full-text and shelf filtering, checksum failure, path traversal, symlink roots/manifests/files, local-host restrictions, setup token/origin restrictions, normal-mode writes, source endpoint integrity, and text-only DOM rendering checks. The default test suite uses temporary fixture directories and cleans only its own fixtures. UI rendering and actual container permissions should also be checked in the deployment environment.

## Boundaries

No PDF extraction, arbitrary imports, background fetches, external download proxy, OCR, embeddings, user notes, or network sharing yet. Additional imports are limited to the two Bible formats described below. The local HTTP API trusts the person who can open this computer's localhost. Source directories must be controlled by that person; defenses do not make hostile concurrent filesystem mutation safe. Catalog metadata/search reflects the startup snapshot; restart after deliberate source updates. Source and Bible chapter viewing recheck checksums at each read. Search results and source text are rendered as text, never interpreted as HTML.

Software: MIT (`LICENSE`). Starter texts: CC0-1.0 (`starter/LICENSE.txt`). The samples are illustrative and are not health, safety, or other professional advice.

## Public code and private collections

This repository contains the application, tests, and the three original CC0
starter texts. Keep installed collections, indexes, backups, credentials, and
machine-specific configuration outside the checkout. Use environment variables
for your own storage paths; examples in this README are generic.

Git and Docker ignore rules exclude common runtime directories, secrets,
databases, and exports. These rules are a guard against mistakes, not a secret
scanner: review the staged files with `git diff --cached` before each public
commit. Do not add private documents to `starter/`; that directory is published
with the code. Use a GitHub-provided noreply email for commits if you want to
keep your personal email out of public history.

## Bible collections

Download the UTF-8 plain text of [Project Gutenberg eBook #10](https://www.gutenberg.org/ebooks/10) outside the checkout. Then stop the preview and import it into your existing verified library:

```sh
npm run import:kjv -- /absolute/path/to/downloaded-bible.txt /absolute/path/to/library
```

The importer validates 66 books and 31,102 sequentially numbered verses, copies
the entire original file without changing its bytes, preserves a copy of the
previous manifest, and updates the manifest last. It refuses an existing KJV,
symbolic inputs, or an invalid download. A failed write may leave a new source
or manifest backup for inspection; it never overwrites existing originals.
The bundled samples remain installed. Restart the preview to rebuild its local
index and open **King James Version** on the **Bibles** shelf.

Choose a book/chapter, or search for `John 3:16`, `Psalm 23`, a verse range such
as `1 Corinthians 13:4-7`, or words to find within the same verse. Search shows
at most 100 matching verses and reports the total. The source record opens the
unaltered original, including its Gutenberg license. Scripture display joins
wrapped lines; it does not modify the stored original. The imported text and
derived index remain outside the code repository. The complete Bible is not
bundled with this software; tests use synthetic text.

For simpler language, [Bible in Basic English at eBible.org](https://www.ebible.org/find/details.php?id=engBBE)
is listed by its publisher as public domain in the United States. Download its
**BibleWorks import (VPL) + SQL** ZIP outside the checkout and extract the
`engBBE_vpl.txt` member. Keep the ZIP as well, since it contains publisher rights
information. Then stop the preview and run:

```sh
npm run import:bible -- bbe /absolute/path/to/engBBE_vpl.txt /absolute/path/to/library /absolute/path/to/engBBE_vpl.zip
```

BBE import validates its 66 books and 31,102 numbered verses and preserves both
the extracted original text and original ZIP, with checksums in the manifest.
KJV and BBE can be installed together and remain separate catalog entries.
Select a translation, then use the same book/chapter and verse search controls.
The Bible texts, ZIPs, and private collection manifests are never included in
this code repository. Tests contain synthetic text only.

Other translations need their own supported import format and an authorized
source. Dewey has no online Bible API or background download feature. This
prototype holds its parsed collection in memory; large collections and
additional translation formats are separate work.

## Reliable preview of an existing library

A browser tab is only the viewer; its local Node server must remain running.
An assistant-managed temporary process can end independently of the tab. For
continued use, start the preview yourself in a terminal and keep that terminal
open. Moving the app does not move its library. The preview command therefore
requires explicit absolute paths and refuses to silently select empty sibling
folders or install a new collection:

```sh
cd /path/to/Dewey
DEWEY_LIBRARY_ROOT=/absolute/path/to/existing-library \
DEWEY_INDEX=/absolute/path/to/separate-cache npm run preview
```

Use your existing library/cache locations, not the example paths. Open
http://127.0.0.1:8080 after the terminal prints the preview URL. Ctrl-C stops
only this preview. If the browser says the server is not running, restart this
same command and reload. If the page remains open, pressing Enter in the search
box retries the preserved query. No service, login item, or auto-start system is
installed. The preview stays loopback-only with setup disabled.
