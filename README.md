# MLB Free Agent Tracker

A Go + SQLite web app for tracking MLB free agents throughout the offseason.

> **LLM Test Project**: This project is being developed as a test bed for the LongCat 2.5 model (model ID: `longcat-2.5-preview-free`, provider: `opencode`). The entire codebase — from initial scaffolding to templates to documentation — is being generated and iterated on by an LLM agent. This is very much an experiment in AI-assisted development, so expect rough edges, mistakes, and things that would normally be done differently in a human-led project.

## Quick Start

```bash
# Install dependencies
go mod tidy

# Run the web server (starts on :8080)
make server

# Or manually trigger a data sync
make sync
```

Then open http://localhost:8080

## Project Structure

```
mlb-tracker/
├── cmd/
│   ├── server/main.go         # Web server entry point
│   └── sync/main.go            # Manual sync CLI
├── config/
│   └── players.yaml           # Your curated player list
├── internal/
│   ├── db/                    # SQLite connection + schema
│   ├── models/                # Data structs
│   ├── jobs/                  # Background sync workers
│   ├── handlers/              # HTTP handlers
│   └── store/                 # SQL queries
├── web/
│   ├── templates/             # HTML templates
│   └── static/                # CSS
└── data/
    └── tracker.db             # SQLite database (auto-created)
```

## How It Works

1. **Curate**: Add players to `config/players.yaml` with their MLB ID
2. **Sync**: Background jobs fetch stats from the MLB Stats API every 6 hours
3. **View**: Web dashboard shows all tracked players, their status, and details

## Configuration

Edit `config/players.yaml` to add/remove players:

```yaml
players:
  - name: Juan Soto
    position: OF
    mlb_id: 665742        # Find on baseball-reference.com or mlb.com
    prev_team: Yankees
```

## API

- `GET /` - HTML dashboard
- `GET /players/{id}` - Player detail page
- `GET /api/players` - JSON list of all players

## Deployment

Build a single binary:

```bash
make build
```

Deploy to any host that supports Go binaries (Fly.io, Railway, a VPS, etc.).
The only file you need besides the binary is `config/players.yaml`.
