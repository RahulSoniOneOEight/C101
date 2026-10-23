import { Navigate, useSearchParams } from "react-router-dom";
import {
  contentKindRoute,
  isContentKind,
  type ContentLocale,
} from "./content-model";

export default function LegacyContentLibraryRedirect() {
  const [searchParams] = useSearchParams();
  const requestedKind = searchParams.get("kind") ?? undefined;
  const locale: ContentLocale = searchParams.get("locale") === "hi-IN" ? "hi-IN" : "en-IN";
  const route = isContentKind(requestedKind)
    ? contentKindRoute(requestedKind, locale)
    : contentKindRoute("banner", locale);
  const next = new URLSearchParams(route.includes("?") ? route.split("?")[1] : "");
  const status = searchParams.get("status");
  const search = searchParams.get("q");
  if (status === "published" || status === "modified" || status === "draft") {
    next.set("view", status);
  }
  if (search) next.set("q", search);
  const pathname = route.split("?")[0];
  return <Navigate to={`${pathname}${next.size ? `?${next.toString()}` : ""}`} replace />;
}
