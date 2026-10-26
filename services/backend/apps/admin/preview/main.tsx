import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import "@mercurjs/admin/index.css";
import { ProductStudioForm } from "../src/routes/product-studio/studio-form";
import { scenarios } from "./fixtures";
import { installMockFetch, setScenario } from "./mock-fetch";

installMockFetch();

const params = new URLSearchParams(window.location.search);
const requested = params.get("scenario");
const initial = scenarios.find((row) => row.id === requested) ?? scenarios[0];
setScenario(initial);

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
});

function Preview() {
  const [scenarioId, setScenarioId] = useState(initial.id);
  const scenario = scenarios.find((row) => row.id === scenarioId) ?? scenarios[0];

  return (
    <div style={{ minHeight: "100vh", background: "#f6f6f7" }}>
      <div
        style={{
          position: "sticky",
          top: 0,
          zIndex: 50,
          display: "flex",
          flexWrap: "wrap",
          gap: 8,
          alignItems: "center",
          padding: "10px 16px",
          background: "#111827",
          color: "#f9fafb",
          font: "500 12px/1.4 ui-sans-serif, system-ui, sans-serif",
        }}
      >
        <span style={{ opacity: 0.6, letterSpacing: "0.08em", textTransform: "uppercase" }}>
          UI review
        </span>
        {scenarios.map((row) => (
          <button
            key={row.id}
            type="button"
            onClick={() => {
              setScenarioId(row.id);
              setScenario(row);
              window.history.replaceState({}, "", `?scenario=${row.id}`);
            }}
            style={{
              border: "1px solid rgba(255,255,255,0.25)",
              background: row.id === scenarioId ? "#f9fafb" : "transparent",
              color: row.id === scenarioId ? "#111827" : "#f9fafb",
              borderRadius: 999,
              padding: "5px 12px",
              cursor: "pointer",
              font: "inherit",
            }}
          >
            {row.label}
          </button>
        ))}
        <span style={{ opacity: 0.7, marginLeft: 8 }}>{scenario.note}</span>
      </div>

      <MemoryRouter initialEntries={["/product-studio/prod_preview"]}>
        <QueryClientProvider client={queryClient}>
          <div key={scenario.id} style={{ padding: 16 }}>
            <ProductStudioForm
              mode="admin"
              productId={scenario.product ? "prod_preview" : undefined}
            />
          </div>
        </QueryClientProvider>
      </MemoryRouter>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Preview />
  </StrictMode>,
);
