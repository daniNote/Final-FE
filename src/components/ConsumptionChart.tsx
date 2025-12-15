import { useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Button } from "./ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from "recharts";
import { MousePointerClick } from "lucide-react";

interface ConsumptionChartProps {
  selectedDay: string;
  selectedDevice: string;
}

type ContentItem = {
  contentId: number;
  title: string;
  keyword: string;
  contentLink: string;
  clickCount: number;
  categoryId?: number;
  categoryName?: string;
};

type ContentsResponse = {
  contents?: ContentItem[];
  items?: ContentItem[];
  totalCount?: number;
  totalPages?: number;
  page?: number;
  size?: number;
};

const palette = ["#22c55e", "#16a34a", "#15803d", "#166534", "#14532d", "#052e16"];
const OTHER_SLICE_COLOR = "#94a3b8";
const PAGE_GROUP_SIZE = 10;
const PAGE_SIZE_OPTIONS = [10, 20, 30];
const DEFAULT_PAGE_SIZE = 10;
const CHART_TOP_N = 5;
const MIN_SLICE_VALUE = 0.0001;
const AGGREGATION_PAGE_SIZE = DEFAULT_PAGE_SIZE;
const parseNumeric = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

export function ConsumptionChart({ selectedDay: _selectedDay, selectedDevice: _selectedDevice }: ConsumptionChartProps) {
  const [contents, setContents] = useState<ContentItem[]>([]);
  const [chartContents, setChartContents] = useState<ContentItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [chartLoading, setChartLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [chartError, setChartError] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const colorMapRef = useRef<Map<string, string>>(new Map());

  useEffect(() => {
    const controller = new AbortController();
    const endpoint = `/api/dashboard/contents?page=${page}&size=${pageSize}`;

    const fetchContents = async () => {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch(endpoint, {
          credentials: "include",
          signal: controller.signal,
        });

        const contentType = response.headers.get("content-type") || "unknown";

        if (!response.ok) {
          throw new Error(`콘텐츠 데이터를 불러오지 못했습니다 (${response.status})`);
        }

        if (!contentType.includes("application/json")) {
          const text = await response.text();
          throw new Error(`예상치 못한 응답 형식입니다: ${contentType} ${text.slice(0, 120)}`);
        }

        const payload: ContentsResponse = await response.json();
        const items = payload.items ?? payload.contents ?? [];
        const responseTotalCount = parseNumeric(payload.totalCount) ?? parseNumeric(response.headers.get("X-Total-Count"));
        const responseTotalPages = parseNumeric(payload.totalPages) ?? parseNumeric(response.headers.get("X-Total-Pages"));
        const derivedTotalCount = typeof responseTotalCount === "number" ? responseTotalCount : page * pageSize + items.length;
        const derivedTotalPages = derivedTotalCount > 0 ? Math.ceil(derivedTotalCount / pageSize) : 0;
        const resolvedTotalPages = typeof responseTotalPages === "number" && responseTotalPages > 0 ? responseTotalPages : derivedTotalPages;

        setContents(items);
        setTotalCount(derivedTotalCount);
        setTotalPages(resolvedTotalPages);

        const maxPageIndex = Math.max(0, resolvedTotalPages - 1);
        if (items.length && page > maxPageIndex) {
          setPage(maxPageIndex);
        }
      } catch (fetchError) {
        if (controller.signal.aborted) return;
        const message = fetchError instanceof Error ? fetchError.message : "알 수 없는 오류가 발생했습니다.";
        setError(message);
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    };

    fetchContents();
    return () => controller.abort();
  }, [page, pageSize]);

  const derivedTotalPages = totalCount > 0 ? Math.ceil(totalCount / pageSize) : 0;
  const resolvedTotalPages = totalPages > 0 ? totalPages : derivedTotalPages;
  const pageGroupStart = resolvedTotalPages > 0 ? Math.floor(page / PAGE_GROUP_SIZE) * PAGE_GROUP_SIZE : 0;
  const pageGroupEnd = resolvedTotalPages > 0 ? Math.min(resolvedTotalPages, pageGroupStart + PAGE_GROUP_SIZE) : 0;
  const pageNumbers = Array.from(
    { length: Math.max(0, pageGroupEnd - pageGroupStart) },
    (_, index) => pageGroupStart + index
  );
  const canGoPrev = page > 0;
  const canGoNext = resolvedTotalPages > 0 && page < resolvedTotalPages - 1;
  const canGoGroupPrev = resolvedTotalPages > 0 && page > 0;
  const canGoGroupNext = resolvedTotalPages > 0 && page < resolvedTotalPages - 1;

  const handleGroupPrev = () => {
    if (loading || !canGoGroupPrev) return;
    setPage((prev) => Math.max(0, prev - PAGE_GROUP_SIZE));
  };

  const handleGroupNext = () => {
    if (loading || !canGoGroupNext) return;
    setPage((prev) => Math.min(resolvedTotalPages - 1, prev + PAGE_GROUP_SIZE));
  };

  const handlePrev = () => {
    if (loading || !canGoPrev) return;
    setPage((prev) => Math.max(0, prev - 1));
  };

  const handleNext = () => {
    if (loading || !canGoNext) return;
    setPage((prev) => Math.min(resolvedTotalPages - 1, prev + 1));
  };

  const handlePageSelect = (pageIndex: number) => {
    if (loading || pageIndex < 0 || (resolvedTotalPages > 0 && pageIndex > resolvedTotalPages - 1)) {
      return;
    }
    setPage(pageIndex);
  };

  const handlePageSizeChange = (value: string) => {
    const newSize = Number(value);
    if (!Number.isFinite(newSize)) return;
    setPage(0);
    setPageSize(newSize);
  };

  const buildCategoryKey = (content: ContentItem) => {
    if (content.categoryId !== undefined && content.categoryId !== null) {
      return `id-${content.categoryId}`;
    }
    if (content.categoryName) {
      return `name-${content.categoryName}`;
    }
    return "unknown";
  };

  const getColorForCategory = (categoryKey: string, fallbackIndex: number) => {
    const existing = colorMapRef.current.get(categoryKey);
    if (existing) return existing;
    const color = palette[colorMapRef.current.size % palette.length];
    colorMapRef.current.set(categoryKey, color);
    return color;
  };

  // 카테고리가 바뀌면 색상 맵이 커질 수 있어, 목록이 비면 초기화
  useEffect(() => {
    if (chartContents.length === 0) {
      colorMapRef.current.clear();
    }
  }, [chartContents.length]);

  useEffect(() => {
    const controller = new AbortController();
    const fetchAllContents = async () => {
      setChartLoading(true);
      setChartError(null);
      try {
        const firstEndpoint = `/api/dashboard/contents?page=0&size=${AGGREGATION_PAGE_SIZE}`;
        const firstResponse = await fetch(firstEndpoint, {
          credentials: "include",
          signal: controller.signal,
        });

        const firstContentType = firstResponse.headers.get("content-type") || "unknown";
        if (!firstResponse.ok) {
          throw new Error(`콘텐츠 데이터를 불러오지 못했습니다 (${firstResponse.status})`);
        }

        if (!firstContentType.includes("application/json")) {
          const text = await firstResponse.text();
          throw new Error(`예상치 못한 응답 형식입니다: ${firstContentType} ${text.slice(0, 120)}`);
        }

        const firstPayload: ContentsResponse = await firstResponse.json();
        const firstItems = firstPayload.items ?? firstPayload.contents ?? [];
        const responseTotalCount = parseNumeric(firstPayload.totalCount) ?? parseNumeric(firstResponse.headers.get("X-Total-Count"));
        const responseTotalPages = parseNumeric(firstPayload.totalPages) ?? parseNumeric(firstResponse.headers.get("X-Total-Pages"));

        const derivedTotalPages = typeof responseTotalCount === "number" && responseTotalCount > 0
          ? Math.ceil(responseTotalCount / AGGREGATION_PAGE_SIZE)
          : 0;
        const totalPagesForAggregation = typeof responseTotalPages === "number" && responseTotalPages > 0
          ? responseTotalPages
          : derivedTotalPages;

        const restPageCount = Math.max(0, (totalPagesForAggregation || 0) - 1);

        if (restPageCount === 0) {
          setChartContents(firstItems);
          return;
        }

        const restRequests = Array.from({ length: restPageCount }, (_, index) => {
          const pageIndex = index + 1;
          const endpoint = `/api/dashboard/contents?page=${pageIndex}&size=${AGGREGATION_PAGE_SIZE}`;

          return fetch(endpoint, {
            credentials: "include",
            signal: controller.signal,
          })
            .then(async (response) => {
              const contentType = response.headers.get("content-type") || "unknown";
              if (!response.ok || !contentType.includes("application/json")) {
                return [];
              }
              const payload: ContentsResponse = await response.json();
              return payload.items ?? payload.contents ?? [];
            })
            .catch(() => []);
        });

        const restResults = await Promise.all(restRequests);
        setChartContents([...firstItems, ...restResults.flat()]);
      } catch (fetchError) {
        if (controller.signal.aborted) return;
        const message = fetchError instanceof Error ? fetchError.message : "전체 데이터를 불러오는 데 실패했습니다.";
        setChartError(message);
      } finally {
        if (!controller.signal.aborted) {
          setChartLoading(false);
        }
      }
    };

    fetchAllContents();
    return () => controller.abort();
  }, []);

  const chartData = useMemo(() => {
    // categoryId -> 집계
    const aggregated = new Map<
      string,
      { categoryId?: number; categoryName: string; clicks: number }
    >();

    chartContents.forEach((item) => {
      const key = buildCategoryKey(item);
      const categoryName = item.categoryName ?? "기타";
      const prev = aggregated.get(key) ?? { categoryId: item.categoryId, categoryName, clicks: 0 };
      aggregated.set(key, { ...prev, clicks: prev.clicks + (item.clickCount ?? 0) });
    });

    const sorted = Array.from(aggregated.values()).sort((a, b) => b.clicks - a.clicks);
    const topItems = sorted.slice(0, CHART_TOP_N);
    const others = sorted.slice(CHART_TOP_N);

    const mappedTop = topItems.map((item, index) => {
      const rawValue = item.clicks ?? 0;
      const categoryKey = item.categoryId !== undefined && item.categoryId !== null
        ? `id-${item.categoryId}`
        : item.categoryName;
      return {
        name: item.categoryName,
        rawValue,
        renderValue: rawValue > 0 ? rawValue : MIN_SLICE_VALUE,
        color: getColorForCategory(categoryKey ?? "unknown", index),
      };
    });

    if (others.length) {
      const othersRawValue = others.reduce((sum, item) => sum + (item.clicks ?? 0), 0);
      mappedTop.push({
        name: `기타 ${others.length}개`,
        rawValue: othersRawValue,
        renderValue: othersRawValue > 0 ? othersRawValue : MIN_SLICE_VALUE,
        color: OTHER_SLICE_COLOR,
      });
    }

    return mappedTop;
  }, [chartContents]);

  const totalClicks = chartData.reduce((sum, item) => sum + item.rawValue, 0);

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0]?.payload;
      const rawValue = data?.rawValue ?? 0;
      const percentage = totalClicks ? ((rawValue / totalClicks) * 100).toFixed(1) : "0.0";
      return (
        <div className="bg-background border border-border rounded-lg p-3 shadow-lg">
          <p className="font-medium">{data?.name}</p>
          <p className="text-sm text-muted-foreground">
            {rawValue.toLocaleString()}회 클릭 ({percentage}%)
          </p>
        </div>
      );
    }
    return null;
  };

  const CustomLegend = ({ payload }: any) => {
    return (
      <div className="flex flex-wrap gap-4 justify-center mt-4">
        {payload.map((entry: any, index: number) => (
          <div key={index} className="flex items-center gap-2 text-sm">
            <div 
              className="w-3 h-3 rounded-full" 
              style={{ backgroundColor: entry.color }}
            />
            <span className="text-foreground">{(entry.payload?.rawValue ?? 0).toLocaleString()}</span>
          </div>
        ))}
      </div>
    );
  };

  const renderBody = () => {
    if (chartLoading || loading) {
      return <div className="h-80 flex items-center justify-center text-sm text-muted-foreground">콘텐츠를 불러오는 중...</div>;
    }

    if (chartError || error) {
      return <div className="h-80 flex items-center justify-center text-sm text-destructive">{chartError ?? error}</div>;
    }

    if (!chartData.length) {
      return <div className="h-80 flex items-center justify-center text-sm text-muted-foreground">콘텐츠가 없습니다.</div>;
    }

    return (
      <>
        <div className="text-center space-y-1">
          <div className="text-3xl font-bold text-foreground">{totalClicks.toLocaleString()}</div>
          <div className="text-sm text-muted-foreground">총 클릭수</div>
        </div>

        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={chartData}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={120}
                paddingAngle={2}
                dataKey="renderValue"
              >
                {chartData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip content={<CustomTooltip />} />
              <Legend content={<CustomLegend />} />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h4 className="text-sm font-medium">콘텐츠 목록</h4>
            <Select value={String(pageSize)} onValueChange={handlePageSizeChange}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="페이지 크기" />
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
          <div className="grid grid-cols-1 gap-2">
            {contents.map((content, index) => (
              <a
                key={content.contentId ?? index}
                href={content.contentLink}
                target="_blank"
                rel="noreferrer"
                className="flex items-center justify-between p-2 bg-muted/50 rounded-md cursor-pointer hover:bg-muted transition-colors"
              >
                <div className="flex items-center gap-2">
                  <div
                    className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: getColorForCategory(buildCategoryKey(content), index) }}
                  />
                  <span className="text-sm">{`${content.title} - ${content.keyword}`}</span>
                </div>
                <span className="flex items-center gap-1 text-sm font-medium text-foreground">
                  <MousePointerClick className="w-4 h-4 text-primary" aria-hidden />
                  {content.clickCount.toLocaleString()}회 클릭
                </span>
              </a>
            ))}
          </div>
          {resolvedTotalPages > 0 && (
            <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
              <Button variant="ghost" size="sm" onClick={handleGroupPrev} disabled={loading || !canGoGroupPrev}>
                {"<<"}
              </Button>
              <Button variant="ghost" size="sm" onClick={handlePrev} disabled={loading || !canGoPrev}>
                {"<"}
              </Button>
              {pageNumbers.map((pageNumber) => (
                <Button
                  key={pageNumber}
                  size="sm"
                  variant={pageNumber === page ? "default" : "outline"}
                  onClick={() => handlePageSelect(pageNumber)}
                  disabled={loading}
                >
                  {pageNumber + 1}
                </Button>
              ))}
              <Button variant="ghost" size="sm" onClick={handleNext} disabled={loading || !canGoNext}>
                {">"}
              </Button>
              <Button variant="ghost" size="sm" onClick={handleGroupNext} disabled={loading || !canGoGroupNext}>
                {">>"}
              </Button>
            </div>
          )}
        </div>
      </>
    );
  };

  return (
    <Card className="border-border/30 shadow-sm bg-card/80 backdrop-blur-sm">
      <CardHeader className="pb-4">
        <CardTitle className="text-lg font-semibold text-card-foreground">콘텐츠 클릭 현황</CardTitle>
        <p className="text-sm text-muted-foreground">
          지금까지 누적된 전체 데이터 기준으로 콘텐츠별 클릭 수 분포를 보여줍니다
        </p>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {renderBody()}
        </div>
      </CardContent>
    </Card>
  );
}
