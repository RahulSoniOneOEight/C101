import { useQueries } from "@tanstack/react-query";
import { client } from "../../lib/client";
import {
  CONTENT_KINDS,
  type ContentDocument,
  type ContentKind,
  type ContentLocale,
  type ContentResponse,
} from "./content-model";

export type ContentLibraryItem = {
  kind: ContentKind;
  kindLabel: string;
  response: ContentResponse;
  document: ContentDocument;
};

export function useContentLibrary(locale: ContentLocale) {
  const queries = useQueries({
    queries: CONTENT_KINDS.map((item) => ({
      queryKey: ["buildkart", "cms-content", item.kind, locale],
      queryFn: () => client.admin.buildkart.content.query({ kind: item.kind, locale }),
    })),
  });

  const items: ContentLibraryItem[] = CONTENT_KINDS.flatMap((item, index) => {
    const response = queries[index].data as ContentResponse | undefined;
    if (!response) return [];
    return response.documents.map((document) => ({
      kind: item.kind,
      kindLabel: item.label,
      response,
      document,
    }));
  });
  const typeCounts = Object.fromEntries(
    CONTENT_KINDS.map((item, index) => [
      item.kind,
      (queries[index].data as ContentResponse | undefined)?.documents.length ?? 0,
    ]),
  ) as Record<ContentKind, number>;
  const failedQueries = queries.filter((query) => query.isError).length;

  return {
    items,
    typeCounts,
    isPending: queries.some((query) => query.isPending),
    failedQueries,
    allUnavailable: failedQueries === queries.length,
  };
}

export function contentItemTitle(item: ContentLibraryItem): string {
  const value = item.document[item.response.definition.titleField];
  return typeof value === "string" && value.trim() ? value : "Untitled content";
}

export function contentItemKey(item: ContentLibraryItem): string {
  const value = item.document[item.response.definition.keyField];
  return typeof value === "string" && value.trim() ? value : item.document.documentId;
}

export function contentItemDate(item: ContentLibraryItem, field: string): Date | null {
  const value = item.document[field];
  if (typeof value !== "string" || !value.trim()) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}
