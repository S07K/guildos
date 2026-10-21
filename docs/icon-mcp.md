# Free icon library for the design canvas

GuildOS uses the [Lucide icon catalog](https://lucide.dev/icons/) under its [ISC license](https://lucide.dev/license). The catalog is bundled locally with `lucide-static`. Searching and rendering icons does not require an API key or an external network request.

## In the studio

Choose **Insert icon** in the canvas toolbar, search the library, and select a result. An icon is a normal editable layer: move and resize it, adjust its color and line weight in Properties, change the icon, or save it with the design. The icon name is validated against the same catalog used by agent proposals. Agent prompts receive a short list of matching names so generated UI can include editable icon layers.

## MCP access

Run the local stdio server with:

```sh
npm run mcp:icons
```

Configure an MCP client to launch `node` with the absolute path to `scripts/icon-mcp.ts`, using this repository as its working directory. For example:

```json
{
  "mcpServers": {
    "guildos-icons": {
      "command": "node",
      "args": ["/Users/shubham/personal/startups/guildos/scripts/icon-mcp.ts"],
      "cwd": "/Users/shubham/personal/startups/guildos"
    }
  }
}
```

The server offers two read-only tools:

- `search_icons`: search names in the free catalog and receive canonical icon names.
- `get_icon`: receive a validated SVG and component `type`, axis sizing, and `properties` (`iconName`, `color`, `borderWidth`) fields for an editable GuildOS icon layer.

The MCP tools return icon data; canvas edits still go through GuildOS's authenticated project workflow. The studio's own agents use the same catalog and validate icon names before committing proposals.

## Unsplash image search

The same local MCP server exposes `search_unsplash({query})`. Configure the server-only `UNSPLASH_ACCESS_KEY` in `.env.local`; never pass it to agents or browser code. Search returns vetted `images.unsplash.com` URLs with photographer and Unsplash attribution. The backend design-agent pipeline records image selection and renders attribution automatically. Image selections must use an exact returned URL, preserving its query parameters.
