// rocket-ship.d.ts (types only; no bodies)
declare module "rocket-ship" {
  export type Before<A extends unknown[]> = (...args: A) => void | Promise<void>;
  export type After<A extends unknown[], R> = (result: R, ...args: A) => void | Promise<void>;
  export type OnError<A extends unknown[]> = (err: unknown, ...args: A) => void;

  export function zerosLikeNumbers<T>(obj: T): T;
  export function withAround<A extends unknown[], R>(
    fn: (...args: A) => Promise<R> | R,
    opts?: { before?: Before<A>; after?: After<A, R>; onError?: OnError<A> }
  ): (...args: A) => Promise<R>;
}
