import { TimingWheel } from "./timing-wheel.ts";
import { WorkerDispatcher } from "./worker-dispatcher.ts";

const wheel = new TimingWheel(1000); // 一格一秒
const dispatcher = new WorkerDispatcher(wheel);

const t0 = 1_000_000;

wheel.add({ id: "lease-A", expiresAt: t0 + 3000 }, t0); // 3 秒后到期
wheel.add({ id: "lease-B", expiresAt: t0 + 8000 }, t0); // 8 秒后到期
wheel.add({ id: "lease-C" }, t0); // 没填到期时间，不占槽
wheel.add({ id: "lease-D", expiresAt: t0 - 1 }, t0); // 登记时已到期

console.log("D 登记即到期，工人立刻拿到:", dispatcher.takeJob()); // lease-D

console.log("A 现在有效?", wheel.isActive("lease-A", t0)); // true
console.log("C 现在有效?", wheel.isActive("lease-C", t0)); // true（永不到期也是有效）

wheel.advance(t0 + 4000); // 轮子转到 4 秒
console.log("到点交出的编号:", dispatcher.takeJob()); // lease-A
console.log("A 到期后还有效?", wheel.isActive("lease-A", t0 + 4000)); // false

wheel.cancel("lease-B"); // 取消 B
wheel.advance(t0 + 60_000); // 轮子再转一大圈
console.log("取消后还有通知吗?", dispatcher.takeJob()); // undefined
console.log("B 还有效?", wheel.isActive("lease-B", t0 + 60_000)); // false
console.log("C 始终有效?", wheel.isActive("lease-C", t0 + 60_000)); // true
