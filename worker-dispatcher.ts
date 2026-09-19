// 第二截：工人派发器。只在租约到期时被轮子调用，把编号交到工人手里。
// 工人手里的编号就是轮子槽里的那个编号，同一个字符串，不复制不改写。

import { TimingWheel } from "./timing-wheel.ts";

export class WorkerDispatcher {
  private readonly handed: string[] = []; // 工人手里待处理的编号
  private readonly wheel: TimingWheel;

  constructor(wheel: TimingWheel) {
    this.wheel = wheel;
    this.wheel.connect(this); // 两截互相调用：把自己接到轮子上
  }

  // 轮子到点时调这里
  onLeaseExpired(id: string): void {
    this.handed.push(id);
    this.wheel.acknowledge(id); // 回调轮子确认销档
  }

  // 工人取活：拿到的是轮子里出来的同一个编号
  takeJob(): string | undefined {
    return this.handed.shift();
  }

  get pending(): readonly string[] {
    return this.handed;
  }
}
