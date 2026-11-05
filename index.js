/**
 * On-demand Unity MCP bridge.
 *
 * The `mcp-unity` row in this bundle's patch ships with `disabled: true`, so a
 * fresh session carries none of the ~49 `mcp__unity__*` tool schemas. This
 * plugin contributes one cheap tool that mounts or unmounts that row through
 * the profile's Plugin Manager, so the Unity toolset is loaded only when the
 * user asked for Unity work or the model decides it needs it.
 */

const MODULE_NAME = '@deepseek-ai/dsh-mcp-client'
const PATCH_ID = 'mcp-unity'
const ENDPOINT = 'http://127.0.0.1:8080/mcp'
const TOOL_PREFIX = 'mcp__unity__'
const PROBE_TIMEOUT_MS = 4000

export const inject = ['tools']

const DESCRIPTION = [
  'Loads or unloads the Unity editor bridge (`mcp__unity__*` tools).',
  '',
  'The Unity toolset is NOT loaded by default, because its ~49 tool schemas would be sent with every request.',
  "Call this with action 'on' before any Unity editor work (scene/GameObject edits, console reads, asset or prefab operations), and with action 'off' when that work is finished so the context is freed again.",
  "The Unity MCP server only exists while the Unity editor is open with Start pressed in Window > MCP for Unity; 'on' probes that endpoint first and explains what the user has to do when it is not reachable.",
].join('\n')

const PARAMETERS = {
  type: 'object',
  properties: {
    action: {
      type: 'string',
      enum: ['on', 'off', 'status'],
      description:
        "on: mount the Unity toolset and connect. off: unmount it. status: report the current state without changing anything.",
    },
  },
  required: ['action'],
  additionalProperties: false,
}

const OUTPUT = {
  schema: {
    type: 'object',
    properties: {
      ok: { type: 'boolean', description: 'Whether the requested action succeeded.' },
      message: { type: 'string', description: 'One-line human/model-readable outcome.' },
    },
    additionalProperties: true,
  },
  render(_args, value) {
    const message = value?.message
    if (typeof message === 'string') {
      const rest = { ...value }
      delete rest.message
      const extra = Object.keys(rest).length > 0 ? `\n\n${JSON.stringify(rest, null, 2)}` : ''
      return [{ type: 'text', text: `${message}${extra}` }]
    }
    return [{ type: 'text', text: JSON.stringify(value, null, 2) }]
  },
}

function unityToolCount(ctx) {
  return ctx.tools.definitions().filter(definition => definition.name.startsWith(TOOL_PREFIX)).length
}

async function probeEndpoint() {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS)
  try {
    const response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2025-06-18',
          capabilities: {},
          clientInfo: { name: 'dsh-unity-bridge', version: '1.1.0' },
        },
      }),
      signal: controller.signal,
    })
    if (!response.ok) return { reachable: false, detail: `HTTP ${response.status}` }
    const body = await response.text()
    const server = /"serverInfo":\{[^}]*"name":"([^"]+)"/.exec(body)
    return { reachable: true, detail: server ? server[1] : 'responded' }
  } catch (error) {
    const reason =
      error?.name === 'AbortError' ? `timed out after ${PROBE_TIMEOUT_MS} ms` : String(error?.message ?? error)
    return { reachable: false, detail: reason }
  } finally {
    clearTimeout(timer)
  }
}

async function resolveRow(ctx) {
  const manager = ctx.get('pluginManager')
  if (!manager) {
    return { message: 'The pluginManager service is not mounted in this profile, so the Unity bridge cannot be toggled.' }
  }
  const plugins = await manager.listPlugins()
  const row =
    plugins.find(plugin => plugin.moduleName === MODULE_NAME && plugin.patchId === PATCH_ID) ??
    plugins.find(plugin => plugin.moduleName === MODULE_NAME)
  if (!row) {
    return { message: `No ${MODULE_NAME} row (patch id ${PATCH_ID}) exists in this profile composition.` }
  }
  return { manager, row }
}

function startedHint() {
  return `Unity's MCP server is not reachable at ${ENDPOINT}. In the Unity editor open Window > MCP for Unity and press Start (turning on its auto-start avoids repeating this), then run unity_bridge with action 'on' again.`
}

export function apply(ctx) {
  ctx.effect(() =>
    ctx.tools.register({
      name: 'unity_bridge',
      description: DESCRIPTION,
      parameters: PARAMETERS,
      output: OUTPUT,
      async execute(args) {
        const action = args?.action

        if (action === 'status') {
          const resolved = await resolveRow(ctx)
          if (resolved.message) return { ok: false, message: resolved.message }
          const probe = await probeEndpoint()
          return {
            ok: true,
            message: resolved.row.enabled
              ? `Unity toolset loaded: ${unityToolCount(ctx)} mcp__unity__* tools available.`
              : 'Unity toolset not loaded.',
            loaded: resolved.row.enabled,
            fiberPhase: resolved.row.fiberPhase ?? null,
            unityTools: unityToolCount(ctx),
            endpoint: ENDPOINT,
            serverReachable: probe.reachable,
            serverDetail: probe.detail,
          }
        }

        if (action === 'off') {
          const resolved = await resolveRow(ctx)
          if (resolved.message) return { ok: false, message: resolved.message }
          if (!resolved.row.enabled) {
            return { ok: true, message: 'Unity toolset is already unloaded.', unityTools: unityToolCount(ctx) }
          }
          const result = await resolved.manager.setPluginEnabled(resolved.row.entryId, false)
          if (result.application !== 'applied') {
            return {
              ok: false,
              message: `Could not unload the Unity toolset: ${result.application}${result.error ? ` (${result.error.code})` : ''}.`,
              application: result.application,
            }
          }
          return {
            ok: true,
            message: `Unity toolset unloaded. ${unityToolCount(ctx)} unity tools visible; their schemas no longer enter requests.`,
            unityTools: unityToolCount(ctx),
          }
        }

        if (action !== 'on') {
          return { ok: false, message: "Unknown action; use 'on', 'off' or 'status'." }
        }

        const resolved = await resolveRow(ctx)
        if (resolved.message) return { ok: false, message: resolved.message }

        const probe = await probeEndpoint()
        if (!probe.reachable) return { ok: false, message: startedHint(), serverReachable: false }

        if (resolved.row.enabled && unityToolCount(ctx) > 0) {
          return {
            ok: true,
            message: `Unity toolset already loaded: ${unityToolCount(ctx)} mcp__unity__* tools available (server ${probe.detail}).`,
            unityTools: unityToolCount(ctx),
          }
        }

        // A mounted row can hold no tools, for example after its reconnect
        // budget ran out while the editor was closed. Remount it so activation
        // performs a fresh connection and discovery instead of dead-ending.
        if (resolved.row.enabled) {
          await resolved.manager.setPluginEnabled(resolved.row.entryId, false)
        }

        const result = await resolved.manager.setPluginEnabled(resolved.row.entryId, true)
        if (result.application !== 'applied') {
          const detail = result.error
            ? ` ${result.error.code}${result.error.diagnostic ? `: ${result.error.diagnostic}` : ''}`
            : ''
          return {
            ok: false,
            message: `Could not load the Unity toolset: ${result.application}.${detail}${
              result.application === 'failed' ? ` ${startedHint()}` : ''
            }`,
            application: result.application,
          }
        }

        const count = unityToolCount(ctx)
        if (count === 0) {
          return {
            ok: false,
            message: `The Unity bridge row reported applied but registered no tools; the server at ${ENDPOINT} answered as ${probe.detail} but tool discovery produced nothing. Run action 'status' to inspect.`,
            unityTools: 0,
          }
        }
        return {
          ok: true,
          message: `Unity toolset loaded: ${count} mcp__unity__* tools available (server ${probe.detail}). Call unity_bridge with action 'off' when the Unity work is done.`,
          unityTools: count,
        }
      },
    }),
  )
}