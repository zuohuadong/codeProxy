import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { ProvidersPage } from "@/modules/providers/ProvidersPage";
import { ThemeProvider } from "@/modules/ui/ThemeProvider";
import { ToastProvider } from "@/modules/ui/ToastProvider";

const mocks = vi.hoisted(() => ({
  getGeminiKeys: vi.fn(async () => []),
  getClaudeConfigs: vi.fn(async () => []),
  getCodexConfigs: vi.fn(async () => []),
  getOpenAIProviders: vi.fn(async () => []),
  getBigModelCodingProvider: vi.fn(async () => null),
  getAstronCodeProvider: vi.fn(async () => null),
  saveBigModelCodingProvider: vi.fn(async (_provider: unknown) => ({})),
  clearBigModelCodingProvider: vi.fn(async () => ({})),
  getEntityStats: vi.fn(async () => ({ source: [] })),
  apiKeyEntriesList: vi.fn(async () => []),
  channelGroupsList: vi.fn(async () => []),
  proxiesList: vi.fn(async (): Promise<any[]> => []),
}));

vi.mock("@/lib/http/apis", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/lib/http/apis")>();
  return {
    ...mod,
    providersApi: {
      ...mod.providersApi,
      getGeminiKeys: mocks.getGeminiKeys,
      getClaudeConfigs: mocks.getClaudeConfigs,
      getCodexConfigs: mocks.getCodexConfigs,
      getOpenAIProviders: mocks.getOpenAIProviders,
      getBigModelCodingProvider: mocks.getBigModelCodingProvider,
      getAstronCodeProvider: mocks.getAstronCodeProvider,
      saveBigModelCodingProvider: mocks.saveBigModelCodingProvider,
      clearBigModelCodingProvider: mocks.clearBigModelCodingProvider,
    },
    usageApi: {
      ...mod.usageApi,
      getEntityStats: mocks.getEntityStats,
    },
  };
});

vi.mock("@/lib/http/apis/api-keys", () => ({
  apiKeyEntriesApi: {
    list: mocks.apiKeyEntriesList,
  },
}));

vi.mock("@/lib/http/apis/channel-groups", () => ({
  channelGroupsApi: {
    list: mocks.channelGroupsList,
  },
}));

vi.mock("@/lib/http/apis/proxies", () => ({
  proxiesApi: {
    list: mocks.proxiesList,
  },
}));

function renderProvidersPage(initialPath = "/ai-providers/bigmodel") {
  return render(
    <ThemeProvider>
      <ToastProvider>
        <MemoryRouter initialEntries={[initialPath]}>
          <Routes>
            <Route path="/ai-providers" element={<ProvidersPage />} />
            <Route path="/ai-providers/:provider" element={<ProvidersPage />} />
            <Route path="/ai-providers/:provider/:action" element={<ProvidersPage />} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    </ThemeProvider>,
  );
}

describe("ProvidersPage BigModel tab", () => {
  afterEach(() => cleanup());

  beforeEach(() => {
    mocks.getGeminiKeys.mockReset();
    mocks.getClaudeConfigs.mockReset();
    mocks.getCodexConfigs.mockReset();
    mocks.getOpenAIProviders.mockReset();
    mocks.getBigModelCodingProvider.mockReset();
    mocks.getAstronCodeProvider.mockReset();
    mocks.saveBigModelCodingProvider.mockReset();
    mocks.clearBigModelCodingProvider.mockReset();
    mocks.getEntityStats.mockReset();
    mocks.apiKeyEntriesList.mockReset();
    mocks.channelGroupsList.mockReset();
    mocks.proxiesList.mockReset();

    mocks.getGeminiKeys.mockImplementation(async () => []);
    mocks.getClaudeConfigs.mockImplementation(async () => []);
    mocks.getCodexConfigs.mockImplementation(async () => []);
    mocks.getOpenAIProviders.mockImplementation(async () => []);
    mocks.getBigModelCodingProvider.mockImplementation(async () => null);
    mocks.getAstronCodeProvider.mockImplementation(async () => null);
    mocks.saveBigModelCodingProvider.mockImplementation(async () => ({}));
    mocks.clearBigModelCodingProvider.mockImplementation(async () => ({}));
    mocks.getEntityStats.mockImplementation(async () => ({ source: [] }));
    mocks.apiKeyEntriesList.mockImplementation(async () => []);
    mocks.channelGroupsList.mockImplementation(async () => []);
    mocks.proxiesList.mockImplementation(async () => []);
  });

  test("shows the BigModel tab and empty state", async () => {
    renderProvidersPage("/ai-providers/bigmodel");
    await waitFor(() => {
      expect(screen.getByRole("tab", { name: /BigModel/i })).toBeInTheDocument();
    });
    // The empty-state copy from the shared OpenAIProvidersTab component.
    await waitFor(() => {
      expect(screen.getByText(/No OpenAI providers/i)).toBeInTheDocument();
    });
  });

  test("loads an existing BigModel provider and displays the masked key", async () => {
    mocks.getBigModelCodingProvider.mockImplementation(
      async () =>
        ({
          name: "bigmodel-coding",
          baseUrl: "https://open.bigmodel.cn/api/coding/paas/v4",
          apiKeyEntries: [{ apiKey: "sk-bigmodel-1234567890abcdef" }],
          models: [{ name: "glm-5.1", alias: "gpt-5.3-codex" }],
          identityFingerprint: "codex",
        }) as any,
    );

    renderProvidersPage("/ai-providers/bigmodel");
    await waitFor(() => {
      expect(screen.getByText("bigmodel-coding")).toBeInTheDocument();
    });
    // masked key rendered by the shared tab
    await waitFor(() => {
      expect(screen.getByText(/sk-big\*\*\*cdef/)).toBeInTheDocument();
    });
  });

  test("clears the BigModel channel via the delete confirm flow", async () => {
    const user = userEvent.setup();
    mocks.getBigModelCodingProvider.mockImplementation(
      async () =>
        ({
          name: "bigmodel-coding",
          baseUrl: "https://open.bigmodel.cn/api/coding/paas/v4",
          apiKeyEntries: [{ apiKey: "sk-bigmodel-1234567890abcdef" }],
        }) as any,
    );

    renderProvidersPage("/ai-providers/bigmodel");
    // Open the confirm modal from the card's delete button.
    const cardButtons = await screen.findAllByRole("button", { name: /delete/i });
    await user.click(cardButtons[cardButtons.length - 1]);

    // The confirm modal renders within a dialog; pick the confirm button there.
    const dialog = await screen.findByRole("dialog");
    const dialogConfirm = await waitFor(() => {
      const btns = within(dialog).getAllByRole("button");
      const confirm = btns.find((b) => /^delete$/i.test(b.textContent?.trim() ?? ""));
      if (!confirm) throw new Error("confirm button not found in dialog");
      return confirm;
    });
    await user.click(dialogConfirm);

    await waitFor(() => {
      expect(mocks.clearBigModelCodingProvider).toHaveBeenCalledTimes(1);
    });
  });
});
