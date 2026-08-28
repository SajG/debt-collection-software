// Thin re-export so mobile callers keep the same import path
// (`@/lib/status-style`) while the actual colour + label vocabulary
// now lives in packages/tokens/status.ts and is shared with the web
// dashboard. Add / rename a status ONCE, in the shared file.

import type { OrderStatus } from "./database.types";
import {
  orderStatusStyle as _orderStatusStyle,
  type StatusStyle,
} from "../../../packages/tokens/status";

export function statusStyle(status: OrderStatus): {
  bg: string;
  fg: string;
} {
  const s: StatusStyle = _orderStatusStyle(status);
  return { bg: s.bg, fg: s.fg };
}

export { orderStatusStyle } from "../../../packages/tokens/status";
export type { StatusStyle } from "../../../packages/tokens/status";
