import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { client } from "../../lib/client";

export type CmsContentType = "banners" | "campaigns" | "curated-collections" | "storefront-layouts";
export type CmsStatus = "draft" | "published";

const keys = {
  snapshot: ["buildkart", "snapshot"] as const,
  health: ["buildkart", "cms-health"] as const,
  content: (type: CmsContentType, status: CmsStatus) => ["buildkart", "content", type, status] as const,
  audit: ["buildkart", "audit"] as const,
};

export const useOperationsSnapshot = () =>
  useQuery({
    queryKey: keys.snapshot,
    queryFn: async () => (await client.admin.buildkart.snapshot.query()).counts,
  });

export const useCmsHealth = () =>
  useQuery({
    queryKey: keys.health,
    queryFn: () => client.admin.buildkart.merchandising.health.query(),
    retry: 1,
    refetchInterval: 30_000,
  });

export const useCmsContent = (type: CmsContentType, status: CmsStatus) =>
  useQuery({
    queryKey: keys.content(type, status),
    queryFn: () => client.admin.buildkart.merchandising.$type.query({ $type: type, status }),
    retry: 1,
  });

interface ContentCommandInput {
  type: CmsContentType;
  data: Record<string, unknown>;
  reason: string;
}

interface PublicationCommandInput {
  type: CmsContentType;
  documentId: string;
  operation: "publish" | "unpublish";
  reason: string;
}

export const useCreateCmsContent = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ type, data, reason }: ContentCommandInput) =>
      client.admin.buildkart.merchandising.$type.mutate({
        $type: type,
        data,
        reason,
        idempotency_key: crypto.randomUUID(),
      }),
    onSuccess: async (_result, input) => {
      await queryClient.invalidateQueries({ queryKey: keys.content(input.type, "draft") });
      await queryClient.invalidateQueries({ queryKey: keys.audit });
    },
  });
};

export const usePublishCmsContent = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ type, documentId, operation, reason }: PublicationCommandInput) => {
      const command = {
        $type: type,
        $documentId: documentId,
        reason,
        idempotency_key: crypto.randomUUID(),
      };
      return operation === "publish"
        ? client.admin.buildkart.merchandising.$type.$documentId.publish.mutate(command)
        : client.admin.buildkart.merchandising.$type.$documentId.unpublish.mutate(command);
    },
    onSuccess: async (_result, input) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: keys.content(input.type, "draft") }),
        queryClient.invalidateQueries({ queryKey: keys.content(input.type, "published") }),
        queryClient.invalidateQueries({ queryKey: keys.audit }),
      ]);
    },
  });
};

export const useCmsAudit = () =>
  useQuery({
    queryKey: keys.audit,
    queryFn: () => client.admin.buildkart.audit.query({ limit: 100 }),
    retry: 1,
  });
