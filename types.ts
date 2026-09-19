// 两截共用的契约。只放类型，编译后全部被擦除，运行时不存在。

export interface Lease {
  readonly id: string;
  /** 到期时刻（epoch 毫秒）。不填表示永不到期，这种租约不许占槽。 */
  readonly expiresAt?: number;
}

/** 第一截（轮子）看向第二截（派发）的接口：到期时把编号交出去。 */
export interface DueLeaseSink {
  deliver(ids: string[]): void;
}

/** 第二截（派发）看回第一截（轮子）的接口：查取消、确认已到期。 */
export interface WheelLookup {
  isCancelled(id: string): boolean;
  confirmExpired(id: string): void;
}
