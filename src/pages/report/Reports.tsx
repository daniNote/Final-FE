import {Fragment, type KeyboardEvent, type MouseEvent, useCallback, useEffect, useMemo, useRef, useState} from "react";
import {Ban, CheckCircle2, Clock3, type LucideIcon} from "lucide-react";
import {Badge} from "@/components/ui/badge";
import {Button} from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
} from "@/components/ui/card";
import {Tabs, TabsContent, TabsList, TabsTrigger} from "@/components/ui/tabs";
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from "@/components/ui/select";
import {Input} from "@/components/ui/input";
import {Textarea} from "@/components/ui/textarea";
import {Label} from "@/components/ui/label";

const TEXT_LIMIT = 150;
const DEFAULT_PAGE = 0;
const DEFAULT_PAGE_SIZE = 5;
const PAGE_SIZE_OPTIONS = [5, 10, 20, 30] as const;
const PAGE_GROUP_SIZE = 10;
const MIN_BODY_TEXTAREA_HEIGHT = 160;

const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "/api";
const sanitizedApiBase = apiBaseUrl.endsWith("/") ? apiBaseUrl.slice(0, -1) : apiBaseUrl;
const contentEndpoint = `${sanitizedApiBase}/content`;

const STATUSES = ["PENDING", "APPROVED", "REJECTED"] as const;
const GENERATION_TYPES = ["MANUAL", "AUTO"] as const;

type ContentStatus = (typeof STATUSES)[number];
type GenerationType = (typeof GENERATION_TYPES)[number];

type StatusMeta = {
  label: string;
  badgeClass: string;
  description: string;
  icon: LucideIcon;
};

type GenerationMeta = {
  label: string;
  badgeClass: string;
};

type ReportItem = {
  id: string;
  jobId: string;
  userId: string;
  uploadChannelId: string;
  uploadChannelName: string;
  title: string;
  body: string;
  status: ContentStatus;
  generationType: string;
  link?: string;
  keyword?: string;
  createdAt: string;
  updatedAt: string;
};

type TabItem = {
  value: ContentStatus;
  label: string;
  description: string;
  icon: LucideIcon;
  count: number;
};

type ContentApiItem = {
  id?: string | number;
  contentId?: string | number;
  jobId?: string | number;
  job_id?: string | number;
  userId?: string | number;
  user_id?: string | number;
  uploadChannelId?: string | number;
  channelId?: string | number;
  channel_id?: string | number;
  uploadChannelName?: string;
  channelName?: string;
  channel_name?: string;
  title?: string;
  name?: string;
  body?: string;
  content?: string;
  status?: string;
  contentStatus?: string;
  state?: string;
  generationType?: string;
  contentGenType?: string;
  link?: string;
  url?: string;
  previewUrl?: string;
  keyword?: string;
  keywords?: string;
  createdAt?: string | number;
  created_at?: string | number;
  createdDate?: string | number;
  updatedAt?: string | number;
  updated_at?: string | number;
  updatedDate?: string | number;
  [key: string]: unknown;
};

const STATUS_META: Record<ContentStatus, StatusMeta> = {
  PENDING: {
    label: "검수 대기",
    badgeClass: "",
    description: "AI 생성 콘텐츠를 검토하기 전 상태입니다.",
    icon: Clock3,
  },
  APPROVED: {
    label: "승인 완료",
    badgeClass: "",
    description: "승인이 완료되어 배포 가능한 콘텐츠입니다.",
    icon: CheckCircle2,
  },
  REJECTED: {
    label: "반려",
    badgeClass: "",
    description: "수정이 필요해 반려된 콘텐츠입니다.",
    icon: Ban,
  },
};

const GENERATION_TYPE_META: Record<GenerationType, GenerationMeta> = {
  MANUAL: {
    label: "수동생성",
    badgeClass: "bg-slate-100 text-slate-700 border-slate-200",
  },
  AUTO: {
    label: "자동생성",
    badgeClass: "bg-sky-100 text-sky-700 border-sky-200",
  },
};

const createEmptyReportMap = () =>
  STATUSES.reduce((acc, status) => {
    acc[status] = [] as ReportItem[];
    return acc;
  }, {} as Record<ContentStatus, ReportItem[]>);
const createInitialPageState = () =>
  STATUSES.reduce((acc, status) => {
    acc[status] = DEFAULT_PAGE;
    return acc;
  }, {} as Record<ContentStatus, number>);
const createInitialCountState = () =>
  STATUSES.reduce((acc, status) => {
    acc[status] = 0;
    return acc;
  }, {} as Record<ContentStatus, number>);
const createInitialErrorState = () =>
  STATUSES.reduce((acc, status) => {
    acc[status] = null;
    return acc;
  }, {} as Record<ContentStatus, string | null>);

export function ReportsPage() {
  const [activeTab, setActiveTab] = useState<ContentStatus>("PENDING");
  const [reportMap, setReportMap] = useState<Record<ContentStatus, ReportItem[]>>(() =>
    createEmptyReportMap()
  );
  const [pageMap, setPageMap] = useState<Record<ContentStatus, number>>(() =>
    createInitialPageState()
  );
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [totalCountMap, setTotalCountMap] = useState<Record<ContentStatus, number>>(() =>
    createInitialCountState()
  );
  const [totalPagesMap, setTotalPagesMap] = useState<Record<ContentStatus, number>>(() =>
    createInitialCountState()
  );
  const [loadingStatus, setLoadingStatus] = useState<ContentStatus | null>(null);
  const [errorMap, setErrorMap] = useState<Record<ContentStatus, string | null>>(
    () => createInitialErrorState()
  );
  const [expandedReports, setExpandedReports] = useState<Set<string>>(() => new Set());
  const [statusUpdatingIds, setStatusUpdatingIds] = useState<Set<string>>(() => new Set());

  const fetchReports = useCallback(
    async (status: ContentStatus, page: number, size: number) => {
      const safePage = Number.isFinite(page) ? Math.max(0, Math.floor(page)) : DEFAULT_PAGE;
      const safeSize = Number.isFinite(size) ? Math.max(1, Math.floor(size)) : DEFAULT_PAGE_SIZE;
      setLoadingStatus(status);
      setErrorMap((prev) => ({...prev, [status]: null}));

      const params = new URLSearchParams({
        status,
        page: String(safePage),
        size: String(safeSize),
      });
      const endpoint = `${contentEndpoint}?${params.toString()}`;

      try {
        const setStatusError = (message: string) =>
          setErrorMap((prev) => ({
            ...prev,
            [status]: message,
          }));

        console.log("[Reports] fetching content from", endpoint);
        const response = await fetch(endpoint, {
          credentials: "include",
          headers: {
            Accept: "application/json",
          },
        });

        const contentType = response.headers.get("content-type") || "unknown";

        if (!response.ok) {
          setStatusError(`서버에서 오류가 발생했습니다. (${response.status}, ${contentType})`);
          return;
        }

        if (!contentType.includes("application/json")) {
          const text = await response.text();
          setStatusError(`JSON 응답이 아닙니다. (${contentType}, ${text.slice(0, 100)})`);
          return;
        }

        const payload = await response.json();
        console.log("[Reports] response payload", endpoint, payload);
        const normalized = normalizeReportItems(payload);
        const {totalCount, totalPages} = resolveReportsTotals({
          payload,
          response,
          page: safePage,
          size: safeSize,
          itemsLength: normalized.length,
        });

        setReportMap((prev) => ({...prev, [status]: normalized}));
        setTotalCountMap((prev) => ({...prev, [status]: totalCount}));
        setTotalPagesMap((prev) => ({...prev, [status]: totalPages}));

        const maxPageIndex = totalPages > 0 ? Math.max(0, Math.ceil(totalPages) - 1) : 0;
        if (totalPages > 0 && safePage > maxPageIndex && normalized.length === 0) {
          setPageMap((prev) => ({...prev, [status]: maxPageIndex}));
        }
      } catch (error) {
        console.error("[Reports] failed to fetch reports", endpoint, error);
        setErrorMap((prev) => ({
          ...prev,
          [status]: error instanceof Error ? error.message : "콘텐츠를 불러오지 못했습니다.",
        }));
      } finally {
        setLoadingStatus((prev) => (prev === status ? null : prev));
      }
    },
    []
  );

  const currentTabPage = pageMap[activeTab] ?? DEFAULT_PAGE;

  useEffect(() => {
    setExpandedReports(new Set());
  }, [activeTab, currentTabPage, pageSize]);

  useEffect(() => {
    fetchReports(activeTab, currentTabPage, pageSize);
  }, [activeTab, currentTabPage, pageSize, fetchReports]);

  const tabs: TabItem[] = useMemo(() => {
    return STATUSES.map((status) => ({
      value: status,
      label: STATUS_META[status].label,
      description: STATUS_META[status].description,
      icon: STATUS_META[status].icon,
      count: totalCountMap[status] ?? reportMap[status]?.length ?? 0,
    }));
  }, [reportMap, totalCountMap]);

  const handlePageSizeChange = (value: string) => {
    const newSize = Number(value);
    if (!Number.isFinite(newSize)) {
      return;
    }
    setPageSize(newSize);
    setPageMap(createInitialPageState());
    setReportMap(createEmptyReportMap());
    setTotalCountMap(createInitialCountState());
    setTotalPagesMap(createInitialCountState());
    setErrorMap(createInitialErrorState());
  };

  const handleRetry = (status: ContentStatus) => {
    const targetPage = pageMap[status] ?? DEFAULT_PAGE;
    fetchReports(status, targetPage, pageSize);
  };

  const refreshActiveTabReports = useCallback(() => {
    const targetPage = pageMap[activeTab] ?? DEFAULT_PAGE;
    fetchReports(activeTab, targetPage, pageSize);
  }, [activeTab, fetchReports, pageMap, pageSize]);

  const toggleStatusUpdating = useCallback((reportId: string, updating: boolean) => {
    setStatusUpdatingIds((prev) => {
      const next = new Set(prev);
      if (updating) {
        next.add(reportId);
      } else {
        next.delete(reportId);
      }
      return next;
    });
  }, []);

  const handleStatusChange = useCallback(
    async (report: ReportItem, nextStatus: ContentStatus) => {
      if (report.status !== "PENDING" || report.status === nextStatus) {
        return;
      }

      const endpoint = `${contentEndpoint}/status/${report.id}`;
      toggleStatusUpdating(report.id, true);

      try {
        const headers: Record<string, string> = {
          Accept: "application/json",
          "Content-Type": "application/json",
        };
        const csrfToken = getCookieValue("XSRF-TOKEN");
        if (csrfToken) {
          headers["X-XSRF-TOKEN"] = csrfToken;
        }

        const response = await fetch(endpoint, {
          method: "PATCH",
          credentials: "include",
          headers,
          body: JSON.stringify({ status: nextStatus }),
        });

        const contentType = response.headers.get("content-type") || "unknown";

        if (!response.ok) {
          throw new Error(
            `콘텐츠 상태 변경 실패 (${response.status}, ${contentType})`
          );
        }

        refreshActiveTabReports();
      } catch (error) {
        console.error("[Reports] failed to update status", endpoint, error);
        setErrorMap((prev) => ({
          ...prev,
          [activeTab]: error instanceof Error ? error.message : "상태 변경에 실패했습니다.",
        }));
      } finally {
        toggleStatusUpdating(report.id, false);
      }
    },
    [activeTab, refreshActiveTabReports, toggleStatusUpdating]
  );

  const getTabMeta = (status: ContentStatus) => {
    const items = reportMap[status] ?? [];
    const storedPage = pageMap[status] ?? DEFAULT_PAGE;
    const totalCount = totalCountMap[status] ?? storedPage * pageSize + items.length;
    const rawTotalPages = totalPagesMap[status] ?? 0;
    const inferredPages = totalCount > 0 ? Math.ceil(totalCount / pageSize) : items.length > 0 ? storedPage + 1 : 0;
    const normalizedTotalPages = rawTotalPages > 0 ? Math.ceil(rawTotalPages) : inferredPages;
    const maxPageIndex = normalizedTotalPages > 0 ? normalizedTotalPages - 1 : 0;
    const currentPage = Math.min(storedPage, maxPageIndex);
    const showPagination = normalizedTotalPages > 0;
    const pageGroupStart = showPagination ? Math.floor(currentPage / PAGE_GROUP_SIZE) * PAGE_GROUP_SIZE : 0;
    const pageGroupEnd = showPagination ? Math.min(normalizedTotalPages, pageGroupStart + PAGE_GROUP_SIZE) : 0;
    const pageNumbers = Array.from(
      {length: Math.max(0, pageGroupEnd - pageGroupStart)},
      (_, index) => pageGroupStart + index
    );

    return {
      items,
      storedPage,
      totalCount,
      normalizedTotalPages,
      currentPage,
      maxPageIndex,
      pageNumbers,
      showPagination,
    };
  };

  const activeTabMeta = getTabMeta(activeTab);

  return (
    <div className="p-6 space-y-6">
      <header className="space-y-2 mb-6">
        {/*<p className="text-sm font-medium text-primary">콘텐츠 검수 허브</p>*/}
        <h1 className="text-3xl font-semibold text-foreground">검수</h1>
        <p className="text-muted-foreground">
          업로드 전 AI 생성 컨텐츠를 확인하세요.
        </p>
      </header>

      <Tabs
        value={activeTab}
        onValueChange={(value) => setActiveTab(value as ContentStatus)}
        className="mb-6"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            총 {activeTabMeta.totalCount.toLocaleString()}건
          </p>
          <Select value={String(pageSize)} onValueChange={handlePageSizeChange}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="페이지 크기"/>
            </SelectTrigger>
            <SelectContent>
              {PAGE_SIZE_OPTIONS.map((sizeOption) => (
                <SelectItem key={sizeOption} value={String(sizeOption)}>
                  {sizeOption}개씩 보기
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <TabsList className="grid w-full grid-cols-3">
          {tabs.map((tab) => (
            <TabsTrigger
              key={tab.value}
              value={tab.value}
              className="flex items-center gap-2"
            >
              <span>
                {tab.label}
              </span>
            </TabsTrigger>
          ))}
        </TabsList>

        {tabs.map((tab) => {
          const tabError = errorMap[tab.value];
          const meta = getTabMeta(tab.value);
          const {items, currentPage, maxPageIndex, pageNumbers, normalizedTotalPages, showPagination} = meta;
          const isTabLoading = loadingStatus === tab.value;
          const showLoadingState = isTabLoading && items.length === 0 && !tabError;
          const handleToggleReport = (reportId: string) => {
            setExpandedReports((prev) => {
              const next = new Set(prev);
              if (next.has(reportId)) {
                next.delete(reportId);
              } else {
                next.add(reportId);
              }
              return next;
            });
          };

          const changePage = (nextPage: number) => {
            if (!showPagination || isTabLoading) return;
            const safeNextPage = Math.max(0, Math.min(nextPage, maxPageIndex));
            if (safeNextPage === currentPage) {
              return;
            }
            setReportMap((prev) => ({...prev, [tab.value]: []}));
            setErrorMap((prev) => ({...prev, [tab.value]: null}));
            setPageMap((prev) => ({...prev, [tab.value]: safeNextPage}));
          };

          const handleGroupPrev = () => {
            if (!showPagination) return;
            changePage(Math.max(0, currentPage - PAGE_GROUP_SIZE));
          };

          const handleGroupNext = () => {
            if (!showPagination) return;
            changePage(Math.min(maxPageIndex, currentPage + PAGE_GROUP_SIZE));
          };

          const handlePrev = () => {
            if (!showPagination) return;
            changePage(currentPage - 1);
          };

          const handleNext = () => {
            if (!showPagination) return;
            changePage(currentPage + 1);
          };

          return (
            <TabsContent key={tab.value} value={tab.value} className="space-y-4">
              {showLoadingState ? (
                <Card className="border-dashed">
                  <CardContent className="py-10 text-center text-muted-foreground">
                    콘텐츠를 불러오는 중입니다...
                  </CardContent>
                </Card>
              ) : tabError ? (
                <Card className="border-destructive/30 bg-destructive/5">
                  <CardContent className="space-y-3 py-6 text-center text-sm text-destructive">
                    <p>{tabError}</p>
                    <div>
                      <Button variant="outline" size="sm" onClick={() => handleRetry(tab.value)}>
                        다시 시도
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ) : items.length === 0 ? (
                <Card className="border-dashed">
                  <CardContent className="py-10 text-center text-muted-foreground">
                    현재 {tab.label} 상태의 보고서가 없습니다.
                  </CardContent>
                </Card>
              ) : (
                items.map((report) => (
                  <ReportCard
                    key={report.id}
                    report={report}
                    isExpanded={expandedReports.has(report.id)}
                    onToggle={() => handleToggleReport(report.id)}
                    onStatusChange={(nextStatus) => handleStatusChange(report, nextStatus)}
                    isStatusUpdating={statusUpdatingIds.has(report.id)}
                    onRefresh={refreshActiveTabReports}
                  />
                ))
              )}

              {showPagination && (
                <div className="flex flex-col items-center gap-3">
                  <div className="flex flex-wrap items-center justify-center gap-2">
                    <Button variant="ghost" size="sm" onClick={handleGroupPrev}
                            disabled={isTabLoading || currentPage === 0}>
                      {"<<"}
                    </Button>
                    <Button variant="ghost" size="sm" onClick={handlePrev} disabled={isTabLoading || currentPage === 0}>
                      {"<"}
                    </Button>
                    {pageNumbers.map((pageNumber) => (
                      <Button
                        key={`${tab.value}-${pageNumber}`}
                        size="sm"
                        variant={pageNumber === currentPage ? "default" : "outline"}
                        onClick={() => changePage(pageNumber)}
                        disabled={isTabLoading}
                      >
                        {pageNumber + 1}
                      </Button>
                    ))}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleNext}
                      disabled={isTabLoading || (normalizedTotalPages > 0 && currentPage >= maxPageIndex)}
                    >
                      {">"}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleGroupNext}
                      disabled={isTabLoading || (normalizedTotalPages > 0 && currentPage >= maxPageIndex)}
                    >
                      {">>"}
                    </Button>
                  </div>
                </div>
              )}
            </TabsContent>
          );
        })}
      </Tabs>
    </div>
  );
}

function ReportCard({
  report,
  isExpanded,
  onToggle,
  onStatusChange,
  isStatusUpdating,
  onRefresh,
}: {
  report: ReportItem;
  isExpanded: boolean;
  onToggle: () => void;
  onStatusChange: (nextStatus: ContentStatus) => void;
  isStatusUpdating: boolean;
  onRefresh: () => void;
}) {
  const status = STATUS_META[report.status];
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [editForm, setEditForm] = useState(() => ({
    title: report.title ?? "",
    body: report.body ?? "",
  }));
  const bodyTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const handleCardKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (isEditing || event.target !== event.currentTarget) {
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onToggle();
    }
  };
  const handleCardClick = (event: MouseEvent<HTMLDivElement>) => {
    if (isEditing) {
      event.stopPropagation();
      return;
    }
    onToggle();
  };
  const handleStatusButtonClick = (event: MouseEvent<HTMLButtonElement>, nextStatus: ContentStatus) => {
    event.stopPropagation();
    onStatusChange(nextStatus);
  };
  const handleEditClick = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    setEditForm({
      title: report.title ?? "",
      body: report.body ?? "",
    });
    setEditError(null);
    setIsEditing(true);
  };
  const handleCancelEdit = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    setEditForm({
      title: report.title ?? "",
      body: report.body ?? "",
    });
    setEditError(null);
    setIsEditing(false);
  };
  const handleEditableAreaClick = (event: MouseEvent<HTMLElement>) => {
    event.stopPropagation();
  };
  const handleSaveClick = async (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    if (isSaving || report.status !== "PENDING") {
      return;
    }

    const endpoint = `${contentEndpoint}/${report.id}`;
    setIsSaving(true);
    setEditError(null);

    try {
      const headers: Record<string, string> = {
        Accept: "application/json",
        "Content-Type": "application/json",
      };
      const csrfToken = getCookieValue("XSRF-TOKEN");
      if (csrfToken) {
        headers["X-XSRF-TOKEN"] = csrfToken;
      }

      const response = await fetch(endpoint, {
        method: "PUT",
        credentials: "include",
        headers,
        body: JSON.stringify({
          title: editForm.title,
          body: editForm.body,
        }),
      });

      const contentType = response.headers.get("content-type") || "unknown";

      if (!response.ok) {
        throw new Error(`콘텐츠 수정 실패 (${response.status}, ${contentType})`);
      }

      setIsEditing(false);
      onRefresh();
    } catch (error) {
      console.error("[Reports] failed to update content", endpoint, error);
      setEditError(error instanceof Error ? error.message : "콘텐츠를 수정하지 못했습니다.");
    } finally {
      setIsSaving(false);
    }
  };
  const canModerate = report.status === "PENDING";
  const statusButtonsDisabled = isStatusUpdating || isSaving;
  const titleInputId = `report-title-${report.id}`;
  const bodyInputId = `report-body-${report.id}`;
  const currentBodyLength = isEditing ? editForm.body.length : report.body.length;
  const generationMeta =
    report.status === "APPROVED" && GENERATION_TYPES.includes(report.generationType as GenerationType)
      ? GENERATION_TYPE_META[report.generationType as GenerationType]
      : null;
  const showChannelBadge = Boolean(report.uploadChannelName);
  const adjustBodyTextareaHeight = useCallback(() => {
    const textarea = bodyTextareaRef.current;
    if (!textarea) {
      return;
    }
    textarea.style.height = "auto";
    const nextHeight = Math.max(textarea.scrollHeight, MIN_BODY_TEXTAREA_HEIGHT);
    textarea.style.height = `${nextHeight}px`;
  }, []);

  useEffect(() => {
    setEditForm({
      title: report.title ?? "",
      body: report.body ?? "",
    });
    setIsEditing(false);
    setEditError(null);
    setIsSaving(false);
  }, [report.id, report.title, report.body]);

  useEffect(() => {
    if (!canModerate && isEditing) {
      setIsEditing(false);
    }
  }, [canModerate, isEditing]);

  useEffect(() => {
    if (!isEditing) {
      return;
    }
    adjustBodyTextareaHeight();
  }, [isEditing, editForm.body, adjustBodyTextareaHeight]);

  return (
    <Card
      className={`border border-border shadow-sm transition-colors ${
        isEditing ? "cursor-default" : "cursor-pointer"
      } ${isExpanded ? "ring-1 ring-primary/40" : "hover:border-primary/40"}`}
      tabIndex={0}
      aria-expanded={isExpanded}
      onClick={handleCardClick}
      onKeyDown={handleCardKeyDown}
    >
      <CardHeader className="space-y-3">
        <div>
          {/*<p className="text-sm text-muted-foreground">타이틀</p>*/}
          <div className="mt-1 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            {isEditing ? (
              <div className="w-full md:max-w-xl mt-1 space-y-2">
                <Label htmlFor={titleInputId} className="sr-only">
                  타이틀
                </Label>
                <Input
                  id={titleInputId}
                  value={editForm.title}
                  onChange={(event) =>
                    setEditForm((prev) => ({
                      ...prev,
                      title: event.target.value,
                    }))
                  }
                  onClick={handleEditableAreaClick}
                  className="border border-primary/40 focus-visible:ring-0 focus-visible:border-primary/40"
                  autoFocus
                />
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-xl font-semibold leading-tight">{report.title}</h2>
                {showChannelBadge ? (
                  <Badge variant="outline" className="bg-blue-50 border-blue-200">
                    {report.uploadChannelName}
                  </Badge>
                ) : null}
                <Badge variant="outline" className={status.badgeClass}>
                  {status.label}
                </Badge>
                {generationMeta ? (
                  <Badge variant="outline" className={generationMeta.badgeClass}>
                    {generationMeta.label}
                  </Badge>
                ) : null}
              </div>
            )}
            {/*{isEditing && (*/}
            {/*  <Badge variant="outline" className={status.badgeClass}>*/}
            {/*    {status.label}*/}
            {/*  </Badge>*/}
            {/*)}*/}
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <div>
          {/*<p className="text-sm text-muted-foreground">내용</p>*/}
          {isEditing ? (
            <div className="mt-1 space-y-2">
              <Label htmlFor={bodyInputId} className="sr-only">
                내용
              </Label>
              <Textarea
                id={bodyInputId}
                rows={15}
                value={editForm.body}
                onChange={(event) =>
                  setEditForm((prev) => ({
                    ...prev,
                    body: event.target.value,
                  }))
                }
                onClick={handleEditableAreaClick}
                className="min-h-[240px] border border-primary/40 focus-visible:ring-0 focus-visible:border-primary/40"
              />
            </div>
          ) : (
            <p className="mt-1 text-sm leading-relaxed text-foreground">
              {isExpanded ? renderTextWithLineBreaks(report.body) : truncateText(report.body)}
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
          {isEditing ? (
            <span className="ml-auto">{currentBodyLength.toLocaleString()}자</span>
          ) : (
            <>
              <span>{currentBodyLength.toLocaleString()}자</span>
              <span>{formatDateTime(report.createdAt)}</span>
            </>
          )}
        </div>
      </CardContent>

      {canModerate && (
        <CardFooter className="flex flex-wrap items-center justify-between gap-3">
          {!isEditing && (
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                onClick={(event) => handleStatusButtonClick(event, "APPROVED")}
                disabled={statusButtonsDisabled}
              >
                승인
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={(event) => handleStatusButtonClick(event, "REJECTED")}
                disabled={statusButtonsDisabled}
              >
                반려
              </Button>
            </div>
          )}
          <div className="flex flex-wrap gap-2 ml-auto">
            {isEditing ? (
              <>
                <Button variant="secondary" size="sm" onClick={handleCancelEdit} disabled={isSaving}>
                  취소
                </Button>
                <Button size="sm" onClick={handleSaveClick} disabled={isSaving}>
                  {isSaving ? "저장 중..." : "저장"}
                </Button>
              </>
            ) : (
              <Button variant="secondary" size="sm" onClick={handleEditClick}>
                수정
              </Button>
            )}
          </div>
          {editError && (
            <p className="w-full text-sm text-destructive">{editError}</p>
          )}
        </CardFooter>
      )}
    </Card>
  );
}

function truncateText(text: string, limit = TEXT_LIMIT) {
  return text.length <= limit ? text : `${text.slice(0, limit)}...`;
}

function renderTextWithLineBreaks(text: string) {
  const segments = text.split(/\n/g);
  return segments.map((segment, index) => (
    <Fragment key={`segment-${index}`}>
      {segment}
      {index < segments.length - 1 ? <br /> : null}
    </Fragment>
  ));
}

function getCookieValue(name: string) {
  if (typeof document === "undefined") {
    return null;
  }

  const pairs = document.cookie.split(";");
  for (const pair of pairs) {
    const [cookieName, ...rest] = pair.trim().split("=");
    if (cookieName === name) {
      return rest.join("=");
    }
  }

  return null;
}

function formatDateTime(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const seconds = String(date.getSeconds()).padStart(2, "0");

  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

function normalizeReportItems(payload: unknown): ReportItem[] {
  const items = extractContentItems(payload);

  return items
    .map((item, index) => normalizeReportItem(item, index))
    .filter((item): item is ReportItem => item !== null);
}

function extractContentItems(payload: unknown): ContentApiItem[] {
  if (!payload) return [];

  if (Array.isArray(payload)) {
    return payload as ContentApiItem[];
  }

  if (typeof payload === "object") {
    const container = payload as Record<string, unknown>;
    const candidateKeys = ["content", "items", "records", "data", "results"];

    for (const key of candidateKeys) {
      const value = container[key];
      if (Array.isArray(value)) {
        return value as ContentApiItem[];
      }
      if (value && typeof value === "object") {
        const nested = value as Record<string, unknown>;
        for (const nestedKey of candidateKeys) {
          if (Array.isArray(nested[nestedKey])) {
            return nested[nestedKey] as ContentApiItem[];
          }
        }
      }
    }
  }

  return [];
}

function normalizeReportItem(item: ContentApiItem, index: number): ReportItem | null {
  const id = ensureString(item.id ?? item.contentId ?? item.jobId ?? `temp-${index}`);
  const jobId = ensureString(item.jobId ?? item.job_id ?? `JOB-${id}`);
  const userId = ensureString(item.userId ?? item.user_id ?? "-");
  const uploadChannelId = ensureString(
    item.uploadChannelId ?? item.channelId ?? item.channel_id ?? "-"
  );
  const uploadChannelName = ensureString(
    item.uploadChannelName ?? item.channelName ?? item.channel_name ?? uploadChannelId
  );
  const title = ensureString(item.title ?? item.name ?? `콘텐츠 ${index + 1}`);
  const body = ensureString(item.body ?? item.content ?? "");
  const status = toContentStatus(item.status ?? item.contentStatus ?? item.state);
  const generationType = ensureString(item.generationType ?? item.contentGenType ?? "AI");
  const linkValue = ensureString(item.link ?? item.url ?? item.previewUrl ?? "");
  const keywordValue = ensureString(item.keyword ?? item.keywords ?? "");
  const createdAt = ensureDateString(
    item.createdAt ?? item.created_at ?? item.createdDate ?? new Date().toISOString()
  );
  const updatedAt = ensureDateString(
    item.updatedAt ?? item.updated_at ?? item.updatedDate ?? createdAt
  );

  if (!body) {
    return null;
  }

  return {
    id,
    jobId,
    userId,
    uploadChannelId,
    uploadChannelName,
    title,
    body,
    status,
    generationType,
    link: linkValue || undefined,
    keyword: keywordValue || undefined,
    createdAt,
    updatedAt,
  };
}

function toContentStatus(value: unknown): ContentStatus {
  if (typeof value !== "string") {
    return "PENDING";
  }

  const normalized = value.toUpperCase();

  if (normalized.includes("REJECT")) return "REJECTED";
  if (normalized.includes("APPRO")) return "APPROVED";
  if (normalized.includes("WAIT") || normalized.includes("PEND")) return "PENDING";

  if ((STATUSES as readonly string[]).includes(normalized)) {
    return normalized as ContentStatus;
  }

  return "PENDING";
}

function ensureString(value: unknown, fallback = "") {
  if (typeof value === "string" && value.trim().length > 0) {
    return value;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  return fallback;
}

function ensureDateString(value: unknown) {
  if (typeof value === "string" && value.trim().length > 0) {
    return value;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return new Date(value).toISOString();
  }

  return new Date().toISOString();
}

type ResolveTotalsArgs = {
  payload: unknown;
  response: Response;
  page: number;
  size: number;
  itemsLength: number;
};

const TOTAL_COUNT_KEY_CANDIDATES = [
  "total",
  "totalcount",
  "totalelements",
  "totalrecords",
  "totalitems",
  "count",
  "countall",
  "counttotal",
  "totalcnt",
  "totalsize",
  "totalhits",
  "hits",
  "nbhits",
  "recordstotal",
  "recordsfiltered",
];
const NESTED_CONTAINER_KEYS = [
  "data",
  "meta",
  "metadata",
  "page",
  "pageable",
  "pagination",
  "info",
  "response",
  "result",
];
const TOTAL_PAGES_KEY_CANDIDATES = [
  "totalpages",
  "totalpage",
  "pages",
  "pagecount",
  "pagetotal",
];
const TOTAL_PAGES_NESTED_KEYS = NESTED_CONTAINER_KEYS;
const HEADER_TOTAL_COUNT_KEYS = [
  "X-Total-Count",
  "X-Total",
  "X-Total-Records",
  "X-TotalRecords",
  "X-Total-Elements",
  "X-TotalElements",
  "X-Total-Count-All",
];
const HEADER_TOTAL_PAGE_KEYS = [
  "X-Total-Pages",
  "X-TotalPages",
  "X-Page-Count",
  "X-PageCount",
];

const normalizeKey = (key: string) => key.toLowerCase().replace(/[^a-z0-9]/g, "");

function parseNumericValue(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number(value.trim());
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return undefined;
}

function extractTotalCountMeta(payload: unknown): number | undefined {
  if (!payload || typeof payload !== "object") return undefined;
  const queue: unknown[] = [payload];

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || typeof current !== "object" || Array.isArray(current)) {
      continue;
    }

    const record = current as Record<string, unknown>;
    for (const key of Object.keys(record)) {
      const normalizedKey = normalizeKey(key);
      if (TOTAL_COUNT_KEY_CANDIDATES.includes(normalizedKey)) {
        const parsed = parseNumericValue(record[key]);
        if (typeof parsed === "number") {
          return parsed;
        }
      }
    }

    for (const key of Object.keys(record)) {
      const normalizedKey = normalizeKey(key);
      if (NESTED_CONTAINER_KEYS.includes(normalizedKey)) {
        const value = record[key];
        if (value && typeof value === "object") {
          queue.push(value);
        }
      }
    }
  }

  return undefined;
}

function extractTotalPagesMeta(payload: unknown): number | undefined {
  if (!payload || typeof payload !== "object") return undefined;
  const queue: unknown[] = [payload];

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || typeof current !== "object" || Array.isArray(current)) {
      continue;
    }

    const record = current as Record<string, unknown>;
    for (const key of Object.keys(record)) {
      const normalizedKey = normalizeKey(key);
      if (TOTAL_PAGES_KEY_CANDIDATES.includes(normalizedKey)) {
        const parsed = parseNumericValue(record[key]);
        if (typeof parsed === "number") {
          return parsed;
        }
      }
    }

    for (const key of Object.keys(record)) {
      const normalizedKey = normalizeKey(key);
      if (TOTAL_PAGES_NESTED_KEYS.includes(normalizedKey)) {
        const value = record[key];
        if (value && typeof value === "object") {
          queue.push(value);
        }
      }
    }
  }

  return undefined;
}

function extractNumericFromHeaders(response: Response, keys: string[]): number | undefined {
  for (const key of keys) {
    const value = response.headers.get(key);
    const parsed = parseNumericValue(value ?? undefined);
    if (typeof parsed === "number") {
      return parsed;
    }
  }
  return undefined;
}

function resolveReportsTotals({payload, response, page, size, itemsLength}: ResolveTotalsArgs) {
  const payloadRecord = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : null;
  const payloadSize = payloadRecord
    ? parseNumericValue(payloadRecord["size"] ?? payloadRecord["pageSize"] ?? payloadRecord["limit"])
    : undefined;
  const payloadPage = payloadRecord
    ? parseNumericValue(payloadRecord["page"] ?? payloadRecord["pageIndex"] ?? payloadRecord["currentPage"])
    : undefined;
  const resolvedPageSize = typeof payloadSize === "number" && payloadSize > 0 ? payloadSize : size;
  const resolvedPageIndex = typeof payloadPage === "number" && payloadPage >= 0 ? payloadPage : page;

  const totalCountFromPayload = extractTotalCountMeta(payload);
  const totalPagesFromPayload = extractTotalPagesMeta(payload);
  const headerTotalCount = extractNumericFromHeaders(response, HEADER_TOTAL_COUNT_KEYS);
  const headerTotalPages = extractNumericFromHeaders(response, HEADER_TOTAL_PAGE_KEYS);

  const inferredFromPages = (() => {
    if (typeof totalPagesFromPayload === "number" && totalPagesFromPayload > 0) {
      return totalPagesFromPayload * resolvedPageSize;
    }
    if (typeof headerTotalPages === "number" && headerTotalPages > 0) {
      return headerTotalPages * resolvedPageSize;
    }
    return undefined;
  })();

  const fallbackCount = resolvedPageIndex * resolvedPageSize + itemsLength;
  const resolvedTotalCount = Math.max(
    0,
    headerTotalCount ?? totalCountFromPayload ?? inferredFromPages ?? fallbackCount
  );

  const inferredTotalPagesFromCount = resolvedTotalCount > 0 ? Math.ceil(resolvedTotalCount / resolvedPageSize) : undefined;
  const fallbackPages = itemsLength === resolvedPageSize ? resolvedPageIndex + 2 : resolvedPageIndex + 1;
  const resolvedTotalPages = Math.max(
    0,
    headerTotalPages ?? totalPagesFromPayload ?? inferredTotalPagesFromCount ?? fallbackPages
  );

  return {
    totalCount: resolvedTotalCount,
    totalPages: resolvedTotalPages,
  };
}
