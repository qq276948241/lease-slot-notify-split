// 第一截：只负责把还没到期的租约按时间放进轮子，并在转动时把到期编号交出去。

import type { DueLeaseSink, Lease, WheelLookup } from "./types.ts";

interface SlotEntry {
  readonly id: string;
  readonly expiresAt: number;
}

export class LeaseWheel implements WheelLookup {
  private readonly slotMs: number;
  private readonly slots: Array<Map<string, SlotEntry>>;
  private readonly slotOf = new Map<string, number>();
  private readonly leases = new Map<string, Lease>();
  private readonly cancelled = new Set<string>();
  private readonly expired = new Set<string>();
  private currentTime: number;
  private sink: DueLeaseSink | undefined;

  constructor(slotMs: number, slotCount: number, now: number) {
    if (!Number.isFinite(slotMs) || slotMs <= 0) {
      throw new RangeError("slotMs must be a positive number");
    }
    if (!Number.isInteger(slotCount) || slotCount <= 0) {
      throw new RangeError("slotCount must be a positive integer");
    }
    this.slotMs = slotMs;
    this.slots = Array.from({ length: slotCount }, () => new Map<string, SlotEntry>());
    this.currentTime = now;
  }

  /** 接上第二截。轮子到期时通过它把编号交给工人。 */
  attachSink(sink: DueLeaseSink): void {
    this.sink = sink;
  }

  /**
   * 把租约放上轮子。
   * 没填到期时间的返回 false，绝不占槽；
   * 放上来时就已经到期的也不占槽，直接记为已失效。
   */
  placeLease(lease: Lease, now: number): boolean {
    if (lease.expiresAt === undefined) {
      return false;
    }
    this.leases.set(lease.id, lease);
    if (now > this.currentTime) {
      this.currentTime = now;
    }
    if (lease.expiresAt <= now) {
      this.expired.add(lease.id);
      return false;
    }
    const index = Math.floor(lease.expiresAt / this.slotMs) % this.slots.length;
    this.slots[index].set(lease.id, { id: lease.id, expiresAt: lease.expiresAt });
    this.slotOf.set(lease.id, index);
    return true;
  }

  /** 取消：立刻从槽里摘掉并记下，之后轮子再转多少圈都不会再交出去。 */
  cancel(id: string): boolean {
    if (!this.leases.has(id) || this.cancelled.has(id)) {
      return false;
    }
    this.cancelled.add(id);
    const index = this.slotOf.get(id);
    if (index !== undefined) {
      this.slots[index].delete(id);
      this.slotOf.delete(id);
    }
    return true;
  }

  /** 查询此刻是否仍有效：已到期、已取消、没到期时间的都不算有效。 */
  isActive(id: string, now: number): boolean {
    const lease = this.leases.get(id);
    if (lease === undefined || lease.expiresAt === undefined) {
      return false;
    }
    if (this.cancelled.has(id) || this.expired.has(id)) {
      return false;
    }
    return lease.expiresAt > now;
  }

  /**
   * 转动轮子到 now。把这一程里到期的编号原样收集起来，
   * 通过 sink 交给第二截；槽里的编号和交出去的编号是同一个字符串。
   */
  tick(now: number): string[] {
    if (now < this.currentTime) {
      throw new RangeError("time cannot move backwards");
    }
    const due: string[] = [];
    const from = Math.floor(this.currentTime / this.slotMs);
    const to = Math.floor(now / this.slotMs);
    for (let tickIndex = from; tickIndex <= to; tickIndex += 1) {
      const slot = this.slots[tickIndex % this.slots.length];
      for (const entry of slot.values()) {
        if (entry.expiresAt <= now && !this.cancelled.has(entry.id)) {
          slot.delete(entry.id);
          this.slotOf.delete(entry.id);
          due.push(entry.id);
        }
      }
    }
    this.currentTime = now;
    if (due.length > 0 && this.sink !== undefined) {
      this.sink.deliver(due);
    }
    return due;
  }

  isCancelled(id: string): boolean {
    return this.cancelled.has(id);
  }

  /** 第二截确认工人已拿到编号后回调，把租约定死为已到期。 */
  confirmExpired(id: string): void {
    this.expired.add(id);
    const index = this.slotOf.get(id);
    if (index !== undefined) {
      this.slots[index].delete(id);
      this.slotOf.delete(id);
    }
  }

  /** 目前真正占着槽的租约数量，给验证用。 */
  occupiedSlots(): number {
    return this.slotOf.size;
  }

  get confirmedExpiredCount(): number {
    return this.expired.size;
  }
}
