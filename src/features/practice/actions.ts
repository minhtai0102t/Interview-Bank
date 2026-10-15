"use server";

import { revalidatePath } from "next/cache";

import { fromThrown, ok, type ActionResult } from "@/lib/action-result";
import { getCurrentActor } from "@/lib/current-actor";

import {
  completePracticeSession,
  createPracticeSession,
  gradePracticeItem,
  revealPracticeAnswer,
  savePracticeResponse,
  setPracticeSessionPosition,
  type CreatePracticeSessionInput,
} from "./service";

function revalidatePracticePaths(questionId?: string) {
  revalidatePath("/practice", "layout");
  revalidatePath("/collections", "layout");
  revalidatePath("/progress");
  if (questionId) revalidatePath(`/questions/${questionId}`);
}

export async function createPracticeSessionAction(
  input: CreatePracticeSessionInput,
  returnTo?: string,
): Promise<ActionResult<{ message: string; sessionId: string }>> {
  try {
    const actor = await getCurrentActor();
    const session = await createPracticeSession(actor, input);
    revalidatePracticePaths(input.questionId);
    return ok({ message: "Practice session started.", sessionId: session.id });
  } catch (error) {
    return fromThrown(error, "Could not start this practice session.", returnTo);
  }
}

export async function savePracticeResponseAction(
  itemId: string,
  responseMarkdown: string,
  returnTo?: string,
): Promise<ActionResult<{ message: string }>> {
  try {
    const actor = await getCurrentActor();
    await savePracticeResponse(actor, itemId, responseMarkdown);
    revalidatePracticePaths();
    return ok({ message: "Response saved." });
  } catch (error) {
    return fromThrown(error, "Could not save this response.", returnTo);
  }
}

export async function movePracticeSessionAction(
  sessionId: string,
  itemId: string,
  responseMarkdown: string,
  position: number,
  returnTo?: string,
): Promise<ActionResult<{ message: string }>> {
  try {
    const actor = await getCurrentActor();
    await savePracticeResponse(actor, itemId, responseMarkdown);
    await setPracticeSessionPosition(actor, sessionId, position);
    revalidatePracticePaths();
    return ok({ message: "Progress saved." });
  } catch (error) {
    return fromThrown(error, "Could not move to that question.", returnTo);
  }
}

export async function revealPracticeAnswerAction(
  itemId: string,
  responseMarkdown: string,
  returnTo?: string,
): Promise<ActionResult<{ message: string }>> {
  try {
    const actor = await getCurrentActor();
    await savePracticeResponse(actor, itemId, responseMarkdown);
    await revealPracticeAnswer(actor, itemId);
    revalidatePracticePaths();
    return ok({ message: "Answer revealed." });
  } catch (error) {
    return fromThrown(error, "Could not reveal the answer.", returnTo);
  }
}

export async function gradePracticeItemAction(
  itemId: string,
  responseMarkdown: string,
  rating: 1 | 2 | 3 | 4,
  returnTo?: string,
): Promise<ActionResult<{ message: string }>> {
  try {
    const actor = await getCurrentActor();
    await savePracticeResponse(actor, itemId, responseMarkdown);
    await gradePracticeItem(actor, itemId, rating);
    revalidatePracticePaths();
    return ok({ message: "Review recorded." });
  } catch (error) {
    return fromThrown(error, "Could not record this review.", returnTo);
  }
}

export async function completePracticeSessionAction(
  sessionId: string,
  itemId: string,
  responseMarkdown: string,
  returnTo?: string,
): Promise<ActionResult<{ message: string }>> {
  try {
    const actor = await getCurrentActor();
    await savePracticeResponse(actor, itemId, responseMarkdown);
    await completePracticeSession(actor, sessionId);
    revalidatePracticePaths();
    return ok({ message: "Practice session completed." });
  } catch (error) {
    return fromThrown(error, "Could not complete this session.", returnTo);
  }
}