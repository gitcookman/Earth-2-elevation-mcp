# Earth-2 Elevation MCP

本地 stdio MCP 服务，把 [Open-Elevation](https://www.open-elevation.com/) 的海拔查询接口包装成 MCP tools。

## Tools

- `get_elevation`: 查询单个经纬度的海拔，单位米。
- `get_elevations`: 批量查询多个经纬度。
- `get_elevation_profile`: 在两点之间均匀采样，生成路径海拔剖面。

## Run

```powershell
npm start
```

也可以直接运行：

```powershell
node .\src\index.js
```

## MCP 配置示例

把下面配置加到你的 MCP client 配置里，路径按本机实际目录调整：

```json
{
  "mcpServers": {
    "earth-2-elevation": {
      "command": "node",
      "args": [
        "D:\\coding\\AI-project\\ai-mcp-factory\\src\\index.js"
      ],
      "env": {
        "OPEN_ELEVATION_BASE_URL": "https://api.open-elevation.com"
      }
    }
  }
}
```

## Notes

Open-Elevation 的公开接口是 `POST /api/v1/lookup`，请求体格式如下：

```json
{
  "locations": [
    { "latitude": 41.161758, "longitude": -8.583933 }
  ]
}
```

响应会按请求顺序返回 `latitude`、`longitude`、`elevation`。如果没有记录到该坐标的海拔，服务会返回海平面 `0` 米。
