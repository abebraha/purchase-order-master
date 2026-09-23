import { useEffect, useMemo, useRef, useState } from "react";
import { Download, Ellipsis, FileUp, Plus, SearchX, Tags } from "lucide-react";
import type { StyleRecord } from "@shared/po";
import { PageContainer, PageHeader } from "@/components/layout/AppShell";
import { ListRow, ListSection, SearchField } from "@/components/kit";
import { EmptyState, ErrorState } from "@/components/common";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { DeleteStyleDialog } from "@/components/styles/DeleteStyleDialog";
import { ImportStylesDialog } from "@/components/styles/ImportStylesDialog";
import { SortMenu } from "@/components/styles/SortMenu";
import { StyleFormDialog } from "@/components/styles/StyleFormDialog";
import { StyleList } from "@/components/styles/StyleList";
import { StyleTable } from "@/components/styles/StyleTable";
import { filterStyles, sortStyles, type StyleSort } from "@/components/styles/styleUtils";
import { useToast } from "@/hooks/use-toast";
import { useIsDesktop } from "@/hooks/use-media-query";
import { useStyles } from "@/lib/api";
import { exportStylesCsv } from "@/lib/export";
import { formatNumber, pluralize } from "@/lib/format";

const PAGE_SIZE = 100;
const SORT_KEY = "po-master:styles-sort";

function readSort(): StyleSort {
  try {
    const v = window.localStorage.getItem(SORT_KEY);
    return v === "used" || v === "recent" || v === "az" ? v : "az";
  } catch {
    return "az";
  }
}

export default function StyleManagement() {
  const { data: styles, isLoading, error, refetch, isRefetching } = useStyles();
  const isDesktop = useIsDesktop();
  const { toast } = useToast();
  const searchRef = useRef<HTMLInputElement>(null);

  const [query, setQuery] = useState("");
  const [sort, setSortState] = useState<StyleSort>(readSort);
  const [limit, setLimit] = useState(PAGE_SIZE);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<StyleRecord | null>(null);
  const [prefill, setPrefill] = useState("");
  const [deleting, setDeleting] = useState<StyleRecord | null>(null);
  const [importOpen, setImportOpen] = useState(false);

  const setSort = (next: StyleSort) => {
    setSortState(next);
    try {
      window.localStorage.setItem(SORT_KEY, next);
    } catch {
      /* private mode — sorting still works for this visit */
    }
  };

  // A new search or order starts from the top of the list again.
  useEffect(() => setLimit(PAGE_SIZE), [query, sort]);

  // Desktop: "/" jumps to the search field (like Finder, Mail and GitHub).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return;
      if (document.querySelector('[role="dialog"], [role="alertdialog"], [role="menu"]')) return;
      e.preventDefault();
      searchRef.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const total = styles?.length ?? 0;
  const results = useMemo(() => sortStyles(filterStyles(styles ?? [], query), sort), [styles, query, sort]);
  const visible = results.slice(0, limit);
  const remaining = results.length - visible.length;
  const searching = query.trim().length > 0;

  const openAdd = (styleNumber = "") => {
    setEditing(null);
    setPrefill(styleNumber);
    setFormOpen(true);
  };
  const openEdit = (style: StyleRecord) => {
    setEditing(style);
    setPrefill("");
    setFormOpen(true);
  };
  const requestDelete = (style: StyleRecord) => {
    setFormOpen(false);
    setDeleting(style);
  };
  const exportAll = () => {
    if (!styles?.length) return;
    exportStylesCsv(styles);
    toast({ title: "Export Ready", description: `${pluralize(styles.length, "style")} saved as a CSV file.` });
  };

  const hasStyles = total > 0;
  const canExport = hasStyles;

  // ---------------------------------------------------------------------------

  const headerActions = (
    <>
      {/* Phones: "+" and a "more" menu */}
      <Button variant="plain" size="icon" aria-label="Add Style" onClick={() => openAdd()} className="md:hidden">
        <Plus className="!h-[22px] !w-[22px]" strokeWidth={2.4} />
      </Button>
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button variant="plain" size="icon" aria-label="More Actions" className="md:hidden">
            <span className="flex h-[30px] w-[30px] items-center justify-center rounded-full bg-primary/10 text-primary dark:bg-primary/20">
              <Ellipsis className="!h-5 !w-5" strokeWidth={2.4} />
            </span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-[13rem]">
          <DropdownMenuItem onSelect={() => setImportOpen(true)}>
            <FileUp />
            Import
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={exportAll} disabled={!canExport}>
            <Download />
            Export CSV
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Desktop: labeled buttons */}
      <Button variant="tinted" onClick={() => setImportOpen(true)} className="hidden md:inline-flex">
        Import
      </Button>
      <Button variant="secondary" onClick={exportAll} disabled={!canExport} className="hidden md:inline-flex">
        Export
      </Button>
      <Button onClick={() => openAdd()} className="hidden md:inline-flex">
        <Plus strokeWidth={2.5} />
        Add Style
      </Button>
    </>
  );

  let body;
  if (isLoading) {
    body = <StylesSkeleton desktop={isDesktop} />;
  } else if (error && !styles) {
    body = (
      <ErrorState
        title="Couldn't Load Styles"
        error={error}
        action={
          <Button onClick={() => refetch()} disabled={isRefetching}>
            Try Again
          </Button>
        }
      />
    );
  } else if (!hasStyles) {
    body = (
      <div className="rounded-2xl bg-card">
        <EmptyState
          icon={Tags}
          title="No styles yet"
          description="Add the styles you order most, and you can pick them in seconds when you fill in a purchase order."
          action={
            <>
              <Button onClick={() => openAdd()}>
                <Plus strokeWidth={2.5} />
                Add Style
              </Button>
              <Button variant="tinted" onClick={() => setImportOpen(true)}>
                <FileUp />
                Import
              </Button>
            </>
          }
        />
      </div>
    );
  } else {
    const noResults = results.length === 0;
    const trimmed = query.trim();
    const canPrefill = trimmed.length > 0 && trimmed.length <= 64 && !/\s/.test(trimmed);

    body = (
      <div className="space-y-5">
        <div className="flex items-center gap-2">
          <SearchField
            ref={searchRef}
            value={query}
            onChange={setQuery}
            placeholder="Search styles"
            aria-label="Search styles by style #, color or description"
            className="min-w-0 flex-1 md:max-w-sm"
            onKeyDown={(e) => {
              // Return hides the phone keyboard so the results are visible; Escape clears, then leaves.
              if (e.key === "Enter") e.currentTarget.blur();
              if (e.key === "Escape") {
                if (query) setQuery("");
                else e.currentTarget.blur();
              }
            }}
          />
          {isDesktop && searching && (
            <span className="shrink-0 text-sm tabular-nums text-muted-foreground" aria-live="polite">
              {formatNumber(results.length)} of {formatNumber(total)}
            </span>
          )}
          <SortMenu value={sort} onChange={setSort} className="md:ml-auto" />
        </div>

        {noResults ? (
          <div className="rounded-2xl bg-card">
            <EmptyState
              icon={SearchX}
              title={`No Results for “${trimmed}”`}
              description="Check the spelling, or search by a different style #, color or description."
              action={
                canPrefill ? (
                  <Button variant="tinted" onClick={() => openAdd(trimmed)}>
                    <Plus strokeWidth={2.5} />
                    Add “{trimmed}”
                  </Button>
                ) : (
                  <Button variant="tinted" onClick={() => setQuery("")}>
                    Clear Search
                  </Button>
                )
              }
            />
          </div>
        ) : isDesktop ? (
          <StyleTable
            styles={visible}
            sort={sort}
            onSortChange={setSort}
            onEdit={openEdit}
            onDelete={setDeleting}
            footer={
              remaining > 0 && (
                <div className="flex h-12 items-center justify-between border-t border-border/70 px-5 text-sm text-muted-foreground">
                  <span className="tabular-nums">
                    Showing {formatNumber(visible.length)} of {formatNumber(results.length)}
                  </span>
                  <Button variant="plain" size="sm" onClick={() => setLimit((n) => n + PAGE_SIZE)}>
                    Show More
                  </Button>
                </div>
              )
            }
          />
        ) : (
          <>
            <StyleList styles={visible} sort={sort} onSelect={openEdit} />
            {remaining > 0 && (
              <ListSection>
                <ListRow
                  onClick={() => setLimit((n) => n + PAGE_SIZE)}
                  className="justify-center text-center"
                  title={<span className="font-medium text-primary">Show More</span>}
                  subtitle={`${formatNumber(remaining)} more ${remaining === 1 ? "style" : "styles"}`}
                />
              </ListSection>
            )}
          </>
        )}

        {!noResults && (
          <p className="text-center text-[13px] tabular-nums text-muted-foreground md:text-xs" aria-live="polite">
            {searching
              ? `${pluralize(results.length, "match", "matches")} out of ${pluralize(total, "style")}`
              : pluralize(total, "Style", "Styles")}
          </p>
        )}
      </div>
    );
  }

  return (
    <>
      <PageHeader
        title="Styles"
        subtitle={
          styles ? (total ? `${pluralize(total, "style")} in your catalog` : "Your catalog is empty") : "\u00a0"
        }
        actions={headerActions}
      />
      <PageContainer>{body}</PageContainer>

      <StyleFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        style={editing}
        styles={styles}
        initialStyleNumber={prefill}
        onDelete={requestDelete}
      />
      <DeleteStyleDialog style={deleting} onOpenChange={(open) => !open && setDeleting(null)} />
      <ImportStylesDialog open={importOpen} onOpenChange={setImportOpen} styles={styles} />
    </>
  );
}

function StylesSkeleton({ desktop }: { desktop: boolean }) {
  const rows = Array.from({ length: 8 });
  return (
    <div className="space-y-5" aria-busy="true" aria-label="Loading styles">
      <div className="flex gap-2">
        <Skeleton className="h-10 flex-1 rounded-[10px] md:h-9 md:max-w-sm" />
        <Skeleton className="h-10 w-10 rounded-[10px] md:ml-auto md:h-9 md:w-36" />
      </div>
      {desktop ? (
        <div className="overflow-hidden rounded-2xl bg-card">
          <div className="h-9 border-b border-border/80" />
          {rows.map((_, i) => (
            <div key={i} className="flex h-11 items-center gap-6 border-b border-border/70 px-5 last:border-b-0">
              <Skeleton className="h-3.5 w-24 rounded-md" />
              <Skeleton className="h-3.5 w-16 rounded-md" />
              <Skeleton className="h-3.5 flex-1 rounded-md" />
              <Skeleton className="h-3.5 w-20 rounded-md" />
              <Skeleton className="h-3.5 w-20 rounded-md" />
            </div>
          ))}
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl bg-card">
          {rows.map((_, i) => (
            <div key={i} className="flex h-[62px] flex-col justify-center gap-2 border-b border-border/70 px-4 last:border-b-0">
              <Skeleton className="h-4 w-24 rounded-md" />
              <Skeleton className="h-3 w-44 rounded-md" />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
