import { AssertFn } from "@/types/detectors";

export const assert: AssertFn = (cond, msg = "Assertion failed") => {
  if (!cond) throw new Error(msg);
};
