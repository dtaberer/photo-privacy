export const STATUS_LEVELS = ["info", "success", "warning", "danger"] as const;
export type StatusLevel = (typeof STATUS_LEVELS)[number];
