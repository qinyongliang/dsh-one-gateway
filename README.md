# One Gateway

把 DeepSeek Harness 里已连接的全部模型，以**一个**标准 OpenAI 兼容接口对外提供。

一个端口，一套密钥，所有模型。任意 OpenAI 兼容客户端（OpenAI SDK、LangChain、Cherry Studio、NextChat、LobeChat、One API 等）把 `base_url` 指向网关即可调用。

## 功能

| | |
|---|---|
| 🔌 OpenAI 接口 | `GET /v1/models` · `POST /v1/chat/completions` · `POST /v1/responses` |
| 📦 模型分组 | 给一组模型起一个名字，按顺序/均衡/随机依次尝试，第一个能应答的被采用；首字节前自动切换候选 |
| ✏️ 模型别名 | 给模型起简短的对外名字；默认自动取模型名第一个词（小写）；重名自动合并为分组；一个模型可有多个别名 |
| 📌 会话粘滞 | 同一会话固定命中同一候选模型，保住上游 prompt cache |
| 📊 调用图表 | 热力图、趋势线、小时柱状；按 **密钥 / Provider / 模型** 筛选；90 天统计落盘 |
| 🔑 API 密钥 | SHA-256 存储，明文仅创建时显示一次；删最后一把密钥仍保持锁定 |
| 🌐 全网访问 | 独立端口监听所有网卡（默认 `3090`，页面可改）；不暴露 DSH 界面本身 |
| 🎛 侧栏管理页 | 总览 / 模型 / 分组 / 密钥 四个标签页；模型行内直接加别名、加入分组 |

## 安装

```sh
dsh plugin --profile web add github:gdrpzym/dsh-one-gateway
```

或本地目录：

```sh
dsh plugin --profile web add /绝对路径/dsh-one-gateway
```

安装后打开左侧栏 **模型网关** 页面。

> ⚠️ 独立端口默认对全网开放。**先在「密钥」页创建一把 API 密钥**，再让其他设备接入。

## 调用

```python
from openai import OpenAI

client = OpenAI(
    base_url="http://<本机IP>:3090/v1",
    api_key="sk-dshgw-...",
)

resp = client.chat.completions.create(
    model="qoduck",          # 别名 / 分组名 / provider_model 均可
    messages=[{"role": "user", "content": "你好"}],
)
```

```sh
curl http://127.0.0.1:3090/v1/chat/completions \
  -H "Authorization: Bearer sk-dshgw-..." \
  -H "Content-Type: application/json" \
  -d '{"model":"fast-chat","messages":[{"role":"user","content":"你好"}],"stream":true}'
```

- `/v1/models` 默认只列出**别名与分组**；原始 `provider_model` id 仍可调用，`?all=1` 可看全量。
- 会话粘滞：带 `x-session-affinity: <会话id>` 请求头；不带时按对话前缀指纹自动粘滞。
- 响应头 `x-relay-group` / `x-relay-model` 指明实际命中的候选。
- `/v1/responses` 支持 `input` 字符串/消息/工具调用历史，流式返回标准 Responses 事件。

## 分组与别名

- **分组** = 候选列表 + 调度方式（顺序 / 均衡 / 随机）+ 429 同腿重试次数。候选在产出第一个 token 前失败时自动换下一个；已产出内容后不再切换。
- **别名**自动规则：模型显示名按空格取第一个词、全小写；多个模型撞同一个词时自动建为同名分组。模型行上可继续手动添加多个别名。
- 均衡/随机调度会让多轮对话在不同候选间跳转（牺牲 prompt cache 换取负载分摊）；顺序 + 粘滞是 cache 友好组合。

## 统计

总览页内置热力图 / 趋势 / 小时柱状与调用、应答、未应答、Tokens 合计，可按 **密钥 / Provider / 模型** 组合筛选，逐条查看请求明细。筛选选项合并当前数据与历史记录，重启后不为空。统计只记计数与 token 数，**不记录任何请求或响应正文**。

## 配置

在 profile 的 `cordis.patch.yml` 按 id 覆盖：

```yaml
- id: dsh-one-gateway
  config:
    path: /v1          # 挂载点
    lanPort: 3090      # 独立端口；false 关闭；0 随机
    lanHost: 0.0.0.0   # 监听地址
    apiKeys: []        # 固定密钥（与页面创建的密钥同时生效）
    providers: []      # 只暴露这些 provider；空 = 全部
    autoAlias: true    # 启动时自动生成默认别名
```

端口也可以直接在页面上改，立即生效并持久化。

## 安全

- 独立端口只服务网关自己的 `/v1` 路由，DSH 界面、会话与其他路由不受影响。
- 密钥仅存 SHA-256 哈希；管理操作只走已登录的 DSH 页面，`/v1` 本身不提供管理入口。
- 凭据由 Harness 各 provider 适配器自行解析，网关不持有、不转发任何上游密钥。

## 开发

```sh
npm run check   # 语法检查
npm test        # 冒烟测试（假 llm 服务，不发外部请求）
```

## 许可

[Apache-2.0](LICENSE)
