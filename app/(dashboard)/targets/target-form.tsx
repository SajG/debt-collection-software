"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { inputCls, btnPrimaryCls } from "../_components/ui";
import { upsertRecoveryTarget } from "./actions";

export function TargetForm({
  staff,
  month,
}: {
  staff: { id: string; name: string }[];
  month: string;
}) {
  const [userId, setUserId] = useState(staff[0]?.id ?? "");
  const [amount, setAmount] = useState("");
  const [pending, startTransition] = useTransition();

  return (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        startTransition(async () => {
          const result = await upsertRecoveryTarget({
            userId,
            month,
            targetAmount: Number(amount),
          });
          if ("error" in result) toast.error(result.error);
          else toast.success("Target saved");
        });
      }}
    >
      <select
        value={userId}
        onChange={(e) => setUserId(e.target.value)}
        className={inputCls}
      >
        {staff.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>
      <input
        type="number"
        min="1"
        placeholder="Target ₹ for this month"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        className={`${inputCls} max-w-xs`}
      />
      <button type="submit" className={btnPrimaryCls} disabled={pending || !amount}>
        Set target
      </button>
    </form>
  );
}
