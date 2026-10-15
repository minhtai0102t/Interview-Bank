"use server";

import { revalidatePath } from "next/cache";

import { fromThrown, ok, type ActionResult } from "@/lib/action-result";
import { getCurrentActor } from "@/lib/current-actor";

import {
  deleteCollection,
  saveCollection,
  setCollectionQuestion,
  type CollectionInput,
  type CollectionSummary,
} from "./service";

export async function saveCollectionAction(
  input: CollectionInput,
  options?: { id?: string; returnTo?: string },
): Promise<ActionResult<{ message: string; collection: CollectionSummary }>> {
  try {
    const actor = await getCurrentActor();
    const collection = await saveCollection(actor, input, options?.id);
    revalidatePath("/collections", "layout");
    revalidatePath("/practice", "layout");
    return ok({ message: options?.id ? "Collection updated." : "Collection created.", collection });
  } catch (error) {
    return fromThrown(error, options?.id ? "Could not update this collection." : "Could not create this collection.", options?.returnTo);
  }
}

export async function deleteCollectionAction(id: string, returnTo?: string): Promise<ActionResult<{ message: string }>> {
  try {
    const actor = await getCurrentActor();
    await deleteCollection(actor, id);
    revalidatePath("/collections", "layout");
    revalidatePath("/practice", "layout");
    return ok({ message: "Collection deleted." });
  } catch (error) {
    return fromThrown(error, "Could not delete this collection.", returnTo);
  }
}

export async function setCollectionQuestionAction(
  collectionId: string,
  questionId: string,
  included: boolean,
  returnTo?: string,
): Promise<ActionResult<{ message: string }>> {
  try {
    const actor = await getCurrentActor();
    await setCollectionQuestion(actor, collectionId, questionId, included);
    revalidatePath("/collections", "layout");
    revalidatePath("/practice", "layout");
    revalidatePath(`/questions/${questionId}`);
    return ok({ message: included ? "Question added to the collection." : "Question removed from the collection." });
  } catch (error) {
    return fromThrown(error, "Could not update this collection.", returnTo);
  }
}