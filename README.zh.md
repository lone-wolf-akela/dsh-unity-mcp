# dsh-unity-mcp

[![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

一个 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（DSH）bundle：**按需**把 Unity 编辑器接给智能体。

DSH 自带 MCP 客户端，把 Unity 的 MCP 服务挂上去并不难。问题在"一直挂着"：Unity 服务端会发布约 49 个工具，这些工具的 schema 会进入每一次请求，哪怕你这次根本不碰 Unity。本 bundle 把那一行声明成**默认禁用**，另加一个很便宜的工具 `unity_bridge`，需要时才挂载、用完就卸载。

## 为什么不在启动时就挂载

在 desktop profile + MCP for Unity 10.3.0 上实测：

| | |
|---|---|
| Unity 工具数量 | 49 |
| 工具 schema 文本 | 约 99 KB（粗估 2.5 万 token） |
| 占全部工具声明的比例 | 71 % |

还有第二个原因：Unity 侧的服务器只在编辑器打开、并在 `Window > MCP for Unity` 里按了 **Start** 时才存在。启动即连接意味着"DSH 先开"的每一次都会失败或空转重试。

## 行为

| 状态 | 效果 |
|---|---|
| 默认（关闭） | `mcp-unity` 行处于 disabled：不连接、不重试、不占上下文 |
| `on` | 先探测端点，再通过 Plugin Manager 挂载该行；49 个 `mcp__unity__*` 工具可用 |
| `off` | 卸载该行；schema 从后续请求中消失 |

挂载走的是 Plugin Manager 的常规开关，所以在 **Plugins** 页面里看得见、状态随 profile 持久化，也可以手动改回来。

`on` 会先向 `http://127.0.0.1:8080/mcp` 发一个 JSON-RPC `initialize` 探测。编辑器服务没开时，它给出该怎么做，而不是把配置改成启用状态留个连不上的坑。如果那一行是挂着的但没有工具（比如 Unity 关太久、重连预算耗尽），`on` 会先卸再挂，强制重新发现。

## 安装

在 DSH 会话里让智能体安装，或用 plugin manager 指向本目录：

```text
plugin_manager install_bundle  /path/to/dsh-unity-mcp
```

本 bundle 是"配置 + 一个 Host 插件"，没有安装脚本，也没有自己的依赖。

## 工具

`unity_bridge`，`action` 取值：

- `on` — 挂载 Unity 工具集并连接。
- `off` — 卸载并释放上下文。
- `status` — 报告 `loaded`、`fiberPhase`、`unityTools`，以及端点是否可达。

## 配置

见 `cordis.patch.yml`。`url` 按你的编辑器实际地址改（MCP for Unity 窗口里会显示），`serverName: unity` 决定工具前缀 `mcp__unity__<tool>`。

## 依赖

- 具备 `@deepseek-ai/dsh-mcp-client`、`@deepseek-ai/dsh-plugin-manager` 与 HMR 的 DSH desktop profile（标准 desktop profile 三者都有）。
- Unity 工程中的 [MCP for Unity](https://github.com/CoplayDev/unity-mcp)（在 10.3.0 / 服务端 `mcp-for-unity-server` 3.4.11 / Streamable HTTP / 协议 `2025-06-18` 上验证）。
- 编辑器里的本地服务已启动：`Window > MCP for Unity` → **Start**。打开它的自动启动可免去每个会话手动点。

## 限制

- 调 `on` 时 Unity 服务必须在跑；不在跑时工具会说明怎么办。
- 一个 profile 内一个 server name：那一行按模块名 + patch id `mcp-unity` 定位。
- 工具名由 MCP 客户端固定为 `mcp__unity__*`；用 Unity 的 `manage_tools` 仍可控制发布哪些工具组。

## 许可证

MIT — 见 [LICENSE](LICENSE)。
