// 第一截：时间轮子。只负责把还没到期的租约按到期时间放进槽里，
// 轮子转到点就把槽里的编号交出去。没填到期时间的租约不占槽。

export interface Lease {
  id: string;
  expiresAt?: number; // 到期时间戳（毫秒）。不填 = 永不到期，不占槽
}

// 另一截（工人派发器）实现这个接口，轮子到点时调用它
export interface ExpirySink {
  onLeaseExpired(id: string): void;
}

export class TimingWheel {
  private readonly tickMs: number;
  private sink: ExpirySink | null = null;

  private leases = new Map<string, Lease>();
  private slots = new Map<number, Set<string>>(); // 槽位序号 -> 租约编号
  private slotOf = new Map<string, number>(); // 租约编号 -> 槽位序号
  private expired = new Set<string>();
  private cancelled = new Set<string>();

  constructor(tickMs = 1000) {
    this.tickMs = tickMs;
  }

  // 两截互相调用之一：轮子接上另一截
  connect(sink: ExpirySink): void {
    this.sink = sink;
  }

  add(lease: Lease, now: number): void {
    this.leases.set(lease.id, lease);
    if (lease.expiresAt === undefined) return; // 没填到期时间，不占槽
    if (lease.expiresAt <= now) {
      this.expire(lease.id); // 登记时就已经到期，立刻交出去
      return;
    }
    const slot = Math.floor(lease.expiresAt / this.tickMs);
    let bucket = this.slots.get(slot);
    if (!bucket) {
      bucket = new Set();
      this.slots.set(slot, bucket);
    }
    bucket.add(lease.id);
    this.slotOf.set(lease.id, slot);
  }

  cancel(id: string): void {
    this.cancelled.add(id);
    this.removeFromSlot(id);
    this.leases.delete(id);
  }

  // 已经到期的、取消的，都查不成还有效
  isActive(id: string, now: number): boolean {
    if (this.cancelled.has(id) || this.expired.has(id)) return false;
    const lease = this.leases.get(id);
    if (!lease) return false;
    if (lease.expiresAt !== undefined && lease.expiresAt <= now) return false;
    return true;
  }

  // 轮子往前转：把所有到点的槽倒空，编号逐个交给另一截
  advance(now: number): void {
    const dueSlot = Math.floor(now / this.tickMs);
    const due = [...this.slots.keys()].filter((s) => s <= dueSlot).sort((a, b) => a - b);
    for (const slot of due) {
      const bucket = this.slots.get(slot)!;
      this.slots.delete(slot);
      for (const id of bucket) {
        this.slotOf.delete(id);
        this.expire(id);
      }
    }
  }

  // 两截互相调用之二：另一截把编号交给工人后回调确认，轮子彻底销档
  acknowledge(id: string): void {
    this.leases.delete(id);
  }

  private expire(id: string): void {
    if (this.expired.has(id) || this.cancelled.has(id)) return; // 取消后转多少圈都不会再通知
    this.expired.add(id);
    this.removeFromSlot(id);
    this.sink?.onLeaseExpired(id); // 槽里的编号原样交出去，同一个字符串
  }

  private removeFromSlot(id: string): void {
    const slot = this.slotOf.get(id);
    if (slot === undefined) return;
    const bucket = this.slots.get(slot);
    if (bucket) {
      bucket.delete(id);
      if (bucket.size === 0) this.slots.delete(slot);
    }
    this.slotOf.delete(id);
  }
}
