import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { apiCallApi, getApiCallErrorMessage } from "@/lib/http/apis";
import type { ApiCallResult, OpenAIProvider } from "@/lib/http/types";
import { useToast } from "@/modules/ui/ToastProvider";
import { keyValueEntriesToRecord } from "@/modules/providers/KeyValueInputList";
import { createEmptyModelEntry } from "@/modules/providers/ModelInputList";
import {
  buildModelsEndpoint,
  buildOpenAIDraft,
  commitModelEntries,
  normalizeDiscoveredModels,
  type OpenAIDraft,
} from "@/modules/providers/providers-helpers";

// Editor for a single OpenAI-compatible provider channel (BigModel Coding,
// iFlytek Astron, etc.). Unlike the generic OpenAI tab, these channels hold
// exactly one provider with a backend-pinned name, so we keep a single draft.

export interface SingleProviderApi {
  get: () => Promise<OpenAIProvider | null>;
  save: (provider: OpenAIProvider) => Promise<unknown>;
  clear: () => Promise<unknown>;
}

interface UseSingleOpenAIProviderEditorArgs {
  fixedName: string;
  api: SingleProviderApi;
  refreshAll: () => Promise<void>;
  startRefreshTransition: (action: () => void) => void;
  afterClose: () => void;
}

export function useSingleOpenAIProviderEditor({
  fixedName,
  api,
  refreshAll,
  startRefreshTransition,
  afterClose,
}: UseSingleOpenAIProviderEditorArgs) {
  const { t } = useTranslation();
  const { notify } = useToast();
  const [provider, setProvider] = useState<OpenAIProvider | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [editIndex, setEditIndex] = useState<number | null>(null);
  const [draft, setDraft] = useState<OpenAIDraft>(() => buildOpenAIDraft(null));
  const [draftError, setDraftError] = useState<string | null>(null);
  const [discoveredModels, setDiscoveredModels] = useState<{ id: string; owned_by?: string }[]>([]);
  const [discovering, setDiscovering] = useState(false);
  const [discoverSelected, setDiscoverSelected] = useState<Set<string>>(new Set());

  const closeEditor = useCallback(() => {
    setEditOpen(false);
    afterClose();
  }, [afterClose]);

  const openEditor = useCallback(() => {
    // Report index 0 so the shared modal renders "edit" copy for this
    // single-provider channel rather than the generic "add" title.
    setEditIndex(0);
    // Pin the provider name so the backend sanitizer keeps it stable.
    setDraft(buildOpenAIDraft(provider ?? null, fixedName));
    setDraftError(null);
    setDiscoveredModels([]);
    setDiscoverSelected(new Set());
    setEditOpen(true);
  }, [fixedName, provider]);

  const load = useCallback(async () => {
    try {
      const next = await api.get();
      setProvider(next);
    } catch (err: unknown) {
      notify({
        type: "error",
        message: err instanceof Error ? err.message : t("providers.load_failed"),
      });
    }
  }, [api, notify, t]);

  const commitDraft = useCallback((): OpenAIProvider | null => {
    const baseUrl = draft.baseUrl.trim();
    if (!baseUrl) {
      setDraftError(t("providers.base_url_error"));
      return null;
    }

    const headers = keyValueEntriesToRecord(draft.headersEntries);
    const priorityText = draft.priorityText.trim();
    const priority = priorityText !== "" ? Number(priorityText) : undefined;
    if (priority !== undefined && !Number.isFinite(priority)) {
      setDraftError(t("providers.priority_error"));
      return null;
    }

    const apiKeyEntries = draft.apiKeyEntries
      .map((entry) => {
        const apiKey = entry.apiKey.trim();
        if (!apiKey) return null;
        const entryHeaders = keyValueEntriesToRecord(entry.headersEntries);
        const proxyUrl = entry.proxyUrl.trim();
        const proxyId = entry.proxyId.trim();
        return {
          apiKey,
          ...(entry.disabled ? { disabled: true } : {}),
          ...(proxyUrl ? { proxyUrl } : {}),
          ...(proxyId ? { proxyId } : {}),
          ...(entryHeaders ? { headers: entryHeaders } : {}),
        };
      })
      .filter(Boolean) as OpenAIProvider["apiKeyEntries"];

    if (!apiKeyEntries || apiKeyEntries.length === 0) {
      setDraftError(t("providers.key_entry_error"));
      return null;
    }

    const modelCommit = commitModelEntries(draft.modelEntries);
    if (modelCommit.error) {
      setDraftError(modelCommit.error);
      return null;
    }

    setDraftError(null);

    return {
      name: fixedName,
      ...(draft.disabled ? { disabled: true } : {}),
      baseUrl,
      ...(draft.prefix.trim() ? { prefix: draft.prefix.trim() } : {}),
      ...(draft.identityFingerprint.trim()
        ? { identityFingerprint: draft.identityFingerprint.trim() }
        : {}),
      ...(headers ? { headers } : {}),
      ...(priority !== undefined ? { priority } : {}),
      ...(draft.testModel.trim() ? { testModel: draft.testModel.trim() } : {}),
      ...(modelCommit.models ? { models: modelCommit.models } : {}),
      apiKeyEntries,
    };
  }, [draft, fixedName, t]);

  const saveDraft = useCallback(async () => {
    try {
      const value = commitDraft();
      if (!value) return;
      setProvider(value);
      await api.save(value);
      notify({ type: "success", message: t("providers.saved") });
      closeEditor();
      startRefreshTransition(() => void refreshAll());
    } catch (err: unknown) {
      notify({
        type: "error",
        message: err instanceof Error ? err.message : t("providers.save_failed"),
      });
    }
  }, [api, closeEditor, commitDraft, notify, refreshAll, setProvider, startRefreshTransition, t]);

  const deleteChannel = useCallback(async () => {
    try {
      await api.clear();
      setProvider(null);
      notify({ type: "success", message: t("providers.deleted") });
    } catch (err: unknown) {
      notify({
        type: "error",
        message: err instanceof Error ? err.message : t("providers.delete_failed"),
      });
    }
  }, [api, notify, setProvider, t]);

  const toggleEnabled = useCallback(
    async (enabled: boolean) => {
      if (!provider) return;
      const next: OpenAIProvider = {
        ...provider,
        ...(enabled ? { disabled: undefined } : { disabled: true }),
      } as OpenAIProvider;
      setProvider(next);
      try {
        await api.save(next);
        notify({
          type: "success",
          message: enabled ? t("providers.toggle_enabled") : t("providers.toggle_disabled"),
        });
        startRefreshTransition(() => void refreshAll());
      } catch (err: unknown) {
        setProvider(provider);
        notify({
          type: "error",
          message: err instanceof Error ? err.message : t("providers.update_failed"),
        });
      }
    },
    [api, notify, provider, refreshAll, setProvider, startRefreshTransition, t],
  );

  const toggleKeyEntryEnabled = useCallback(
    async (entryIndex: number, enabled: boolean) => {
      if (!provider) return;
      const next: OpenAIProvider = {
        ...provider,
        apiKeyEntries: (provider.apiKeyEntries ?? []).map((keyEntry, keyIndex) =>
          keyIndex === entryIndex
            ? { ...keyEntry, ...(enabled ? { disabled: undefined } : { disabled: true }) }
            : keyEntry,
        ),
      };
      setProvider(next);
      try {
        await api.save(next);
        notify({
          type: "success",
          message: enabled ? t("providers.toggle_enabled") : t("providers.toggle_disabled"),
        });
        startRefreshTransition(() => void refreshAll());
      } catch (err: unknown) {
        setProvider(provider);
        notify({
          type: "error",
          message: err instanceof Error ? err.message : t("providers.update_failed"),
        });
      }
    },
    [api, notify, provider, refreshAll, setProvider, startRefreshTransition, t],
  );

  const discoverModels = useCallback(async () => {
    const baseUrl = draft.baseUrl.trim();
    if (!baseUrl) {
      notify({ type: "info", message: t("providers.fill_base_url_first") });
      return;
    }

    setDiscovering(true);
    setDiscoveredModels([]);
    setDiscoverSelected(new Set());
    try {
      const endpoint = buildModelsEndpoint(baseUrl);
      const providerHeaders = keyValueEntriesToRecord(draft.headersEntries) ?? {};
      const firstEntry = draft.apiKeyEntries.find((entry) => entry.apiKey.trim());
      const keyHeaders = firstEntry
        ? (keyValueEntriesToRecord(firstEntry.headersEntries) ?? {})
        : {};

      const headers: Record<string, string> = { ...providerHeaders, ...keyHeaders };
      const hasAuthHeader = Boolean(
        headers.Authorization || (headers as Record<string, unknown>).authorization,
      );
      const firstKey = firstEntry?.apiKey.trim();
      if (!hasAuthHeader && firstKey) {
        headers.Authorization = `Bearer ${firstKey}`;
      }

      const result: ApiCallResult = await apiCallApi.request({
        method: "GET",
        url: endpoint,
        header: Object.keys(headers).length ? headers : undefined,
      });
      if (result.statusCode < 200 || result.statusCode >= 300) {
        throw new Error(getApiCallErrorMessage(result));
      }
      const list = normalizeDiscoveredModels(result.body ?? result.bodyText);
      setDiscoveredModels(list);
      setDiscoverSelected(new Set(list.map((model) => model.id)));
    } catch (err: unknown) {
      notify({
        type: "error",
        message: err instanceof Error ? err.message : t("providers.fetch_models_failed"),
      });
    } finally {
      setDiscovering(false);
    }
  }, [draft.apiKeyEntries, draft.baseUrl, draft.headersEntries, notify, t]);

  const applyDiscoveredModels = useCallback(() => {
    const selected = new Set(discoverSelected);
    const picked = discoveredModels.filter((model) => selected.has(model.id));
    if (picked.length === 0) {
      notify({ type: "info", message: t("providers.no_models_selected") });
      return;
    }

    const current = draft.modelEntries;
    const seen = new Set(current.map((model) => model.name.trim().toLowerCase()).filter(Boolean));
    const merged = [...current];
    for (const model of picked) {
      const key = model.id.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push({ ...createEmptyModelEntry(), name: model.id });
    }

    setDraft((prev) => ({ ...prev, modelEntries: merged }));
    notify({ type: "success", message: t("providers.models_merged") });
  }, [discoverSelected, discoveredModels, draft.modelEntries, notify, setDraft, t]);

  return {
    provider,
    setProvider,
    editOpen,
    editIndex,
    draft,
    setDraft,
    draftError,
    discoveredModels,
    discovering,
    discoverSelected,
    setDiscoverSelected,
    load,
    closeEditor,
    openEditor,
    saveDraft,
    deleteChannel,
    toggleEnabled,
    toggleKeyEntryEnabled,
    discoverModels,
    applyDiscoveredModels,
  };
}
