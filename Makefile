# Frontend inputs: anything the Vite build reads. Server-only edits also trigger a
# rebuild, which costs a few seconds and avoids missing a dependency.
# Test files are excluded so editing a test does not rebuild the SPA.
SPA_SOURCES := $(shell find src -type f ! -name '*.test.*' 2>/dev/null) index.html vite.config.ts tsconfig.json package.json package-lock.json

server: dist/index.html
	npm run dev:server

# Rebuilds only when a frontend input is newer than dist/index.html.
# A failed build stops `make server`, so a stale bundle is never served silently.
dist/index.html: $(SPA_SOURCES)
	npm run build

sync:
	npm run sync

build:
	npm run build

clean:
	rm -rf node_modules dist data
