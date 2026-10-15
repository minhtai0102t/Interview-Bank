"use server";

import { revalidatePath } from "next/cache";

import { fromThrown, ok, type ActionResult } from "@/lib/action-result";
import { getCurrentActor } from "@/lib/current-actor";

import { moderateQuestion } from "./service";

export async function moderateQuestionAction(questionId: string, state: "ACTIVE" | "REMOVED"): Promise<ActionResult<{ message: string }>> {
  try {
    const actor = await getCurrentActor();
    await moderateQuestion(actor, questionId, state);
    revalidatePath("/");
    revalidatePath("/admin");
    revalidatePath("/collections");
    revalidatePath("/practice");
    revalidatePath(`/questions/${questionId}`);
    return ok({ message: "Question visibility updated." });
  } catch (error) {
    return fromThrown(error, "Could not update question visibility.", "/admin");
  }
}