import {
  Button,
  Container,
  Heading,
  Input,
  StatusBadge,
  Text,
  Textarea,
} from "@medusajs/ui";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

declare const __BACKEND_URL__: string;

type StudioMode = "admin" | "vendor";

type Category = { id: string; name: string; parent_category_id?: string | null };
type Tag = { id: string; value: string };
type CatalogueItem = {
  id: string;
  title: string;
  thumbnail?: string | null;
  status: string;
  categories?: { name?: string | null }[];
};
type MetaResponse = {
  categories: Category[];
  tags: Tag[];
  catalogue: CatalogueItem[];
};
type Spec = { id?: string; name: string; value: string; unit: string };
type StudioProduct = {
  id: string;
  title: string;
  subtitle: string;
  description: string;
  status: string;
  thumbnail: string;
  category_id: string;
  category_name: string;
  brand: string;
  manufacturer: string;
  model_number: string;
  product_type: string;
  hsn_code: string;
  unit_of_measure: string;
  tags: string[];
  specifications: Spec[];
  can_edit: boolean;
  owned: boolean;
};

type FormState = {
  title: string;
  subtitle: string;
  description: string;
  category_id: string;
  brand: string;
  manufacturer: string;
  model_number: string;
  product_type: string;
  hsn_code: string;
  unit_of_measure: string;
  thumbnail: string;
};

type Notice = { kind: "success" | "error" | "info"; text: string };

const EMPTY_FORM: FormState = {
  title: "",
  subtitle: "",
  description: "",
  category_id: "",
  brand: "",
  manufacturer: "",
  model_number: "",
  product_type: "",
  hsn_code: "",
  unit_of_measure: "",
  thumbnail: "",
};

const EMPTY_SPEC: Spec = { name: "", value: "", unit: "" };

const SPEC_SUGGESTIONS = [
  "Material",
  "Finish",
  "Colour",
  "Size",
  "Voltage",
  "Power",
  "Cable length",
  "Conductor size",
  "Cores",
  "Warranty",
];

const backend = __BACKEND_URL__.replace(/\/$/, "");

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${backend}${path}`, {
    credentials: "include",
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const body = (await response.json().catch(() => ({}))) as {
    message?: string;
  };
  if (!response.ok) {
    throw new Error(body.message ?? `Request failed (${response.status}).`);
  }
  return body as T;
}

const clean = (value: string | null | undefined) =>
  value && value.trim() ? value.trim() : null;

function Section({
  number,
  title,
  description,
  complete,
  children,
}: {
  number: number;
  title: string;
  description: string;
  complete?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className="border-t border-ui-border-base px-6 py-6 first:border-t-0">
      <div className="mb-5 flex items-start gap-3">
        <span
          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
            complete
              ? "bg-ui-bg-interactive text-ui-fg-on-color"
              : "bg-ui-bg-subtle text-ui-fg-subtle"
          }`}
        >
          {number}
        </span>
        <div>
          <Heading level="h2">{title}</Heading>
          <Text size="small" className="mt-1 text-ui-fg-subtle">
            {description}
          </Text>
        </div>
      </div>
      {children}
    </section>
  );
}

function Field({
  label,
  hint,
  required,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-ui-fg-base">
        {label}
        {required ? <span className="ml-1 text-ui-fg-error">*</span> : null}
      </span>
      {children}
      {hint ? (
        <span className="text-xs leading-5 text-ui-fg-subtle">{hint}</span>
      ) : null}
    </label>
  );
}

function UpcomingSection({
  number,
  title,
  description,
  next,
}: {
  number: number;
  title: string;
  description: string;
  next: string;
}) {
  return (
    <section className="border-t border-ui-border-base px-6 py-6">
      <div className="flex items-start gap-3">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-ui-bg-subtle text-xs font-semibold text-ui-fg-subtle">
          {number}
        </span>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Heading level="h2">{title}</Heading>
            <StatusBadge color="grey">Next slice</StatusBadge>
          </div>
          <Text size="small" className="mt-1 text-ui-fg-subtle">
            {description}
          </Text>
          <Text size="small" className="mt-2 text-ui-fg-subtle">
            {next}
          </Text>
        </div>
      </div>
    </section>
  );
}

export function ProductStudioForm({
  mode,
  productId,
}: {
  mode: StudioMode;
  productId?: string;
}) {
  const navigate = useNavigate();
  const apiBase =
    mode === "admin"
      ? "/admin/buildkart/product-studio"
      : "/vendor/buildkart/product-studio";
  const draftKey = `buildkart:product-studio:${mode}:${productId ?? "new"}`;

  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [specs, setSpecs] = useState<Spec[]>([{ ...EMPTY_SPEC }]);
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(Boolean(productId));
  const [loaded, setLoaded] = useState(!productId);
  const [dirty, setDirty] = useState(false);
  const [lastSaved, setLastSaved] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [status, setStatus] = useState("draft");
  const [canEdit, setCanEdit] = useState(true);

  const meta = useQuery({
    queryKey: ["buildkart", "product-studio", mode, "meta", appliedSearch],
    queryFn: () =>
      request<MetaResponse>(
        `${apiBase}?q=${encodeURIComponent(appliedSearch)}`,
      ),
  });

  useEffect(() => {
    if (!productId) {
      const raw = localStorage.getItem(draftKey);
      if (raw) {
        try {
          const saved = JSON.parse(raw) as {
            form?: FormState;
            specs?: Spec[];
            tags?: string[];
          };
          if (saved.form) setForm({ ...EMPTY_FORM, ...saved.form });
          if (saved.specs?.length) setSpecs(saved.specs);
          if (saved.tags?.length) setTags(saved.tags);
          setNotice({
            kind: "info",
            text: "Restored the unsaved local draft from this browser.",
          });
          setDirty(true);
        } catch {
          localStorage.removeItem(draftKey);
        }
      }
      setLoaded(true);
      return;
    }

    let cancelled = false;
    setLoading(true);
    request<{ product: StudioProduct }>(`${apiBase}/${productId}`)
      .then(({ product }) => {
        if (cancelled) return;
        setForm({
          title: product.title,
          subtitle: product.subtitle,
          description: product.description,
          category_id: product.category_id,
          brand: product.brand,
          manufacturer: product.manufacturer,
          model_number: product.model_number,
          product_type: product.product_type,
          hsn_code: product.hsn_code,
          unit_of_measure: product.unit_of_measure,
          thumbnail: product.thumbnail,
        });
        setSpecs(
          product.specifications.length > 0
            ? product.specifications
            : [{ ...EMPTY_SPEC }],
        );
        setTags(product.tags);
        setStatus(product.status);
        setCanEdit(product.can_edit);
        setLoaded(true);
        setDirty(false);
      })
      .catch((error: Error) => {
        if (!cancelled) {
          setNotice({ kind: "error", text: error.message });
          setLoaded(true);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [apiBase, draftKey, productId]);

  useEffect(() => {
    if (!loaded || !canEdit) return;
    const handle = window.setTimeout(() => {
      localStorage.setItem(
        draftKey,
        JSON.stringify({ form, specs, tags, updated_at: Date.now() }),
      );
    }, 700);
    return () => window.clearTimeout(handle);
  }, [canEdit, draftKey, form, loaded, specs, tags]);

  const validSpecs = useMemo(
    () => specs.filter((spec) => spec.name.trim() && spec.value.trim()),
    [specs],
  );

  const partialSpecRows = useMemo(
    () =>
      specs.filter(
        (spec) =>
          Boolean(spec.name.trim()) !== Boolean(spec.value.trim()),
      ),
    [specs],
  );

  const checks = useMemo(
    () => [
      { label: "Title", ok: Boolean(form.title.trim()), required: true },
      {
        label: "Category",
        ok: Boolean(form.category_id),
        required: true,
      },
      { label: "Search tags", ok: tags.length > 0 },
      { label: "Specifications", ok: validSpecs.length > 0 },
      { label: "Thumbnail", ok: Boolean(form.thumbnail.trim()) },
    ],
    [form.category_id, form.thumbnail, form.title, tags, validSpecs],
  );

  const sectionOneDone = Boolean(form.title.trim() && form.category_id);
  const sectionTwoDone = tags.length > 0;
  const sectionThreeDone = validSpecs.length > 0;
  const readySections = [sectionOneDone, sectionTwoDone, sectionThreeDone].filter(
    Boolean,
  ).length;

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
    setDirty(true);
    setNotice(null);
  };

  const addTagValues = (raw: string) => {
    const candidates = raw
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
    if (candidates.length === 0) return;
    setTags((current) => {
      const next = [...current];
      for (const candidate of candidates) {
        if (
          !next.some(
            (value) => value.toLowerCase() === candidate.toLowerCase(),
          )
        ) {
          next.push(candidate);
        }
      }
      return next;
    });
    setTagInput("");
    setDirty(true);
    setNotice(null);
  };

  const removeTag = (value: string) => {
    setTags((current) => current.filter((tag) => tag !== value));
    setDirty(true);
  };

  const updateSpec = (index: number, patch: Partial<Spec>) => {
    setSpecs((current) =>
      current.map((spec, position) =>
        position === index ? { ...spec, ...patch } : spec,
      ),
    );
    setDirty(true);
    setNotice(null);
  };

  const addSpec = () => {
    setSpecs((current) => [...current, { ...EMPTY_SPEC }]);
    setDirty(true);
  };

  const removeSpec = (index: number) => {
    setSpecs((current) => {
      const next = current.filter((_, position) => position !== index);
      return next.length > 0 ? next : [{ ...EMPTY_SPEC }];
    });
    setDirty(true);
  };

  const save = async () => {
    if (!form.title.trim()) {
      setNotice({ kind: "error", text: "Enter a product title before saving." });
      return;
    }
    if (partialSpecRows.length > 0) {
      setNotice({
        kind: "error",
        text: "Complete or remove the partially filled specification rows before saving.",
      });
      return;
    }

    setSaving(true);
    setNotice(null);
    try {
      const payload = {
        ...form,
        tags,
        specifications: validSpecs.map((spec) => ({
          name: spec.name,
          value: spec.value,
          unit: spec.unit,
        })),
      };
      const result = await request<{ product: StudioProduct }>(
        productId ? `${apiBase}/${productId}` : apiBase,
        {
          method: "POST",
          body: JSON.stringify(payload),
        },
      );
      localStorage.removeItem(draftKey);
      setDirty(false);
      setLastSaved(new Date().toLocaleTimeString());
      setStatus(result.product.status);
      setCanEdit(result.product.can_edit);
      setNotice({
        kind: "success",
        text: productId
          ? "Draft saved. The product master record is updated."
          : "Draft created. You can continue editing it in this studio.",
      });
      if (!productId) {
        navigate(`/product-studio/${result.product.id}`);
      }
    } catch (error) {
      setNotice({
        kind: "error",
        text: (error as Error).message,
      });
    } finally {
      setSaving(false);
    }
  };

  const reset = () => {
    if (!window.confirm("Discard this local draft and start again?")) return;
    localStorage.removeItem(draftKey);
    setForm(EMPTY_FORM);
    setSpecs([{ ...EMPTY_SPEC }]);
    setTags([]);
    setTagInput("");
    setDirty(false);
    setNotice({ kind: "info", text: "Started a new local draft." });
    if (productId) {
      navigate("/product-studio");
    }
  };

  const previewTitle = form.title.trim() || "Untitled product";
  const previewCategory =
    meta.data?.categories.find((category) => category.id === form.category_id)
      ?.name ?? "No category selected";

  return (
    <div className="flex flex-col gap-y-3">
      <Container className="p-0">
        <div className="flex flex-col gap-4 px-6 py-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Heading level="h1">
                {productId ? "Edit product" : "New product"}
              </Heading>
              <StatusBadge color="orange">Staging</StatusBadge>
              <StatusBadge
                color={
                  status === "published"
                    ? "green"
                    : status === "proposed"
                      ? "blue"
                      : "grey"
                }
              >
                {status}
              </StatusBadge>
            </div>
            <Text size="small" className="mt-1 max-w-3xl text-ui-fg-subtle">
              One continuous product record. This first slice covers product
              details, search tags and structured specifications. Variants,
              pricing, inventory and publishing follow in later slices.
            </Text>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link to="/products">
              <Button size="small" variant="secondary">
                Back to products
              </Button>
            </Link>
            {productId ? (
              <Link to={`/products/${productId}`}>
                <Button size="small" variant="secondary">
                  Open native record
                </Button>
              </Link>
            ) : null}
          </div>
        </div>

        <div className="border-t border-ui-border-base px-6 py-4">
          <div className="flex flex-wrap items-center gap-2 text-xs text-ui-fg-subtle">
            <span className="font-medium text-ui-fg-base">
              {readySections}/3 available sections ready
            </span>
            <span>·</span>
            <span>
              {dirty ? "Unsaved changes" : "No unsaved changes"}
              {lastSaved ? ` · saved ${lastSaved}` : ""}
            </span>
            <span>·</span>
            <span>Local autosave keeps a recovery copy in this browser.</span>
          </div>
          <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-ui-bg-subtle">
            <div
              className="h-full rounded-full bg-ui-bg-interactive transition-all"
              style={{ width: `${(readySections / 3) * 100}%` }}
            />
          </div>
        </div>
      </Container>

      {notice ? (
        <div
          className={`rounded-lg border px-4 py-3 text-sm ${
            notice.kind === "error"
              ? "border-ui-border-error bg-ui-bg-error text-ui-fg-error"
              : notice.kind === "success"
                ? "border-ui-border-success bg-ui-bg-success text-ui-fg-success"
                : "border-ui-border-base bg-ui-bg-subtle text-ui-fg-subtle"
          }`}
        >
          {notice.text}
        </div>
      ) : null}

      {loading ? (
        <Container>
          <Text size="small" className="text-ui-fg-subtle">
            Loading product record…
          </Text>
        </Container>
      ) : !canEdit ? (
        <Container className="flex flex-col gap-2">
          <Heading level="h2">Read-only product</Heading>
          <Text size="small" className="text-ui-fg-subtle">
            This product is not a draft you can edit. Published product changes
            are handled through the review flow in a later slice.
          </Text>
          <Link to={`/products/${productId}`}>
            <Button size="small">Open native record</Button>
          </Link>
        </Container>
      ) : (
        <div className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1fr)_360px]">
          <Container className="p-0">
            <div className="px-6 py-5">
              <Heading level="h2">Catalogue search</Heading>
              <Text size="small" className="mt-1 text-ui-fg-subtle">
                Check whether the product already exists before creating a
                duplicate master record.
              </Text>
              <form
                className="mt-3 flex gap-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  setAppliedSearch(search.trim());
                }}
              >
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search existing products by title"
                />
                <Button size="small" type="submit" variant="secondary">
                  Search
                </Button>
              </form>
              <div className="mt-3 flex flex-col divide-y divide-ui-border-base">
                {(meta.data?.catalogue ?? []).length === 0 ? (
                  <Text size="small" className="py-2 text-ui-fg-subtle">
                    {meta.isPending
                      ? "Searching…"
                      : appliedSearch
                        ? "No matching products."
                        : "No recent products to show."}
                  </Text>
                ) : (
                  (meta.data?.catalogue ?? []).map((item) => (
                    <div
                      key={item.id}
                      className="flex flex-wrap items-center justify-between gap-2 py-2"
                    >
                      <div className="flex min-w-0 items-center gap-2">
                        {item.thumbnail ? (
                          <img
                            src={item.thumbnail}
                            alt=""
                            className="h-9 w-9 rounded object-cover"
                          />
                        ) : (
                          <div className="h-9 w-9 rounded bg-ui-bg-subtle" />
                        )}
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-ui-fg-base">
                            {item.title}
                          </p>
                          <p className="text-xs text-ui-fg-subtle">
                            {item.categories?.[0]?.name ?? "Uncategorised"} ·{" "}
                            {item.status}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        {mode === "admin" || item.status === "draft" ? (
                          <Link
                            to={`/product-studio/${item.id}`}
                            className="text-xs font-medium text-ui-fg-interactive hover:underline"
                          >
                            Edit in studio
                          </Link>
                        ) : null}
                        <Link
                          to={`/products/${item.id}`}
                          className="text-xs font-medium text-ui-fg-interactive hover:underline"
                        >
                          Open
                        </Link>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <Section
              number={1}
              title="Product details"
              description="The commercial identity of the item. Keep the title customer-facing and the internal codes exact."
              complete={sectionOneDone}
            >
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="md:col-span-2">
                  <Field label="Product title" required>
                    <Input
                      value={form.title}
                      onChange={(event) => update("title", event.target.value)}
                      placeholder="e.g. AquaTek PPR Pipe 25mm 3m"
                    />
                  </Field>
                </div>
                <div className="md:col-span-2">
                  <Field
                    label="Short description"
                    hint="A one-line summary used in listings and search."
                  >
                    <Input
                      value={form.subtitle}
                      onChange={(event) =>
                        update("subtitle", event.target.value)
                      }
                      placeholder="Optional one-line summary"
                    />
                  </Field>
                </div>
                <div className="md:col-span-2">
                  <Field label="Full description">
                    <Textarea
                      value={form.description}
                      onChange={(event) =>
                        update("description", event.target.value)
                      }
                      placeholder="Describe what the product is, what it includes and how it is used."
                      rows={5}
                    />
                  </Field>
                </div>
                <Field label="Category" required>
                  <select
                    className="h-8 w-full rounded-md border border-ui-border-base bg-ui-bg-field px-3 text-sm text-ui-fg-base"
                    value={form.category_id}
                    onChange={(event) =>
                      update("category_id", event.target.value)
                    }
                  >
                    <option value="">Select a category</option>
                    {(meta.data?.categories ?? []).map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Product type">
                  <Input
                    value={form.product_type}
                    onChange={(event) =>
                      update("product_type", event.target.value)
                    }
                    placeholder="e.g. Pipes and fittings"
                  />
                </Field>
                <Field label="Brand">
                  <Input
                    value={form.brand}
                    onChange={(event) => update("brand", event.target.value)}
                    placeholder="e.g. AquaTek"
                  />
                </Field>
                <Field label="Manufacturer">
                  <Input
                    value={form.manufacturer}
                    onChange={(event) =>
                      update("manufacturer", event.target.value)
                    }
                    placeholder="Legal manufacturer name"
                  />
                </Field>
                <Field label="Model / part number">
                  <Input
                    value={form.model_number}
                    onChange={(event) =>
                      update("model_number", event.target.value)
                    }
                    placeholder="Manufacturer model or part number"
                  />
                </Field>
                <Field
                  label="HSN / GST code"
                  hint="Stored on the product master for tax and invoice use."
                >
                  <Input
                    value={form.hsn_code}
                    onChange={(event) =>
                      update("hsn_code", event.target.value)
                    }
                    placeholder="e.g. 3917"
                  />
                </Field>
                <Field label="Unit of measure">
                  <Input
                    value={form.unit_of_measure}
                    onChange={(event) =>
                      update("unit_of_measure", event.target.value)
                    }
                    placeholder="e.g. piece, metre, box"
                  />
                </Field>
                <div className="md:col-span-2">
                  <Field
                    label="Thumbnail URL"
                    hint="Use a governed HTTPS image URL in staging."
                  >
                    <Input
                      value={form.thumbnail}
                      onChange={(event) =>
                        update("thumbnail", event.target.value)
                      }
                      placeholder="https://…"
                    />
                  </Field>
                </div>
              </div>
            </Section>

            <Section
              number={2}
              title="Search tags"
              description="Tags help operators find the product. They are not a substitute for structured specifications."
              complete={sectionTwoDone}
            >
              <div className="flex flex-wrap gap-2">
                {tags.map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center gap-1 rounded-full bg-ui-bg-subtle px-3 py-1 text-xs text-ui-fg-base"
                  >
                    {tag}
                    <button
                      type="button"
                      aria-label={`Remove ${tag}`}
                      className="text-ui-fg-muted hover:text-ui-fg-base"
                      onClick={() => removeTag(tag)}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <Input
                  value={tagInput}
                  onChange={(event) => setTagInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === ",") {
                      event.preventDefault();
                      addTagValues(tagInput);
                    }
                    if (event.key === "Backspace" && !tagInput && tags.length) {
                      removeTag(tags[tags.length - 1]);
                    }
                  }}
                  onBlur={() => addTagValues(tagInput)}
                  placeholder="Type a tag and press Enter"
                  className="max-w-sm"
                />
                <Button
                  size="small"
                  type="button"
                  variant="secondary"
                  onClick={() => addTagValues(tagInput)}
                >
                  Add tag
                </Button>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {(meta.data?.tags ?? [])
                  .filter(
                    (tag) =>
                      !tags.some(
                        (value) =>
                          value.toLowerCase() === tag.value.toLowerCase(),
                      ),
                  )
                  .slice(0, 10)
                  .map((tag) => (
                    <button
                      key={tag.id}
                      type="button"
                      className="rounded-full border border-ui-border-base px-2.5 py-1 text-xs text-ui-fg-subtle hover:bg-ui-bg-subtle"
                      onClick={() => addTagValues(tag.value)}
                    >
                      + {tag.value}
                    </button>
                  ))}
              </div>
            </Section>

            <Section
              number={3}
              title="Specifications"
              description="Structured product facts. Each specification becomes a filterable product attribute; do not put these in the title or description."
              complete={sectionThreeDone}
            >
              <div className="flex flex-col gap-2">
                {specs.map((spec, index) => (
                  <div
                    key={index}
                    className="grid grid-cols-1 gap-2 rounded-lg border border-ui-border-base p-3 sm:grid-cols-[1.2fr_1fr_120px_40px]"
                  >
                    <Input
                      list="product-studio-spec-suggestions"
                      value={spec.name}
                      onChange={(event) =>
                        updateSpec(index, { name: event.target.value })
                      }
                      placeholder="Specification name"
                    />
                    <Input
                      value={spec.value}
                      onChange={(event) =>
                        updateSpec(index, { value: event.target.value })
                      }
                      placeholder="Value"
                    />
                    <Input
                      value={spec.unit}
                      onChange={(event) =>
                        updateSpec(index, { unit: event.target.value })
                      }
                      placeholder="Unit (optional)"
                    />
                    <Button
                      type="button"
                      size="small"
                      variant="transparent"
                      onClick={() => removeSpec(index)}
                      aria-label="Remove specification"
                    >
                      ×
                    </Button>
                  </div>
                ))}
                <datalist id="product-studio-spec-suggestions">
                  {SPEC_SUGGESTIONS.map((suggestion) => (
                    <option key={suggestion} value={suggestion} />
                  ))}
                </datalist>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    size="small"
                    type="button"
                    variant="secondary"
                    onClick={addSpec}
                  >
                    Add specification
                  </Button>
                  <Text size="small" className="text-ui-fg-subtle">
                    {validSpecs.length} complete ·{" "}
                    {partialSpecRows.length} incomplete
                  </Text>
                </div>
              </div>
            </Section>

            <UpcomingSection
              number={4}
              title="Variants and SKUs"
              description="Variant axes, SKU uniqueness, EAN/UPC, barcode and default-variant behaviour."
              next="Planned next: the variant combination builder will use the same product record."
            />
            <UpcomingSection
              number={5}
              title="Pricing"
              description="List price, selling price, quantity tiers and the audited pricing facade."
              next="Planned next: offer-scoped pricing, not a second price store on the product."
            />
            <UpcomingSection
              number={6}
              title="Inventory"
              description="Tryton-backed stock visibility, reorder points and stock location scope."
              next="Planned next: Tryton remains the inventory authority."
            />
            <UpcomingSection
              number={7}
              title="Review and publish"
              description="Admin approval, seller submission, validation summary and the publish audit trail."
              next="Planned next: publish and seller product changes route through Mercur ProductChange."
            />

            <div className="sticky bottom-0 z-10 flex flex-col gap-3 border-t border-ui-border-base bg-ui-bg-base px-6 py-4 md:flex-row md:items-center md:justify-between">
              <Text size="small" className="text-ui-fg-subtle">
                {dirty
                  ? "You have unsaved changes."
                  : lastSaved
                    ? `Last saved at ${lastSaved}.`
                    : "Draft not saved yet."}
              </Text>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  size="small"
                  type="button"
                  variant="secondary"
                  onClick={reset}
                >
                  Start again
                </Button>
                <Button
                  size="small"
                  type="button"
                  isLoading={saving}
                  disabled={!form.title.trim() || saving}
                  onClick={save}
                >
                  {productId ? "Save draft" : "Create draft"}
                </Button>
              </div>
            </div>
          </Container>

          <div className="flex flex-col gap-3">
            <Container className="p-0">
              <div className="border-b border-ui-border-base px-5 py-4">
                <Heading level="h2">Customer preview</Heading>
                <Text size="small" className="mt-1 text-ui-fg-subtle">
                  What the structured record will look like to a buyer.
                </Text>
              </div>
              <div className="p-5">
                {form.thumbnail.trim() ? (
                  <img
                    src={form.thumbnail}
                    alt=""
                    className="mb-4 aspect-square w-full rounded-lg object-cover"
                  />
                ) : (
                  <div className="mb-4 flex aspect-square w-full items-center justify-center rounded-lg bg-ui-bg-subtle text-xs text-ui-fg-subtle">
                    No thumbnail
                  </div>
                )}
                <p className="text-xs uppercase tracking-wide text-ui-fg-subtle">
                  {form.brand.trim() || "Brand"} · {previewCategory}
                </p>
                <p className="mt-1 text-lg font-semibold text-ui-fg-base">
                  {previewTitle}
                </p>
                <p className="mt-2 text-sm text-ui-fg-subtle">
                  {form.subtitle.trim() ||
                    form.description.trim() ||
                    "Add a short description to preview the listing summary."}
                </p>
                {tags.length > 0 ? (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {tags.map((tag) => (
                      <span
                        key={tag}
                        className="rounded-full bg-ui-bg-subtle px-2 py-0.5 text-xs text-ui-fg-subtle"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                ) : null}
                <div className="mt-4 border-t border-ui-border-base pt-3">
                  <p className="text-xs font-medium uppercase tracking-wide text-ui-fg-subtle">
                    Specifications
                  </p>
                  {validSpecs.length === 0 ? (
                    <p className="mt-2 text-xs text-ui-fg-subtle">
                      No specifications yet.
                    </p>
                  ) : (
                    <dl className="mt-2 divide-y divide-ui-border-base">
                      {validSpecs.map((spec) => (
                        <div
                          key={`${spec.name}-${spec.value}`}
                          className="flex items-start justify-between gap-3 py-2 text-xs"
                        >
                          <dt className="text-ui-fg-subtle">{spec.name}</dt>
                          <dd className="text-right font-medium text-ui-fg-base">
                            {spec.value}
                            {spec.unit ? ` ${spec.unit}` : ""}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  )}
                </div>
              </div>
            </Container>

            <Container className="p-0">
              <div className="border-b border-ui-border-base px-5 py-4">
                <Heading level="h2">Readiness</Heading>
              </div>
              <div className="divide-y divide-ui-border-base">
                {checks.map((check) => (
                  <div
                    key={check.label}
                    className="flex items-center justify-between gap-3 px-5 py-3 text-sm"
                  >
                    <span
                      className={
                        check.ok ? "text-ui-fg-base" : "text-ui-fg-subtle"
                      }
                    >
                      {check.label}
                      {check.required ? " *" : ""}
                    </span>
                    <span
                      className={
                        check.ok
                          ? "text-ui-fg-success"
                          : "text-ui-fg-subtle"
                      }
                    >
                      {check.ok ? "Ready" : "Missing"}
                    </span>
                  </div>
                ))}
              </div>
              <div className="px-5 py-4">
                <Text size="small" className="text-ui-fg-subtle">
                  Publish remains disabled in this slice. Completing variants,
                  pricing and inventory is required before review.
                </Text>
              </div>
            </Container>
          </div>
        </div>
      )}
    </div>
  );
}
