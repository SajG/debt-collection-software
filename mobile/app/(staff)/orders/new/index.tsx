import { Redirect } from "expo-router";
import { useWizard } from "@/lib/order-draft";

// Step index → route. Any step visited before is safe to resume to.
const STEP_ROUTES = [
  "/(staff)/orders/new/customer", // 1
  "/(staff)/orders/new/dispatch", // 2
  "/(staff)/orders/new/brand", // 3
  "/(staff)/orders/new/product", // 4
  "/(staff)/orders/new/quantity", // 5
  "/(staff)/orders/new/packing", // 6
  "/(staff)/orders/new/rate", // 7
  "/(staff)/orders/new/terms", // 8
  "/(staff)/orders/new/delivery", // 9
  "/(staff)/orders/new/token", // 10
  "/(staff)/orders/new/notes", // 11
  "/(staff)/orders/new/review", // 12
] as const;

// /orders/new entry — resumes at the last visited step if the draft
// context has one, else drops the user on step 1. Draft is persisted so
// even a killed-app resume works.
export default function NewOrderIndex() {
  const { draft, hydrated } = useWizard();
  if (!hydrated) return null;
  const idx = Math.min(Math.max(draft.lastStep ?? 1, 1), STEP_ROUTES.length) - 1;
  return <Redirect href={STEP_ROUTES[idx]} />;
}
