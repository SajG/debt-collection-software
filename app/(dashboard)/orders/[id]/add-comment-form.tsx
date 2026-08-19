"use client";

import { useState, useTransition } from "react";
import { addOrderCommentAction } from "../../production/actions";

// Simple textarea + Post button. Server action does the DB write and
// revalidatePath — no client-side optimistic update, so what the user
// sees on screen after submit is what actually persisted.
export function AddCommentForm({ orderId }: { orderId: string }) {
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit() {
    setError(null);
    const trimmed = body.trim();
    if (!trimmed) return;
    startTransition(async () => {
      const res = await addOrderCommentAction({ orderId, body: trimmed });
      if ("error" in res) {
        setError(res.error);
        return;
      }
      setBody("");
    });
  }

  return (
    <div className="mb-5 rounded-lg border border-border/60 bg-muted/20 p-4">
      <label
        htmlFor={`comment-${orderId}`}
        className="mb-2 block text-xs font-semibold uppercase tracking-wide text-muted-foreground"
      >
        Add comment
      </label>
      <textarea
        id={`comment-${orderId}`}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        maxLength={4000}
        rows={3}
        placeholder="e.g. 'Customer wants 20kg instead of 25kg' or 'Can we prepone dispatch to Wed?'"
        className="w-full rounded-md border border-border bg-background p-2 text-sm"
      />
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
      <div className="mt-2 flex items-center justify-end gap-3">
        <span className="text-xs text-muted-foreground">
          Append-only. Everyone with access to this order will see it.
        </span>
        <button
          type="button"
          onClick={submit}
          disabled={pending || body.trim().length === 0}
          className="rounded-md bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground disabled:opacity-60"
        >
          {pending ? "Posting…" : "Post"}
        </button>
      </div>
    </div>
  );
}
