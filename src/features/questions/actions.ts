"use server";

import { revalidatePath } from "next/cache";

import { fromThrown, ok, type ActionResult } from "@/lib/action-result";
import { getCurrentActor } from "@/lib/current-actor";

import type { QuestionInput } from "./input";
import {
  archiveQuestion,
  publishQuestion,
  saveImportedQuestions,
  saveQuestion,
  setBookmark,
  unpublishQuestion,
} from "./service";

export interface EditableQuestionState {
  id: string;
  title: string;
  promptMarkdown: string;
  answerMarkdown: string;
  topicId: string;
  difficulty: QuestionInput["difficulty"];
  tags: string[];
  draftVersion: number;
  published: boolean;
  archived: boolean;
}

export interface QuestionMutationResult {
  message: string;
  question: EditableQuestionState;
}

export interface ImportSaveActionResult {
  message: string;
  requestId: string;
  questionIds: string[];
}

function toEditableQuestionState(question: {
  id: string;
  title: string;
  promptMarkdown: string;
  answerMarkdown: string;
  topicId: string;
  difficulty: QuestionInput["difficulty"];
  tags: string[];
  draftVersion: number;
  archivedAt: Date | null;
  currentPublishedRevisionId: string | null;
}): EditableQuestionState {
  return {
    id: question.id,
    title: question.title,
    promptMarkdown: question.promptMarkdown,
    answerMarkdown: question.answerMarkdown,
    topicId: question.topicId,
    difficulty: question.difficulty,
    tags: question.tags,
    draftVersion: question.draftVersion,
    published: question.currentPublishedRevisionId !== null,
    archived: question.archivedAt !== null,
  };
}

function revalidateQuestionPaths(id: string) {
  revalidatePath("/");
  revalidatePath("/my-questions");
  revalidatePath("/my-questions/new");
  revalidatePath(`/my-questions/${id}/edit`);
  revalidatePath(`/questions/${id}`);
}

export async function saveQuestionAction(
  input: QuestionInput,
  options?: { id?: string; expectedVersion?: number; returnTo?: string },
): Promise<ActionResult<QuestionMutationResult>> {
  try {
    const actor = await getCurrentActor();
    const question = await saveQuestion(actor, input, options?.id, options?.expectedVersion);
    revalidateQuestionPaths(question.id);
    return ok({ message: "Draft saved.", question: toEditableQuestionState(question) });
  } catch (error) {
    return fromThrown(error, "Could not save draft.", options?.returnTo);
  }
}

export async function publishQuestionAction(
  id: string,
  expectedVersion: number,
  returnTo?: string,
): Promise<ActionResult<QuestionMutationResult>> {
  try {
    const actor = await getCurrentActor();
    const question = await publishQuestion(actor, id, expectedVersion);
    revalidateQuestionPaths(question.id);
    return ok({ message: "Published.", question: toEditableQuestionState(question) });
  } catch (error) {
    return fromThrown(error, "Could not publish this question.", returnTo);
  }
}

export async function unpublishQuestionAction(id: string, returnTo?: string): Promise<ActionResult<QuestionMutationResult>> {
  try {
    const actor = await getCurrentActor();
    const question = await unpublishQuestion(actor, id);
    revalidateQuestionPaths(question.id);
    return ok({ message: "Removed from the public library.", question: toEditableQuestionState(question) });
  } catch (error) {
    return fromThrown(error, "Could not unpublish this question.", returnTo);
  }
}

export async function archiveQuestionAction(id: string, returnTo?: string): Promise<ActionResult<QuestionMutationResult>> {
  try {
    const actor = await getCurrentActor();
    const question = await archiveQuestion(actor, id);
    revalidateQuestionPaths(question.id);
    return ok({ message: "Question archived.", question: toEditableQuestionState(question) });
  } catch (error) {
    return fromThrown(error, "Could not archive this question.", returnTo);
  }
}

export async function setBookmarkAction(
  questionId: string,
  saved: boolean,
  returnTo?: string,
): Promise<ActionResult<{ saved: boolean }>> {
  try {
    const actor = await getCurrentActor();
    const result = await setBookmark(actor, questionId, saved);
    revalidatePath("/");
    revalidatePath(`/questions/${questionId}`);
    return ok({ saved: result.saved });
  } catch (error) {
    return fromThrown(error, "Could not update the bookmark.", returnTo);
  }
}

export async function saveImportedQuestionsAction(
  requestId: string,
  inputs: readonly QuestionInput[],
  returnTo?: string,
): Promise<ActionResult<ImportSaveActionResult>> {
  try {
    const actor = await getCurrentActor();
    const result = await saveImportedQuestions(actor, requestId, inputs);
    revalidatePath("/my-questions");
    for (const id of result.questionIds) {
      revalidatePath(`/my-questions/${id}/edit`);
    }
    return ok({
      message: result.questionIds.length === 1 ? "Saved 1 draft." : `Saved ${result.questionIds.length} drafts.`,
      requestId: result.requestId,
      questionIds: result.questionIds,
    });
  } catch (error) {
    return fromThrown(error, "Could not save the selected drafts.", returnTo);
  }
}