import { useCallback, useEffect, useMemo, type Dispatch, type SetStateAction } from "react";
import type { AuthFileItem } from "@/lib/http/types";
import {
  AUTH_FILES_PAGE_SIZE,
  authFilesSortCollator,
  hasAuthFileProblem,
  isAuthFilesSortMode,
  normalizeProviderKey,
  resolveAuthFilePriority,
  resolveAuthFileSortKey,
  resolveFileType,
  type AuthFilesSortMode,
} from "@/modules/auth-files/helpers/authFilesPageUtils";
import { isRuntimeOnlyAuthFile } from "@/modules/auth-files/helpers/authFilesPageUtils";

interface UseAuthFilesListStateOptions {
  files: AuthFileItem[];
  filter: string;
  problemOnly: boolean;
  disabledOnly: boolean;
  search: string;
  sortMode: AuthFilesSortMode;
  page: number;
  setPage: Dispatch<SetStateAction<number>>;
  selectedFileNames: string[];
  setSelectedFileNames: Dispatch<SetStateAction<string[]>>;
}

const escapeWildcardSearchSegment = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const buildWildcardSearch = (value: string): RegExp | null => {
  if (!value.includes("*")) return null;
  return new RegExp(value.split("*").map(escapeWildcardSearchSegment).join(".*"), "i");
};

export function useAuthFilesListState({
  files,
  filter,
  problemOnly,
  disabledOnly,
  search,
  sortMode,
  page,
  setPage,
  selectedFileNames,
  setSelectedFileNames,
}: UseAuthFilesListStateOptions) {
  const providerOptions = useMemo(() => {
    const set = new Set<string>();
    files.forEach((file) => set.add(resolveFileType(file)));
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [files]);

  const statusCounts = useMemo(
    () => ({
      problem: files.filter((file) => hasAuthFileProblem(file)).length,
      disabled: files.filter((file) => file.disabled === true).length,
    }),
    [files],
  );

  const searchFilteredFiles = useMemo(() => {
    const q = search.trim().toLowerCase();
    const wildcardSearch = buildWildcardSearch(search.trim());
    return files.filter((file) => {
      if (!q) return true;
      const values = [
        file.name,
        file.label,
        file.email,
        file.account,
        file.provider,
        file.type,
        ...((Array.isArray(file.display_tags) ? file.display_tags : []) as unknown[]),
        ...((Array.isArray(file.custom_tags) ? file.custom_tags : []) as unknown[]),
      ].map((value) => String(value ?? ""));
      return values.some((value) =>
        wildcardSearch ? wildcardSearch.test(value) : value.toLowerCase().includes(q),
      );
    });
  }, [files, search]);

  const statusFilteredFiles = useMemo(
    () =>
      searchFilteredFiles.filter((file) => {
        if (problemOnly && !hasAuthFileProblem(file)) return false;
        if (disabledOnly && file.disabled !== true) return false;
        return true;
      }),
    [disabledOnly, problemOnly, searchFilteredFiles],
  );

  const filterCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    statusFilteredFiles.forEach((file) => {
      const typeKey = normalizeProviderKey(resolveFileType(file));
      counts[typeKey] = (counts[typeKey] ?? 0) + 1;
    });
    return { total: statusFilteredFiles.length, counts };
  }, [statusFilteredFiles]);

  const filteredFiles = useMemo(() => {
    const normalizedFilter = normalizeProviderKey(filter);
    const scoped =
      !normalizedFilter || normalizedFilter === "all"
        ? statusFilteredFiles
        : statusFilteredFiles.filter(
            (file) => normalizeProviderKey(resolveFileType(file)) === normalizedFilter,
          );
    return [...scoped].sort((a, b) =>
      isAuthFilesSortMode(sortMode) && sortMode === "priority"
        ? resolveAuthFilePriority(b) - resolveAuthFilePriority(a) ||
          authFilesSortCollator.compare(resolveAuthFileSortKey(a), resolveAuthFileSortKey(b))
        : authFilesSortCollator.compare(resolveAuthFileSortKey(a), resolveAuthFileSortKey(b)),
    );
  }, [filter, sortMode, statusFilteredFiles]);

  const totalPages = Math.max(1, Math.ceil(filteredFiles.length / AUTH_FILES_PAGE_SIZE));
  const safePage = Math.min(totalPages, Math.max(1, page));

  const pageItems = useMemo(() => {
    const start = (safePage - 1) * AUTH_FILES_PAGE_SIZE;
    return filteredFiles.slice(start, start + AUTH_FILES_PAGE_SIZE);
  }, [filteredFiles, safePage]);

  const selectableFilteredFiles = useMemo(
    () => filteredFiles.filter((file) => !isRuntimeOnlyAuthFile(file)),
    [filteredFiles],
  );
  const selectablePageFiles = useMemo(
    () => pageItems.filter((file) => !isRuntimeOnlyAuthFile(file)),
    [pageItems],
  );
  const selectableFilteredNameSet = useMemo(
    () => new Set(selectableFilteredFiles.map((file) => file.name)),
    [selectableFilteredFiles],
  );
  const selectablePageNames = useMemo(
    () => selectablePageFiles.map((file) => file.name),
    [selectablePageFiles],
  );
  const selectedFileNameSet = useMemo(() => new Set(selectedFileNames), [selectedFileNames]);
  const selectedCount = selectedFileNames.length;

  const allPageSelected =
    selectablePageNames.length > 0 &&
    selectablePageNames.every((name) => selectedFileNameSet.has(name));
  const somePageSelected =
    !allPageSelected && selectablePageNames.some((name) => selectedFileNameSet.has(name));
  const allFilteredSelected =
    selectableFilteredFiles.length > 0 &&
    selectableFilteredFiles.every((file) => selectedFileNameSet.has(file.name));

  useEffect(() => {
    if (safePage !== page) setPage(safePage);
  }, [page, safePage, setPage]);

  useEffect(() => {
    setSelectedFileNames((prev) => prev.filter((name) => selectableFilteredNameSet.has(name)));
  }, [selectableFilteredNameSet, setSelectedFileNames]);

  const toggleFileSelection = useCallback(
    (name: string, checked: boolean) => {
      setSelectedFileNames((prev) => {
        const next = new Set(prev);
        if (checked) next.add(name);
        else next.delete(name);
        return Array.from(next);
      });
    },
    [setSelectedFileNames],
  );

  const selectCurrentPage = useCallback(
    (checked: boolean) => {
      setSelectedFileNames((prev) => {
        const next = new Set(prev);
        selectablePageNames.forEach((name) => {
          if (checked) next.add(name);
          else next.delete(name);
        });
        return Array.from(next);
      });
    },
    [selectablePageNames, setSelectedFileNames],
  );

  const selectFilteredFiles = useCallback(
    (checked: boolean) => {
      setSelectedFileNames((prev) => {
        const next = new Set(prev);
        selectableFilteredFiles.forEach((file) => {
          if (checked) next.add(file.name);
          else next.delete(file.name);
        });
        return Array.from(next);
      });
    },
    [selectableFilteredFiles, setSelectedFileNames],
  );

  return {
    providerOptions,
    statusCounts,
    filterCounts,
    filteredFiles,
    totalPages,
    safePage,
    pageItems,
    selectableFilteredFiles,
    selectablePageNames,
    selectedFileNameSet,
    selectedCount,
    allPageSelected,
    somePageSelected,
    allFilteredSelected,
    toggleFileSelection,
    selectCurrentPage,
    selectFilteredFiles,
  };
}
