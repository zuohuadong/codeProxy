import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import i18n from "@/i18n";
import { SystemPage } from "@/modules/system/SystemPage";
import { ThemeProvider } from "@/modules/ui/ThemeProvider";
import { ToastProvider } from "@/modules/ui/ToastProvider";

const mocks = vi.hoisted(() => ({
  apiGet: vi.fn(),
}));

vi.mock("@/lib/http/client", () => ({
  apiClient: {
    get: mocks.apiGet,
  },
}));

vi.mock("@/modules/auth/AuthProvider", () => ({
  useAuth: () => ({
    state: {
      apiBase: "http://localhost:8317",
      serverVersion: "main-1111111",
      serverBuildDate: "2026-04-16T08:00:00Z",
    },
    meta: {
      managementEndpoint: "/v0/management",
    },
  }),
}));

function renderPage() {
  return render(
    <ThemeProvider>
      <ToastProvider>
        <SystemPage />
      </ToastProvider>
    </ThemeProvider>,
  );
}

describe("SystemPage", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("en");
    window.localStorage.clear();
    mocks.apiGet.mockImplementation((path: string) => {
      if (path === "/model-path-availability") return Promise.resolve({ data: [] });
      if (path === "/model-configs?scope=library") return Promise.resolve({ data: [] });
      if (path === "/auth-files") return Promise.resolve({ files: [] });
      if (
        path === "/gemini-api-key" ||
        path === "/claude-api-key" ||
        path === "/codex-api-key" ||
        path === "/vertex-api-key" ||
        path === "/openai-compatibility"
      ) {
        return Promise.resolve([]);
      }
      if (path === "/system-stats") return Promise.resolve({ uptime: 10 });
      return Promise.resolve({});
    });
  });

  test("shows only default root v1 model discovery results", async () => {
    mocks.apiGet.mockImplementation((path: string) => {
      if (path === "/model-path-availability") {
        return Promise.resolve({
          data: [
            {
              id: "gpt-root-model",
              paths: [{ scope: "root", method: "GET", path: "/v1/models" }],
            },
            {
              id: "gpt-group-only",
              paths: [{ scope: "group", method: "GET", path: "/team-a/v1/models" }],
            },
            {
              id: "gemini-v1beta-only",
              paths: [{ scope: "root", method: "GET", path: "/v1beta/models" }],
            },
          ],
        });
      }
      if (path === "/system-stats") return Promise.resolve({ uptime: 10 });
      return Promise.resolve({});
    });

    renderPage();

    expect(await screen.findByText("gpt-root-model")).toBeInTheDocument();
    expect(screen.queryByText("gpt-group-only")).not.toBeInTheDocument();
    expect(screen.queryByText("gemini-v1beta-only")).not.toBeInTheDocument();
    expect(mocks.apiGet).toHaveBeenCalledWith("/model-path-availability");
  });
});
