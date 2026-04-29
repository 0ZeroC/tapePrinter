# Open API（局域网只读）

本系统提供给 OpenClaw/Qclaw/Accio Work 等智能体框架使用的只读接口，统一前缀为：

- `/api/open/v1/*`

## 鉴权

- Header：`Authorization: Bearer <OPEN_API_TOKEN>`
- 也支持：`x-open-api-token: <OPEN_API_TOKEN>`
- 默认只允许 `GET`，其他方法返回 `405`

## 关键策略

- `OPEN_API_ENABLED`：是否启用开放接口（`1` 启用，`0` 禁用）
- `OPEN_API_ALLOWED_IPS`：可选 IP 白名单，逗号分隔
- `OPEN_API_SCOPE`：默认 `read:all`
- 限流：默认每 IP 每分钟最多 180 次请求
- 分页：`page` + `pageSize`，`pageSize` 上限 200

## 接口列表

- `GET /api/open/v1/health`
- `GET /api/open/v1/products?q=&page=&pageSize=`
- `GET /api/open/v1/products/:id`
- `GET /api/open/v1/products/code/:code`
- `GET /api/open/v1/inventory?page=&pageSize=`
- `GET /api/open/v1/inventory/logs?productId=&type=in|out&page=&pageSize=`
- `GET /api/open/v1/picking-orders?orderNo=&page=&pageSize=`
- `GET /api/open/v1/openapi.json`

## 响应格式

成功：

```json
{ "success": true, "data": {} }
```

失败：

```json
{ "success": false, "error": "错误原因" }
```

## 调用示例

```bash
curl -H "Authorization: Bearer <token>" \
  "http://<server-ip>:3456/api/open/v1/products?page=1&pageSize=20"
```

## 审计日志

每次开放接口访问都会写入审计日志（方法、路径、IP、状态码、耗时）。管理员可通过以下接口查看：

- `GET /api/auth/open-api-audit-logs?limit=200`

