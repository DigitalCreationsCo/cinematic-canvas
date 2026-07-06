import { KeyboardEvent, useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useCreateLoreProject,
  useRecentRepositories,
  useRepositorySearch,
  useRepositoryTagsRecent,
  useRepositoryTagsSearch,
} from "@/controllers/API/queries/nap";
import { useCustomNavigate } from "@/customization/hooks/use-custom-navigate";
import { track } from "@/customization/utils/analytics";
import { useDebounce } from "@/hooks/use-debounce";
import useAlertStore from "@/stores/alertStore";
import type {
  NapRepositoryRead,
  RepositorySelection as RepositorySelectionType,
} from "@/types/nap";
import { slugify } from "@/utils/stringManipulation";
import BaseModal from "../baseModal";

interface NewProjectModalProps {
  open: boolean;
  setOpen: (open: boolean) => void;
}

type RepositorySelection =
  | { mode: "existing"; name: string; source: "recent" | "search"; id: string }
  | { mode: "new"; name: string }
  | null;

export default function NewProjectModal({
  open,
  setOpen,
}: NewProjectModalProps) {
  const [projectName, setProjectName] = useState("");
  const [projectDescription, setProjectDescription] = useState("");
  const [projectNameError, setProjectNameError] = useState("");
  const [loading, setLoading] = useState(false);

  // Repository selection state
  const [repositorySelection, setRepositorySelection] =
    useState<RepositorySelection>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("");
  const [isSearchActive, setIsSearchActive] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Tag selection state — only relevant once an existing repository is chosen
  const [selectedTag, setSelectedTag] = useState<string>("latest");
  const [tagSearchQuery, setTagSearchQuery] = useState("");
  const [debouncedTagSearchQuery, setDebouncedTagSearchQuery] = useState("");
  const [isTagSearchActive, setIsTagSearchActive] = useState(false);
  const [tagHighlightedIndex, setTagHighlightedIndex] = useState(-1);
  const tagSearchInputRef = useRef<HTMLInputElement>(null);
  const tagDropdownRef = useRef<HTMLDivElement>(null);

  const navigate = useCustomNavigate();
  const setErrorData = useAlertStore((state) => state.setErrorData);
  const setSuccessData = useAlertStore((state) => state.setSuccessData);

  // Fetch recent repositories
  const {
    data: recentRepos,
    isLoading: recentLoading,
    error: recentError,
    refetch: refetchRecent,
  } = useRecentRepositories({ limit: 3 });

  // Debounced search
  const debouncedSetSearchQuery = useDebounce(setDebouncedSearchQuery, 300);

  useEffect(() => {
    debouncedSetSearchQuery(searchQuery);
  }, [searchQuery, debouncedSetSearchQuery]);

  const { data: searchResults, isLoading: searchLoading } = useRepositorySearch(
    { q: debouncedSearchQuery },
    { enabled: !!debouncedSearchQuery && isSearchActive },
  );

  const { mutateAsync: createProject } = useCreateLoreProject();

  // Tag selection only applies once an existing repository is selected —
  // a brand-new repository has no tags or commits yet.
  const selectedRepoId =
    repositorySelection?.mode === "existing"
      ? repositorySelection.id
      : undefined;

  const {
    data: recentTags,
    isLoading: recentTagsLoading,
    error: recentTagsError,
    refetch: refetchRecentTags,
  } = useRepositoryTagsRecent(
    { repositoryId: selectedRepoId ?? "", limit: 3 },
    { enabled: !!selectedRepoId },
  );

  const debouncedSetTagSearchQuery = useDebounce(
    setDebouncedTagSearchQuery,
    300,
  );

  useEffect(() => {
    debouncedSetTagSearchQuery(tagSearchQuery);
  }, [tagSearchQuery, debouncedSetTagSearchQuery]);

  const { data: tagSearchResults, isLoading: tagSearchLoading } =
    useRepositoryTagsSearch(
      { repositoryId: selectedRepoId ?? "", q: debouncedTagSearchQuery },
      {
        enabled:
          !!selectedRepoId && !!debouncedTagSearchQuery && isTagSearchActive,
      },
    );

  // Tag choice is repo-specific — reset it whenever the selected
  // repository changes (including switching to "new" or clearing).
  useEffect(() => {
    setSelectedTag("latest");
    setTagSearchQuery("");
    setIsTagSearchActive(false);
    setTagHighlightedIndex(-1);
  }, [selectedRepoId]);

  useEffect(() => {
    if (isSearchActive && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [isSearchActive]);

  useEffect(() => {
    if (isTagSearchActive && tagSearchInputRef.current) {
      tagSearchInputRef.current.focus();
    }
  }, [isTagSearchActive]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node) &&
        searchInputRef.current &&
        !searchInputRef.current.contains(event.target as Node)
      ) {
        setIsSearchActive(false);
        setHighlightedIndex(-1);
      }
    };

    if (isSearchActive) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isSearchActive]);

  useEffect(() => {
    const handleClickOutsideTag = (event: MouseEvent) => {
      if (
        tagDropdownRef.current &&
        !tagDropdownRef.current.contains(event.target as Node) &&
        tagSearchInputRef.current &&
        !tagSearchInputRef.current.contains(event.target as Node)
      ) {
        setIsTagSearchActive(false);
        setTagHighlightedIndex(-1);
      }
    };

    if (isTagSearchActive) {
      document.addEventListener("mousedown", handleClickOutsideTag);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutsideTag);
    };
  }, [isTagSearchActive]);

  // Reset state when modal opens/closes
  useEffect(() => {
    if (!open) {
      setProjectName("");
      setProjectDescription("");
      setProjectNameError("");
      setRepositorySelection(null);
      setSearchQuery("");
      setIsSearchActive(false);
      setHighlightedIndex(-1);
      setSelectedTag("latest");
      setTagSearchQuery("");
      setIsTagSearchActive(false);
      setTagHighlightedIndex(-1);
    }
  }, [open]);

  const getRecentRepoIds = () => {
    return recentRepos?.map((repo) => repo.id) || [];
  };

  const getFilteredSearchResults = () => {
    const recentIds = getRecentRepoIds();
    return searchResults?.filter((repo) => !recentIds.includes(repo.id)) || [];
  };

  const getRecentTagNames = () => {
    return recentTags?.map((tag) => tag.name) || [];
  };

  const getFilteredTagSearchResults = () => {
    const recentNames = getRecentTagNames();
    return (
      tagSearchResults?.filter((tag) => !recentNames.includes(tag.name)) || []
    );
  };

  const handleSelectTag = (tagName: string) => {
    setSelectedTag(tagName);
    setTagSearchQuery("");
    setIsTagSearchActive(false);
    setTagHighlightedIndex(-1);
  };

  const handleTagSearchKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    const results = getFilteredTagSearchResults();

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setTagHighlightedIndex((prev) =>
        prev < results.length - 1 ? prev + 1 : prev,
      );
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setTagHighlightedIndex((prev) => (prev > 0 ? prev - 1 : -1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (tagHighlightedIndex >= 0 && tagHighlightedIndex < results.length) {
        handleSelectTag(results[tagHighlightedIndex].name);
      }
    } else if (e.key === "Escape") {
      setIsTagSearchActive(false);
      setTagHighlightedIndex(-1);
    }
  };

  const findExistingRepoByName = (name: string): NapRepositoryRead | null => {
    const slug = slugify(name);
    // Check recent repos
    const recentMatch = recentRepos?.find(
      (repo) => repo.name.toLowerCase() === slug,
    );
    if (recentMatch) return recentMatch;
    // Check search results
    const searchMatch = searchResults?.find(
      (repo) => repo.name.toLowerCase() === slug,
    );
    return searchMatch || null;
  };

  const handleSelectRecentRepo = (repo: NapRepositoryRead) => {
    setRepositorySelection({
      mode: "existing",
      name: repo.name,
      source: "recent",
      id: repo.id,
    });
    setSearchQuery("");
  };

  const handleSelectSearchRepo = (repo: NapRepositoryRead) => {
    setRepositorySelection({
      mode: "existing",
      name: repo.name,
      source: "search",
      id: repo.id,
    });
    setSearchQuery("");
    setIsSearchActive(false);
  };

  const handleCreateNewRepo = (name: string) => {
    const slug = slugify(name);
    // Check if a repo with this name already exists (case-insensitive)
    const existingRepo = findExistingRepoByName(name);
    if (existingRepo) {
      // Link to existing repo instead of creating duplicate
      setRepositorySelection({
        mode: "existing",
        name: existingRepo.name,
        source: "search",
        id: existingRepo.id,
      });
    } else {
      // Create new repo
      setRepositorySelection({
        mode: "new",
        name: slug,
      });
    }
    setSearchQuery("");
    setIsSearchActive(false);
  };

  const handleSearchInputChange = (value: string) => {
    setSearchQuery(value);
    setHighlightedIndex(-1);
  };

  const handleSearchKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    const filteredResults = getFilteredSearchResults();
    const hasCreateOption = searchQuery.trim() !== "";
    const totalOptions = filteredResults.length + (hasCreateOption ? 1 : 0);

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightedIndex((prev) =>
        prev < totalOptions - 1 ? prev + 1 : prev,
      );
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : -1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (highlightedIndex >= 0 && highlightedIndex < filteredResults.length) {
        handleSelectSearchRepo(filteredResults[highlightedIndex]);
      } else if (
        hasCreateOption &&
        highlightedIndex === filteredResults.length
      ) {
        handleCreateNewRepo(searchQuery);
      }
    } else if (e.key === "Escape") {
      setIsSearchActive(false);
      setHighlightedIndex(-1);
    }
  };

  const handleProjectNameBlur = () => {
    if (!projectName.trim()) {
      setProjectNameError("Enter a project name.");
    } else {
      setProjectNameError("");
    }
  };

  const isFormValid = () => {
    return projectName.trim() !== "" && repositorySelection !== null;
  };

  const getDisableReason = () => {
    if (!projectName.trim()) {
      return "Enter a project name.";
    }
    if (!repositorySelection) {
      return recentError
        ? "Couldn't load repositories. Please retry or type a new repository name."
        : "Select or create a repository.";
    }
    return "";
  };

  const handleCreate = async () => {
    if (!isFormValid()) return;

    setLoading(true);
    try {
      track("Create New Project", { name: projectName });

      let repositoryPayload: RepositorySelectionType | undefined;
      if (repositorySelection?.mode === "existing") {
        repositoryPayload = {
          mode: "existing" as const,
          repository_id: repositorySelection.id,
          tag: selectedTag,
        };
      } else if (repositorySelection?.mode === "new") {
        repositoryPayload = {
          mode: "new" as const,
          name: repositorySelection.name,
        };
      }

      if (!repositoryPayload) return;

      const response = await createProject({
        data: {
          name: projectName,
          description: projectDescription,
          repository: repositoryPayload,
        },
      });

      setSuccessData({
        title:
          response.mode === "created"
            ? "Project and repository created successfully."
            : "Project created, existing repository linked.",
      });
      navigate(`/all/folder/${response.folder.id}`);
      setOpen(false);
    } catch (err: any) {
      setErrorData({
        title: "Error creating project.",
        list: [err?.response?.data?.detail ?? err?.message ?? "Unknown error"],
      });
    } finally {
      setLoading(false);
    }
  };

  const getOutcomeHint = () => {
    if (!repositorySelection) return null;
    if (repositorySelection.mode === "existing") {
      return selectedTag === "latest"
        ? "Links to the existing repository, pinned to its latest commit."
        : `Links to the existing repository, pinned to the latest commit on tag "${selectedTag}".`;
    }
    return `Creates a new repository "${repositorySelection.name}" on lore-server.`;
  };

  const filteredSearchResults = getFilteredSearchResults();
  const hasCreateOption = searchQuery.trim() !== "";
  const totalOptions = filteredSearchResults.length + (hasCreateOption ? 1 : 0);
  const filteredTagSearchResults = getFilteredTagSearchResults();

  return (
    <BaseModal open={open} setOpen={setOpen} size="medium">
      <BaseModal.Header description="Create a new project and link or create a repository.">
        New Project
      </BaseModal.Header>
      <BaseModal.Content className="flex flex-col gap-6 p-6">
        <div className="space-y-6">
          {/* Project Name */}
          <div className="space-y-2">
            <Label htmlFor="project-name">Project Name</Label>
            <Input
              id="project-name"
              placeholder="Wall of glass"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              onBlur={handleProjectNameBlur}
              maxLength={100}
              data-testid="new-project-name"
            />
            {projectNameError && (
              <p className="text-sm text-destructive">{projectNameError}</p>
            )}
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="project-desc">Description (optional)</Label>
            <Input
              id="project-desc"
              placeholder="A neo-noir mystery set in Shanghai"
              value={projectDescription}
              onChange={(e) => setProjectDescription(e.target.value)}
              maxLength={280}
              data-testid="new-project-desc"
            />
          </div>

          {/* Repository Field */}
          <div className="space-y-3">
            <div>
              <Label htmlFor="repository">Repository</Label>
              <p className="text-sm text-muted-foreground mt-1">
                Stores characters, locations, scenes and props with full version
                history — one repository can back multiple projects.
              </p>
            </div>

            {/* Recent Repository Chips */}
            <div className="flex flex-wrap gap-2">
              {recentLoading ? (
                <>
                  <Skeleton className="h-8 w-24 rounded-full" />
                  <Skeleton className="h-8 w-24 rounded-full" />
                  <Skeleton className="h-8 w-24 rounded-full" />
                </>
              ) : recentError ? (
                <div className="flex items-center gap-2 text-sm text-destructive">
                  <span>Couldn't load recent repositories.</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => refetchRecent()}
                    className="h-auto p-0 text-destructive underline"
                  >
                    Retry
                  </Button>
                </div>
              ) : recentRepos && recentRepos.length > 0 ? (
                recentRepos.slice(0, 3).map((repo) => {
                  const isSelected =
                    repositorySelection?.mode === "existing" &&
                    repositorySelection.id === repo.id;
                  return (
                    <button
                      key={repo.id}
                      type="button"
                      onClick={() => handleSelectRecentRepo(repo)}
                      className={`rounded-full border px-3 py-1.5 text-sm font-mono transition-colors ${
                        isSelected
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border bg-background hover:bg-muted"
                      }`}
                    >
                      {repo.name}
                    </button>
                  );
                })
              ) : (
                <p className="text-sm text-muted-foreground">
                  No repositories yet — search below to create one.
                </p>
              )}
            </div>

            {/* Selected non-recent repository chip */}
            {repositorySelection?.mode === "existing" &&
              repositorySelection.source === "search" && (
                <div className="flex items-center gap-2">
                  <Badge variant="default" className="font-mono">
                    {repositorySelection.name}
                  </Badge>
                  <button
                    type="button"
                    onClick={() => setRepositorySelection(null)}
                    className="text-sm text-muted-foreground hover:text-foreground"
                  >
                    Clear
                  </button>
                </div>
              )}

            {/* Search Control */}
            {!isSearchActive ? (
              <button
                type="button"
                onClick={() => setIsSearchActive(true)}
                className="rounded-full border border-dashed px-3 py-1.5 text-sm text-muted-foreground hover:border-border hover:text-foreground transition-colors"
              >
                Search repositories
              </button>
            ) : (
              <div className="relative" ref={dropdownRef}>
                <Input
                  ref={searchInputRef}
                  placeholder="Search or create repository..."
                  value={searchQuery}
                  onChange={(e) => handleSearchInputChange(e.target.value)}
                  onKeyDown={handleSearchKeyDown}
                  onBlur={() => {
                    // Delay closing to allow click events to fire
                    setTimeout(() => {
                      if (
                        !dropdownRef.current?.contains(document.activeElement)
                      ) {
                        setIsSearchActive(false);
                        setHighlightedIndex(-1);
                      }
                    }, 150);
                  }}
                  className="w-full"
                  data-testid="repository-search-input"
                  role="combobox"
                  aria-expanded={
                    filteredSearchResults.length > 0 || hasCreateOption
                  }
                  aria-controls="repository-dropdown"
                />

                {/* Dropdown */}
                {(filteredSearchResults.length > 0 || hasCreateOption) && (
                  <div
                    id="repository-dropdown"
                    className="absolute z-50 mt-1 max-h-60 w-full overflow-auto rounded-md border bg-background shadow-md"
                    role="listbox"
                  >
                    {filteredSearchResults.map((repo, index) => (
                      <button
                        key={repo.id}
                        type="button"
                        role="option"
                        aria-selected={highlightedIndex === index}
                        onClick={() => handleSelectSearchRepo(repo)}
                        className={`w-full px-3 py-2 text-left text-sm font-mono transition-colors ${
                          highlightedIndex === index
                            ? "bg-accent"
                            : "hover:bg-muted"
                        }`}
                      >
                        {repo.name}
                      </button>
                    ))}

                    {hasCreateOption && (
                      <button
                        type="button"
                        role="option"
                        aria-selected={
                          highlightedIndex === filteredSearchResults.length
                        }
                        onClick={() => handleCreateNewRepo(searchQuery)}
                        className={`w-full border-t px-3 py-2 text-left text-sm transition-colors ${
                          highlightedIndex === filteredSearchResults.length
                            ? "bg-accent"
                            : "hover:bg-muted"
                        }`}
                      >
                        Create repository "{slugify(searchQuery)}"
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Outcome Hint */}
            <div
              aria-live="polite"
              className="h-5 text-sm text-muted-foreground"
            >
              {getOutcomeHint()}
            </div>
          </div>

          {/* Tag Field — only shown once an existing repository is selected */}
          {repositorySelection?.mode === "existing" && (
            <div className="space-y-3">
              <div>
                <Label htmlFor="repository-tag">Tag</Label>
                <p className="text-sm text-muted-foreground mt-1">
                  Pins this project to a point in the repository's history.
                  Defaults to the latest commit.
                </p>
              </div>

              {/* Recent Tag Chips (latest is always offered first) */}
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => handleSelectTag("latest")}
                  className={`rounded-full border px-3 py-1.5 text-sm font-mono transition-colors ${
                    selectedTag === "latest"
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-background hover:bg-muted"
                  }`}
                >
                  latest
                </button>

                {recentTagsLoading ? (
                  <>
                    <Skeleton className="h-8 w-20 rounded-full" />
                    <Skeleton className="h-8 w-20 rounded-full" />
                  </>
                ) : recentTagsError ? (
                  <div className="flex items-center gap-2 text-sm text-destructive">
                    <span>Couldn't load tags.</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => refetchRecentTags()}
                      className="h-auto p-0 text-destructive underline"
                    >
                      Retry
                    </Button>
                  </div>
                ) : (
                  recentTags
                    ?.filter((tag) => tag.name !== "latest")
                    .map((tag) => {
                      const isSelected = selectedTag === tag.name;
                      return (
                        <button
                          key={tag.name}
                          type="button"
                          onClick={() => handleSelectTag(tag.name)}
                          className={`rounded-full border px-3 py-1.5 text-sm font-mono transition-colors ${
                            isSelected
                              ? "border-primary bg-primary text-primary-foreground"
                              : "border-border bg-background hover:bg-muted"
                          }`}
                        >
                          {tag.name}
                        </button>
                      );
                    })
                )}
              </div>

              {/* Tag Search Control */}
              {!isTagSearchActive ? (
                <button
                  type="button"
                  onClick={() => setIsTagSearchActive(true)}
                  className="rounded-full border border-dashed px-3 py-1.5 text-sm text-muted-foreground hover:border-border hover:text-foreground transition-colors"
                >
                  Search tags
                </button>
              ) : (
                <div className="relative" ref={tagDropdownRef}>
                  <Input
                    ref={tagSearchInputRef}
                    placeholder="Search tags..."
                    value={tagSearchQuery}
                    onChange={(e) => {
                      setTagSearchQuery(e.target.value);
                      setTagHighlightedIndex(-1);
                    }}
                    onKeyDown={handleTagSearchKeyDown}
                    onBlur={() => {
                      // Delay closing to allow click events to fire
                      setTimeout(() => {
                        if (
                          !tagDropdownRef.current?.contains(
                            document.activeElement,
                          )
                        ) {
                          setIsTagSearchActive(false);
                          setTagHighlightedIndex(-1);
                        }
                      }, 150);
                    }}
                    className="w-full"
                    data-testid="tag-search-input"
                    role="combobox"
                    aria-expanded={filteredTagSearchResults.length > 0}
                    aria-controls="tag-dropdown"
                  />

                  {filteredTagSearchResults.length > 0 && (
                    <div
                      id="tag-dropdown"
                      className="absolute z-50 mt-1 max-h-60 w-full overflow-auto rounded-md border bg-background shadow-md"
                      role="listbox"
                    >
                      {filteredTagSearchResults.map((tag, index) => (
                        <button
                          key={tag.name}
                          type="button"
                          role="option"
                          aria-selected={tagHighlightedIndex === index}
                          onClick={() => handleSelectTag(tag.name)}
                          className={`w-full px-3 py-2 text-left text-sm font-mono transition-colors ${
                            tagHighlightedIndex === index
                              ? "bg-accent"
                              : "hover:bg-muted"
                          }`}
                        >
                          {tag.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </BaseModal.Content>
      <BaseModal.Footer>
        <div className="flex w-full items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Repositories live on lore-server — local storage is a working cache
            only.
          </p>
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              onClick={() => setOpen(false)}
              type="button"
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreate}
              loading={loading}
              disabled={!isFormValid() || loading}
              title={getDisableReason()}
              data-testid="create-project-btn"
              type="button"
            >
              Create project
            </Button>
          </div>
        </div>
      </BaseModal.Footer>
    </BaseModal>
  );
}
