import { TypeConvert, createEmptyCard, fsrs, type CardInput, type Grade, type State } from "ts-fsrs";

import { DomainError } from "@/lib/errors";

const scheduler = fsrs({ enable_fuzz: false });

export interface StoredFsrsCard {
  [key: string]: string | number | null;
  due: string;
  stability: number;
  difficulty: number;
  elapsed_days: number;
  scheduled_days: number;
  learning_steps: number;
  reps: number;
  lapses: number;
  state: number;
  last_review: string | null;
}

export interface ScheduledReview {
  dueAt: Date;
  card: StoredFsrsCard;
}

function invalid(message: string): never {
  throw new DomainError("INVALID_INPUT", message);
}

function asFiniteNumber(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) invalid(`${field} must be a finite number.`);
  return value;
}

function asInteger(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isInteger(value)) invalid(`${field} must be an integer.`);
  return value;
}

function asIsoDate(value: unknown, field: string): Date {
  const date = new Date(typeof value === "string" || typeof value === "number" || value instanceof Date ? value : "");
  if (Number.isNaN(date.getTime())) invalid(`${field} must be a valid date.`);
  return date;
}

function deserializeCard(card: unknown): CardInput {
  if (!card || typeof card !== "object") invalid("Stored card must be an object.");
  const value = card as Record<string, unknown>;
  return {
    due: asIsoDate(value.due, "card.due"),
    stability: asFiniteNumber(value.stability, "card.stability"),
    difficulty: asFiniteNumber(value.difficulty, "card.difficulty"),
    elapsed_days: asInteger(value.elapsed_days, "card.elapsed_days"),
    scheduled_days: asInteger(value.scheduled_days, "card.scheduled_days"),
    learning_steps: asInteger(value.learning_steps, "card.learning_steps"),
    reps: asInteger(value.reps, "card.reps"),
    lapses: asInteger(value.lapses, "card.lapses"),
    state: asInteger(value.state, "card.state") as State,
    last_review: value.last_review == null ? undefined : asIsoDate(value.last_review, "card.last_review"),
  };
}

function serializeCard(card: CardInput): StoredFsrsCard {
  const normalized = TypeConvert.card(card);
  const due = normalized.due;
  const lastReview = normalized.last_review ?? null;

  return {
    due: due.toISOString(),
    stability: normalized.stability,
    difficulty: normalized.difficulty,
    elapsed_days: normalized.elapsed_days,
    scheduled_days: normalized.scheduled_days,
    learning_steps: normalized.learning_steps,
    reps: normalized.reps,
    lapses: normalized.lapses,
    state: normalized.state,
    last_review: lastReview?.toISOString() ?? null,
  };
}

export function scheduleReview(cardJson: unknown | null, rating: Grade, now: Date): ScheduledReview {
  const baseCard = cardJson ? deserializeCard(cardJson) : createEmptyCard(now);
  const nextState = scheduler.next(baseCard, now, rating).card;

  return {
    dueAt: nextState.due,
    card: serializeCard(nextState),
  };
}