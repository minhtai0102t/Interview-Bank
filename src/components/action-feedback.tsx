import Link from "next/link";

import type { ActionRecovery } from "@/lib/action-result";

export interface ActionFeedbackState {
  kind: "success" | "error";
  message: string;
  recovery?: ActionRecovery;
}

export function ActionFeedback({ feedback, className = "" }: { feedback: ActionFeedbackState | null; className?: string }) {
  if (!feedback) return null;

  return (
    <div
      role={feedback.kind === "error" ? "alert" : "status"}
      className={`${
        feedback.kind === "error"
          ? "rounded-control bg-danger-soft px-3 py-2 text-sm text-danger"
          : "rounded-control bg-emerald-50 px-3 py-2 text-sm text-primary"
      }${className ? ` ${className}` : ""}`}
    >
      <span>{feedback.message}</span>
      {feedback.recovery ? (
        <>
          {" "}
          <Link href={feedback.recovery.href} className="font-medium underline underline-offset-2">
            {feedback.recovery.label}
          </Link>
        </>
      ) : null}
    </div>
  );
}