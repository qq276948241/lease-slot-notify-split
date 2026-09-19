# 租约到期时间轮（两截式）

- `types.ts`：两截共用的类型契约（`Lease` / `DueLeaseSink` / `WheelLookup`）。
- `wheel.ts`：第一截 `LeaseWheel`，只把还没到期的租约按时间放进轮子，`tick` 时把到期编号交出去。
- `dispatcher.ts`：第二截 `LeaseDispatcher` + `Worker`，只在到期时把编号原样交给工人，并回调轮子确认。
- `verify.ts`：五条规则的端到端验证。

运行验证（Node >= 23.6，直接执行 TS，无任何第三方依赖）：

```sh
node verify.ts
```
