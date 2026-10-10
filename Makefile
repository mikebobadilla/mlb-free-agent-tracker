GOOS = $(shell go env GOOS)
GOARCH = $(shell go env GOARCH)

.PHONY: run server sync build clean

server:
	go run ./cmd/server

sync:
	go run ./cmd/sync

build:
	go build -o bin/tracker-$(GOOS)-$(GOARCH) ./cmd/server

clean:
	rm -rf bin/ data/tracker.db
