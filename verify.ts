// 五条规则的端到端验证。只用语言自带能力，断言失败即抛错。

import { LeaseDispatcher, Worker } from "./dispatcher.ts";
import { LeaseWheel } from "./wheel.ts";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`VERIFY FAILED: ${message}`);
  }
}

const worker = new Worker();
const dispatcher = new LeaseDispatcher(worker);
const wheel = new LeaseWheel(1000, 8, 0);

// 两截互相接上：轮子调派发，派发回调轮子。
wheel.attachSink(dispatcher);
dispatcher.attachWheel(wheel);

// 规则一：没填到期时间的不能占槽。
assert(wheel.placeLease({ id: "L-no-expiry" }, 0) === false, "no-expiry lease must be rejected");
assert(wheel.occupiedSlots() === 0, "no-expiry lease must not occupy a slot");

// 规则五铺垫：放三张还没到期的租约。
assert(wheel.placeLease({ id: "L-3000", expiresAt: 3000 }, 0) === true, "L-3000 should be placed");
assert(wheel.placeLease({ id: "L-5000", expiresAt: 5000 }, 0) === true, "L-5000 should be placed");
assert(wheel.placeLease({ id: "L-6500", expiresAt: 6500 }, 0) === true, "L-6500 should be placed");
assert(wheel.occupiedSlots() === 3, "three leases should occupy slots");

// 放上来时就已经到期的：不占槽，也查不成有效。
assert(wheel.placeLease({ id: "L-past", expiresAt: 100 }, 200) === false, "already-expired lease must be rejected");
assert(wheel.isActive("L-past", 200) === false, "already-expired lease must not read as active");
assert(wheel.occupiedSlots() === 3, "already-expired lease must not occupy a slot");

// 到期前查询有效；轮子没转到，工人手里是空的。
assert(wheel.isActive("L-3000", 2999) === true, "L-3000 should be active before expiry");
wheel.tick(2999);
assert(worker.handled.length === 0, "worker must get nothing before expiry");

// 转到 3000：编号原样到工人手里，槽与工人手里是同一个字符串。
wheel.tick(3000);
assert(worker.handled.length === 1, "worker should have exactly one id at t=3000");
assert(worker.handled[0] === "L-3000", "slot id and worker id must be the same string");

// 规则二：已经到期的不能再被查成还有效。
assert(wheel.isActive("L-3000", 3000) === false, "expired lease must not read as active");
assert(wheel.isActive("L-3000", 99999) === false, "expired lease stays inactive forever");

// 规则三：取消之后，轮子再转一圈也不能又通知一次。
assert(wheel.cancel("L-5000") === true, "cancel should succeed");
wheel.tick(5000);
assert(worker.handled.includes("L-5000") === false, "cancelled lease must never reach the worker");
assert(wheel.isActive("L-5000", 4000) === false, "cancelled lease must not read as active");

// 正常到期的 L-6500 照常送达，且只送一次。
wheel.tick(6500);
assert(worker.handled.filter((id) => id === "L-6500").length === 1, "L-6500 delivered exactly once");
wheel.tick(6500 + 8 * 1000); // 完整再转一圈
wheel.tick(6500 + 8 * 1000 * 3); // 再转两圈
assert(worker.handled.filter((id) => id === "L-6500").length === 1, "no duplicate notification after extra rounds");
assert(worker.handled.includes("L-5000") === false, "cancelled lease stays silent after extra rounds");
assert(worker.handled.length === 2, "worker should hold exactly L-3000 and L-6500");

// 规则五：两截确实互相调用了。
assert(dispatcher.batchesReceived > 0, "wheel must have called the dispatcher");
assert(wheel.confirmedExpiredCount >= 2, "dispatcher must have called back into the wheel");

console.log("ALL CHECKS PASSED");
