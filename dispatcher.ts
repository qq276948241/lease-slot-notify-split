// 第二截：只在到期时把编号交给工人，并回头调用第一截做确认。

import type { DueLeaseSink, WheelLookup } from "./types.ts";

export class Worker {
  readonly handled: string[] = [];

  handle(id: string): void {
    this.handled.push(id);
  }
}

export class LeaseDispatcher implements DueLeaseSink {
  private readonly delivered = new Set<string>();
  private readonly worker: Worker;
  private wheel: WheelLookup | undefined;
  batchesReceived = 0;

  constructor(worker: Worker) {
    this.worker = worker;
  }

  /** 接回第一截。派发时要反查取消状态、送完后要确认到期。 */
  attachWheel(wheel: WheelLookup): void {
    this.wheel = wheel;
  }

  /**
   * 轮子转出来的到期批次从这里进来。
   * 编号原样递给工人，不改名不换壳；同一个编号这辈子只递一次。
   */
  deliver(ids: string[]): void {
    this.batchesReceived += 1;
    for (const id of ids) {
      if (this.delivered.has(id)) {
        continue;
      }
      if (this.wheel !== undefined && this.wheel.isCancelled(id)) {
        continue;
      }
      this.worker.handle(id);
      this.delivered.add(id);
      if (this.wheel !== undefined) {
        this.wheel.confirmExpired(id);
      }
    }
  }
}
