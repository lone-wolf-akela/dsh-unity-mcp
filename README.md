# dsh-unity-mcp

[![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

A [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (DSH) bundle that connects your Unity editor to the agent **on demand**.

DSH already ships an MCP client, so the Unity MCP server can be mounted like any other. Mounting it eagerly is the problem: the Unity server publishes ~49 tools, and their schemas ride along in every single request whether or not you are doing Unity work. This bundle ships that client row **disabled** and adds one cheap tool, `unity_bridge`, that mounts or unmounts it when you actually need it.

## Why it is not mounted at startup

Measured on a desktop profile against MCP for Unity 10.3.0:

| | |
|---|---|
| Unity tools | 49 |
| their tool-schema text | ~99 KB (roughly 25k tokens) |
| share of all tool declarations | 71 % |

There is a second reason. The Unity-side server only exists while the editor is open with **Start** pressed in `Window > MCP for Unity`, so an eager row fails or retries at every boot where DSH happens to start first.

## Behaviour

| State | What happens |
|---|---|
| default (off) | the `mcp-unity` row is disabled: no connection, no retries, no Unity tool schemas |
| `on` | probes the endpoint, then mounts the row through Plugin Manager; 49 `mcp__unity__*` tools become available |
| `off` | unmounts the row; the schemas leave subsequent requests |

The mount is a normal Plugin Manager entry toggle, so it is visible in the **Plugins** page, it persists in the profile, and it can be reverted there by hand.

`on` probes `POST http://127.0.0.1:8080/mcp` with a JSON-RPC `initialize` first. If the editor's server is not listening it returns instructions instead of enabling a row that cannot connect. If the row is mounted but holds no tools (for example its reconnect budget ran out while Unity was closed), `on` remounts it to force a fresh discovery.

## Install

From a DSH session, ask the agent to install the bundle, or use the plugin manager with this directory as the target:

```text
plugin_manager install_bundle  /path/to/dsh-unity-mcp
```

The bundle is configuration plus one Host plugin, with no install scripts and no dependencies of its own.

## Tool

`unity_bridge` with `action`:

- `on` — mount the Unity toolset and connect.
- `off` — unmount it and free the context.
- `status` — report `loaded`, `fiberPhase`, `unityTools`, and whether the endpoint answers.

## Configuration

`cordis.patch.yml`:

```yaml
- insert:
    - id: mcp-unity
      name: '@deepseek-ai/dsh-mcp-client'
      disabled: true
      config:
        serverName: unity
        transport: streamable-http
        url: http://127.0.0.1:8080/mcp
        failOnStartupError: false
        reconnect:
          initialDelayMs: 500
          maxDelayMs: 30000
          maxAttempts: 240

    - id: unity-bridge-control
      name: '@local/dsh-unity-mcp'
      config: {}
```

Change `url` if your editor serves MCP elsewhere (the MCP for Unity window shows the address). `serverName: unity` fixes the tool prefix: `mcp__unity__<tool>`.

## Requirements

- DSH desktop profile with `@deepseek-ai/dsh-mcp-client`, `@deepseek-ai/dsh-plugin-manager` and HMR available (the standard desktop profile has all three).
- [MCP for Unity](https://github.com/CoplayDev/unity-mcp) in the Unity project (tested with 10.3.0, server `mcp-for-unity-server` 3.4.11, Streamable HTTP, protocol `2025-06-18`).
- The editor's local server started: `Window > MCP for Unity` → **Start**. Turning on its auto-start setting avoids doing that every session.

## Limitations

- The Unity server must be running when `unity_bridge` is called with `on`; the tool reports what to do when it is not.
- One server name per profile: the row is discovered by module name plus patch id `mcp-unity`.
- Tool names are fixed by the MCP client (`mcp__unity__*`); `manage_tools` inside Unity still controls which Unity tool groups are published.

## License

MIT — see [LICENSE](LICENSE).
