import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";

interface DemandChartProps {
  selectedDay: string;
  dateRange: { start: string; end: string };
  onDateRangeChange: (range: { start: string; end: string }) => void;
}

type DailyClickPoint = {
  clickDate: string;
  clicks: number;
  uploads?: number;
};

type DailyClickResponse = {
  start?: string;
  end?: string;
  dailyClicks?: DailyClickPoint[];
};

type ChartPoint = {
  time: string;
  clicks: number;
  uploads: number;
};

const normalizeDate = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
};

const buildDailySeries = (start: string, end: string, data: DailyClickPoint[]): ChartPoint[] => {
  const normalizedStart = normalizeDate(start);
  const normalizedEnd = normalizeDate(end);

  if (!normalizedStart || !normalizedEnd) return [];

  const valuesByDate = new Map<string, { clicks: number; uploads: number }>();
  data.forEach((item) => {
    const dateKey = normalizeDate(item.clickDate);
    if (dateKey) {
      valuesByDate.set(dateKey, {
        clicks: item.clicks ?? 0,
        uploads: item.uploads ?? 0,
      });
    }
  });

  const days: ChartPoint[] = [];
  const cursor = new Date(normalizedStart);
  const last = new Date(normalizedEnd);

  while (cursor <= last) {
    const key = cursor.toISOString().slice(0, 10);
    const values = valuesByDate.get(key);
    days.push({
      time: key,
      clicks: values?.clicks ?? 0,
      uploads: values?.uploads ?? 0,
    });
    cursor.setDate(cursor.getDate() + 1);
  }

  return days;
};

export function DemandChart({ selectedDay, dateRange, onDateRangeChange }: DemandChartProps) {
  const [dailyClicks, setDailyClicks] = useState<DailyClickPoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rangeOpen, setRangeOpen] = useState(false);
  const [rangeDraft, setRangeDraft] = useState(dateRange);
  const [rangeError, setRangeError] = useState<string | null>(null);

  useEffect(() => {
    setRangeDraft(dateRange);
  }, [dateRange]);

  useEffect(() => {
    if (!dateRange.start || !dateRange.end) {
      setDailyClicks([]);
      return;
    }

    const controller = new AbortController();

    const fetchDailyClicks = async () => {
      setLoading(true);
      setError(null);

      const query = new URLSearchParams({
        start: dateRange.start,
        end: dateRange.end,
      });

      const endpoint = `/api/dashboard/daily?${query.toString()}`;

      try {
        console.log("[DemandChart] fetching daily clicks from", endpoint);
        const response = await fetch(endpoint, {
          credentials: "include",
          signal: controller.signal,
        });

        const contentType = response.headers.get("content-type") || "unknown";

        if (!response.ok) {
          throw new Error(`일간 클릭 데이터를 불러오지 못했습니다 (${response.status})`);
        }

        if (!contentType.includes("application/json")) {
          const text = await response.text();
          throw new Error(`예상치 못한 응답 형식입니다: ${contentType} ${text.slice(0, 120)}`);
        }

        const payload: DailyClickResponse = await response.json();
        setDailyClicks(payload.dailyClicks ?? []);
      } catch (fetchError) {
        if (controller.signal.aborted) return;
        console.error("[DemandChart] failed to fetch daily clicks", fetchError);
        const message = fetchError instanceof Error ? fetchError.message : "알 수 없는 오류가 발생했습니다.";
        setError(message);
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    };

    fetchDailyClicks();

    return () => controller.abort();
  }, [dateRange.end, dateRange.start, selectedDay]);

  const chartData = useMemo(
    () => buildDailySeries(dateRange.start, dateRange.end, dailyClicks),
    [dateRange.end, dateRange.start, dailyClicks]
  );

  const totalClicks = chartData.reduce((sum, item) => sum + item.clicks, 0);
  const averageClicks = chartData.length ? Math.round(totalClicks / chartData.length) : 0;
  const peakDay = chartData.reduce<ChartPoint>(
    (peak, current) => (current.clicks > peak.clicks ? current : peak),
    { time: "-", clicks: 0, uploads: 0 }
  );
  const yMax = chartData.reduce((max, item) => Math.max(max, item.clicks, item.uploads), 0);
  const yDomainMax = yMax ? Math.ceil(yMax * 1.1) : 10;

  const validateAndApplyRange = () => {
    const { start, end } = rangeDraft;

    if (!start || !end) {
      setRangeError("시작일과 종료일을 모두 입력해주세요.");
      return;
    }

    const startDate = new Date(start);
    const endDate = new Date(end);

    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
      setRangeError("날짜 형식이 올바르지 않습니다.");
      return;
    }

    if (startDate > endDate) {
      setRangeError("시작일은 종료일보다 이전이어야 합니다.");
      return;
    }

    const diffDays = Math.floor((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;
    if (diffDays > 30) {
      setRangeError("최대 30일 범위만 선택 가능합니다.");
      return;
    }

    setRangeError(null);
    onDateRangeChange({ start, end });
    setRangeOpen(false);
  };

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const clicksPayload = payload.find((item: any) => item.dataKey === "clicks");
      const uploadsPayload = payload.find((item: any) => item.dataKey === "uploads");
      return (
        <div className="bg-background border border-border rounded-lg p-3 shadow-lg space-y-2">
          <p className="font-medium">{`날짜: ${label}`}</p>
          {clicksPayload && (
            <div className="flex items-center gap-2 text-sm">
              <div className="w-3 h-1 rounded" style={{ backgroundColor: clicksPayload.color }} />
              <span>클릭: {clicksPayload.value}</span>
            </div>
          )}
          {uploadsPayload && (
            <div className="flex items-center gap-2 text-sm">
              <div className="w-3 h-1 rounded" style={{ backgroundColor: uploadsPayload.color }} />
              <span>업로드: {uploadsPayload.value}</span>
            </div>
          )}
        </div>
      );
    }
    return null;
  };

  const renderChart = () => {
    if (loading) {
      return (
        <div className="h-80 flex items-center justify-center text-muted-foreground text-sm">
          일간 클릭을 불러오는 중...
        </div>
      );
    }

    if (error) {
      return (
        <div className="h-80 flex items-center justify-center text-destructive text-sm">
          {error}
        </div>
      );
    }

    if (!chartData.length) {
      return (
        <div className="h-80 flex items-center justify-center text-muted-foreground text-sm">
          선택한 기간의 데이터가 없습니다.
        </div>
      );
    }

    return (
      <div className="h-80">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis
              dataKey="time"
              stroke="hsl(var(--muted-foreground))"
              fontSize={12}
              tickFormatter={(value) => value?.slice(5)}
            />
            <YAxis
              stroke="hsl(var(--muted-foreground))"
              fontSize={12}
              domain={[0, yDomainMax]}
              allowDecimals={false}
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend />
            <Line
              type="monotone"
              dataKey="clicks"
              stroke="#22c55e"
              strokeWidth={3}
              name="클릭"
              dot={{ fill: "#22c55e", strokeWidth: 2, r: 4 }}
              activeDot={{ r: 6, stroke: "#22c55e", strokeWidth: 2 }}
            />
            <Line
              type="monotone"
              dataKey="uploads"
              stroke="#ef4444"
              strokeWidth={3}
              name="업로드"
              dot={{ fill: "#ef4444", strokeWidth: 2, r: 4 }}
              activeDot={{ r: 6, stroke: "#ef4444", strokeWidth: 2 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    );
  };

  return (
    <Card className="border-border/30 shadow-sm bg-card/80 backdrop-blur-sm">
      <CardHeader className="pb-4 space-y-3">
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle className="text-lg font-semibold text-card-foreground">일간 클릭</CardTitle>
            <p className="text-sm text-muted-foreground">
              기간별 클릭 추이 — {dateRange.start || "-"} ~ {dateRange.end || "-"}
            </p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setRangeOpen((open) => !open)}
              className="shrink-0"
            >
              {rangeOpen ? "닫기" : "범위 설정"}
            </Button>
          </div>
        </div>

        {rangeOpen && (
          <div className="space-y-2">
            <div className="grid grid-cols-1 gap-2 md:grid-cols-[1fr_1fr_auto] md:items-end">
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">시작일</label>
                <Input
                  type="date"
                  value={rangeDraft.start}
                  onChange={(event) => setRangeDraft((prev) => ({ ...prev, start: event.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">종료일</label>
                <Input
                  type="date"
                  value={rangeDraft.end}
                  onChange={(event) => setRangeDraft((prev) => ({ ...prev, end: event.target.value }))}
                />
              </div>
              <div className="flex gap-2 md:justify-end">
                <Button size="sm" onClick={validateAndApplyRange} className="w-full md:w-auto">
                  적용
                </Button>
              </div>
            </div>
            {rangeError && <p className="text-xs text-destructive">{rangeError}</p>}
            <p className="text-xs text-muted-foreground">최대 30일 범위만 선택 가능합니다.</p>
          </div>
        )}
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
          <div className="grid grid-cols-3 gap-4">
            <div className="text-center space-y-1">
              <div className="text-xl font-bold text-foreground">{totalClicks}</div>
              <div className="text-xs text-muted-foreground">총 클릭수</div>
            </div>
            <div className="text-center space-y-1">
              <div className="text-xl font-bold text-foreground">{averageClicks}</div>
              <div className="text-xs text-muted-foreground">일 평균</div>
            </div>
            <div className="text-center space-y-1">
              <div className="text-xl font-bold text-foreground">
                {peakDay.time !== "-" ? `${peakDay.clicks}회 (${peakDay.time})` : "-"}
              </div>
              <div className="text-xs text-muted-foreground">피크일</div>
            </div>
          </div>

          {renderChart()}

          <div className="space-y-2">
            <h4 className="text-sm font-medium">일간 인사이트</h4>
            <div className="grid grid-cols-1 gap-2">
              <div className="flex items-center justify-between p-2 bg-muted/50 rounded-md">
                <span className="text-sm">기간</span>
                <span className="text-sm font-medium">
                  {dateRange.start || "-"} ~ {dateRange.end || "-"}
                </span>
              </div>
              <div className="flex items-center justify-between p-2 bg-muted/50 rounded-md">
                <span className="text-sm">피크</span>
                <span className="text-sm font-medium">
                  {peakDay.time !== "-" ? `${peakDay.clicks}회 (${peakDay.time})` : "데이터 없음"}
                </span>
              </div>
            <div className="flex items-center justify-between p-2 bg-muted/50 rounded-md">
              <span className="text-sm">총합 / 평균</span>
              <span className="text-sm font-medium">
                  {totalClicks}회 / 일평균 {averageClicks}회
              </span>
            </div>
          </div>
        </div>
        </div>
      </CardContent>
    </Card>
  );
}
