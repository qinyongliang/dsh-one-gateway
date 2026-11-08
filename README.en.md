# One Gateway

Expose every model connected to DeepSeek Harness behind **one** standard OpenAI-compatible endpoint.

One port, one set of keys, all models. Any OpenAI-compatible client (OpenAI SDK, LangChain, Cherry Studio, NextChat, LobeChat, One API, ...) points its `base_url` at the gateway and starts calling.

## Features

| | |
|---|---|
| 🔌 OpenAI API | `GET /v1/models` · `POST /v1/chat/completions` · `POST /v1/responses` |
| 📦 Model groups | Name a set of models; try them sequentially / balanced / random; the first that answers wins; automatic failover before the first byte |
| ✏️ Aliases | Short public names for models; auto-derived from the first word of the display name (lowercased); collisions become groups; multiple aliases per model |
| 📌 Session stickiness | One conversation pins to one candidate, preserving upstream prompt caches |
| 📊 Usage charts | Heatmap, trend, hourly bars; filter by **key / provider / model**; 90-day persisted stats |
| 🔑 API keys | SHA-256 at rest, plaintext shown once; deleting the last key keeps the endpoint locked |
| 🌐 LAN access | Standalone listener on all interfaces (default port `3090`, editable in the page); the DSH UI itself stays private |
| 🎛 Sidebar page | Overview / Models / Groups / Keys tabs; add aliases and group membership right on a model row |

## Install

```sh
dsh plugin --profile web add github:gdrpzym/dsh-one-gateway
```

Or from a local directory:

```sh
dsh plugin --profile web add /absolute/path/dsh-one-gateway
```

Then open the **One Gateway** page in the sidebar.

> ⚠️ The standalone port is open to the whole network by default. **Create an API key on the Keys tab** before letting other devices in.

## Usage

```python
from openai import OpenAI

client = OpenAI(
    base_url="http://<host-ip>:3090/v1",
    api_key="sk-dshgw-...",
)

resp = client.chat.completions.create(
    model="qoduck",          # alias / group name / provider_model all work
    messages=[{"role": "user", "content": "Hello"}],
)
```

- `/v1/models` lists **aliases and groups** by default; canonical `provider_model` ids remain callable, `?all=1` shows everything.
- Session stickiness: send `x-session-affinity: <conversation-id>`, or let the gateway fingerprint the conversation prefix.
- Response headers `x-relay-group` / `x-relay-model` name the candidate that actually served.
- `/v1/responses` accepts string / message / tool-call history input and streams standard Responses events.

## Groups and aliases

- A **group** is a candidate list plus a strategy (sequential / balanced / random) and a per-leg 429 retry budget. A candidate that fails before its first output token is skipped for the next; after output starts there is no switching.
- **Auto aliases**: first whitespace token of the display name, lowercased; a token claimed by several models becomes a group instead. Add more aliases manually on any model row.
- Balanced/random strategies trade prompt-cache locality for load spreading; sequential + stickiness is the cache-friendly combination.

## Statistics

The overview tab carries heatmap / trend / hourly charts plus calls, answered, refused and token totals, filterable by **key / provider / model** with per-request rows. Filter options merge live data with history, so they are populated after a restart. Only counts and token numbers are recorded — **never request or response bodies**.

## Configuration

Override by id in the profile's `cordis.patch.yml`:

```yaml
- id: dsh-one-gateway
  config:
    path: /v1          # mount point
    lanPort: 3090      # standalone port; false disables; 0 = random
    lanHost: 0.0.0.0   # bind address
    apiKeys: []        # fixed keys (enforced alongside page-created keys)
    providers: []      # expose only these providers; empty = all
    autoAlias: true    # derive default aliases at startup
```

The port is also editable in the page and applies immediately.

## Security

- The standalone port serves only the gateway's own `/v1` routes; the DSH UI, sessions and other routes are never exposed.
- Keys are stored as SHA-256 hashes; management is reachable only from a signed-in DSH page, never through `/v1`.
- Upstream credentials are resolved by each provider adapter inside Harness; the gateway never holds or forwards them.

## Development

```sh
npm run check   # syntax checks
npm test        # smoke suite (fake llm service, no external requests)
```

## License

[Apache-2.0](LICENSE)
