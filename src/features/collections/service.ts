import { ModerationState } from "@/generated/prisma/client";
import type { Prisma } from "@/generated/prisma/client";
import type { Actor } from "@/lib/actor";
import { requireActor } from "@/lib/actor";
import { DomainError } from "@/lib/errors";
import { getPrisma } from "@/lib/prisma";

export interface CollectionSummary {
  id: string;
  name: string;
  description: string;
  itemCount: number;
  updatedAt: Date;
}

export interface CollectionItemSummary {
  questionId: string;
  available: boolean;
  title: string;
  topicLabel: string;
  difficulty: string;
  tags: string[];
}

export interface CollectionDetail extends CollectionSummary {
  items: CollectionItemSummary[];
}

export interface CollectionInput {
  name: string;
  description: string;
}

function invalid(message: string): never {
  throw new DomainError("INVALID_INPUT", message);
}

function notFound(message = "Collection not found."): never {
  throw new DomainError("NOT_FOUND", message);
}

function parseCollectionInput(input: CollectionInput): CollectionInput {
  const name = input.name.trim();
  const description = input.description.trim();
  if (!name) invalid("Collection name is required.");
  if (name.length > 160) invalid("Collection name must be 160 characters or fewer.");
  if (Buffer.byteLength(description, "utf8") > 4096) invalid("Collection description must be 4096 bytes or fewer.");
  return { name, description };
}

function mapCollectionSummary(record: Prisma.CollectionGetPayload<{ include: { _count: { select: { items: true } } } }>): CollectionSummary {
  return {
    id: record.id,
    name: record.name,
    description: record.description,
    itemCount: record._count.items,
    updatedAt: record.updatedAt,
  };
}

async function lockOwnedCollection(tx: Prisma.TransactionClient, actor: Actor, id: string): Promise<void> {
  const rows = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT "id"
    FROM "collection"
    WHERE "id" = ${id}::uuid AND "userId" = ${actor.userId}
    FOR UPDATE
  `;
  if (rows.length === 0) notFound();
}

export async function listCollections(actor: Actor | null): Promise<CollectionSummary[]> {
  const owner = requireActor(actor);
  const collections = await getPrisma().collection.findMany({
    where: { userId: owner.userId },
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    include: { _count: { select: { items: true } } },
  });
  return collections.map(mapCollectionSummary);
}

export async function saveCollection(actor: Actor | null, input: CollectionInput, id?: string): Promise<CollectionSummary> {
  const owner = requireActor(actor);
  const parsed = parseCollectionInput(input);

  if (!id) {
    const created = await getPrisma().collection.create({
      data: { userId: owner.userId, ...parsed },
      include: { _count: { select: { items: true } } },
    });
    return mapCollectionSummary(created);
  }

  const updated = await getPrisma().collection.updateMany({
    where: { id, userId: owner.userId },
    data: parsed,
  });
  if (updated.count === 0) notFound();

  return mapCollectionSummary(
    await getPrisma().collection.findUniqueOrThrow({ where: { id }, include: { _count: { select: { items: true } } } }),
  );
}

export async function deleteCollection(actor: Actor | null, id: string): Promise<void> {
  const owner = requireActor(actor);
  await getPrisma().$transaction(async (tx) => {
    await lockOwnedCollection(tx, owner, id);
    await tx.collection.delete({ where: { id } });
  });
}

export async function getCollection(actor: Actor | null, id: string): Promise<CollectionDetail> {
  const owner = requireActor(actor);
  const collection = await getPrisma().collection.findFirst({
    where: { id, userId: owner.userId },
    include: {
      _count: { select: { items: true } },
      items: {
        orderBy: [{ createdAt: "asc" }, { questionId: "asc" }],
        include: {
          question: {
            include: {
              currentPublishedRevision: { include: { topic: true } },
              revisions: {
                where: { publishedAt: { not: null } },
                orderBy: [{ publishedAt: "desc" }, { id: "desc" }],
                take: 1,
                include: { topic: true },
              },
            },
          },
        },
      },
    },
  });
  if (!collection) notFound();

  return {
    ...mapCollectionSummary(collection),
    items: collection.items.map((item) => {
      const available =
        item.question.archivedAt === null &&
        item.question.moderationState === ModerationState.ACTIVE &&
        item.question.currentPublishedRevisionId !== null &&
        item.question.currentPublishedRevision !== null;
      const snapshot = item.question.currentPublishedRevision ?? item.question.revisions[0];
      if (!snapshot) {
        return {
          questionId: item.questionId,
          available: false,
          title: "Unavailable question",
          topicLabel: "Unavailable",
          difficulty: "UNKNOWN",
          tags: [],
        };
      }

      return {
        questionId: item.questionId,
        available,
        title: snapshot.title,
        topicLabel: snapshot.topic.label,
        difficulty: snapshot.difficulty,
        tags: snapshot.tags,
      };
    }),
  };
}

export async function setCollectionQuestion(actor: Actor | null, collectionId: string, questionId: string, included: boolean): Promise<void> {
  const owner = requireActor(actor);

  await getPrisma().$transaction(async (tx) => {
    await lockOwnedCollection(tx, owner, collectionId);

    if (included) {
      const question = await tx.question.findFirst({
        where: {
          id: questionId,
          archivedAt: null,
          moderationState: ModerationState.ACTIVE,
          currentPublishedRevisionId: { not: null },
        },
        select: { id: true },
      });
      if (!question) throw new DomainError("NOT_FOUND", "Question not found.");

      await tx.collectionItem.upsert({
        where: { collectionId_questionId: { collectionId, questionId } },
        create: { collectionId, questionId },
        update: {},
      });
    } else {
      await tx.collectionItem.deleteMany({ where: { collectionId, questionId } });
    }

    await tx.collection.update({ where: { id: collectionId }, data: { updatedAt: new Date() } });
  });
}