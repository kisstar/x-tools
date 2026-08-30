# 契约测试套件

> 属 [xTools 跨端架构设计方案](../cross-platform-design.md)。章节编号沿用总文，行内 `§N.M` 引用按索引的映射表定位。

---

## 11. 契约测试套件

### 11.1 最简形式：一份声明式用例，两个 runner

```jsonc
// contract-tests/fs.read-file.json
{
  "command": "fs.readFile",
  "cases": [
    { "name": "reads utf8", "setup": { "files": { "a.txt": "hello" } },
      "args": { "path": "a.txt" }, "expect": { "content": "hello" } },
    { "name": "rejects traversal",
      "args": { "path": "../../etc/passwd" }, "expectError": "FORBIDDEN" },
    { "name": "rejects empty path",
      "args": { "path": "" }, "expectError": "INVALID_ARGS" }
  ]
}
```

TS 侧 vitest 读它，Rust 侧 `#[test]` 读同一份。用例数据是真源，两个 runner 都只是执行器。

### 11.2 最危险的失效模式，以及唯一有效的防御

**契约测试最可能的死法：Rust 侧全部 skip，CI 依然全绿。** 能真正兜住这类失效的断言器有三个共同特征：

1. 断言最终产物，而非源码
2. 校验挂进构建管线本身（例如打包器的 `writeBundle` 钩子），而非流水线脚本——脚本会被人绕过或忘记调用，管线不会
3. **校验器能检测「自己什么都没检测到」**——被检查项计数为 0 时直接报错，而不是安静通过

第 3 条是关键。契约测试必须照办：

- 加载到的用例数为 0 → **fail**
- 某个 command 在 TS 侧有实现但契约用例文件缺失 → **fail**
- 某个 command 在 §4 表格里标了「双实现」但 Rust runner 未覆盖 → **fail**
- 两侧的用例条数不一致 → **fail**

### 11.3 覆盖范围

因业务模块改为双写，契约测试的地位从「保险」变成「生命线」——它是唯一能阻止两份 core 静默漂移的机制。

| 对象 | 是否纳入契约测试 |
|---|---|
| OS 原语（fs / shell / storage / path-guard） | ✅ TS + Rust 双跑 |
| 业务模块（switch-host 等） | ✅ **TS + Rust 双跑**（双写的直接后果） |
| 网络（http / ws / sse 客户端能力） | ✅ TS + Rust 双跑 |
| 提权 helper 动作 | ✅ TS + Rust 双跑（同一个 helper 二进制） |
| 传输层错误码语义（§6 那五个） | ✅ 四条路径全跑 |
| `capability:list` 输出的 key 集合与 limits 结构 | ✅ 两份 registry 必跑（§9.3） |
| HTTP/WS server 对外行为 | ✅ Rust server 必跑；Electron 内嵌 WS 传输跑同一份用例 |
| schema codegen 一致性 | ✅ CI 断言「重新生成后 git diff 为空」（§5.6） |
| 窗口 / 托盘 / 菜单 | ❌ host shell，走 E2E |

### 11.4 新模块的验收标准

**「TS 侧能跑」不是完成。** 一个业务模块视为完成，要求：

1. channel 契约在 `protocol/` 声明，schema codegen 产物已更新
2. TS core 与 Rust core 两份实现都在
3. 同一份契约用例两侧全绿，用例覆盖成功路径 + 每个错误码路径
4. capability 在两份 registry 都注册（allow `available` 不同，不 allow 缺 key）

这四条写进 PR 模板，靠清单强制，不靠记性。
