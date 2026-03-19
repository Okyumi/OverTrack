import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { Calendar, Clock, Plus, Minus, Leaf, Plane, ArrowLeft, CheckCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Route, RouteLeg, Operator } from "@shared/schema";

interface RouteWithLegs extends Route {
  legs: RouteLeg[];
}

const PACE_MULTIPLIERS = {
  fast: 0,
  moderate: 1,
  slow: 2,
};

export default function ItineraryPage() {
  // Parse routeId from hash query params
  const routeId = useMemo(() => {
    const hash = window.location.hash;
    const params = new URLSearchParams(hash.split("?")[1] || "");
    return parseInt(params.get("routeId") || "1");
  }, []);

  const [departureDate, setDepartureDate] = useState("2026-05-01");
  const [pace, setPace] = useState<"fast" | "moderate" | "slow">("moderate");
  const [restDays, setRestDays] = useState<Record<string, number>>({});
  const [savedId, setSavedId] = useState<number | null>(null);

  const { data: routeData, isLoading } = useQuery<RouteWithLegs>({
    queryKey: ["/api/routes", routeId],
  });

  const { data: operators = [] } = useQuery<Operator[]>({
    queryKey: ["/api/operators"],
  });

  const operatorsMap = useMemo(() => {
    const map = new Map<number, Operator>();
    operators.forEach(op => map.set(op.id, op));
    return map;
  }, [operators]);

  // Initialize rest days for major stops
  useEffect(() => {
    if (routeData?.legs) {
      const initial: Record<string, number> = {};
      const seen = new Set<string>();
      routeData.legs.forEach(leg => {
        if (!seen.has(leg.fromCity) && leg.fromCountry !== routeData.legs[0]?.fromCountry) {
          initial[leg.fromCity] = PACE_MULTIPLIERS[pace];
        }
        seen.add(leg.fromCity);
        seen.add(leg.toCity);
      });
      const allCitiesInRoute: string[] = [];
      routeData.legs.forEach((leg, idx) => {
        if (idx === 0) allCitiesInRoute.push(leg.fromCity);
        allCitiesInRoute.push(leg.toCity);
      });

      for (let i = 1; i < routeData.legs.length; i++) {
        const prevLeg = routeData.legs[i - 1];
        const curLeg = routeData.legs[i];
        if (prevLeg.toCountry !== curLeg.toCountry && !initial[curLeg.fromCity]) {
          initial[curLeg.fromCity] = PACE_MULTIPLIERS[pace];
        }
      }

      if (routeData.legs.length >= 10) {
        const step = Math.max(3, Math.floor(routeData.legs.length / 6));
        for (let i = step; i < routeData.legs.length; i += step) {
          const city = routeData.legs[i].fromCity;
          if (!initial[city]) {
            initial[city] = PACE_MULTIPLIERS[pace];
          }
        }
      }

      const firstCity = routeData.legs[0]?.fromCity;
      const lastCity = routeData.legs[routeData.legs.length - 1]?.toCity;
      if (firstCity && !initial[firstCity]) initial[firstCity] = PACE_MULTIPLIERS[pace];
      if (lastCity && !initial[lastCity]) initial[lastCity] = PACE_MULTIPLIERS[pace];
      setRestDays(initial);
    }
  }, [routeData, pace]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const restArray = Object.entries(restDays)
        .filter(([, days]) => days > 0)
        .map(([city, days]) => ({ city, days }));
      const res = await apiRequest("POST", "/api/itineraries", {
        routeId,
        departureDate,
        pace,
        restDays: restArray,
      });
      return res.json();
    },
    onSuccess: (data) => {
      setSavedId(data.id);
    },
  });

  // Build timeline
  const timeline = useMemo(() => {
    if (!routeData?.legs) return [];

    const items: {
      type: "travel" | "rest";
      city: string;
      country: string;
      date: Date;
      endDate?: Date;
      leg?: RouteLeg;
      restDays?: number;
    }[] = [];

    let currentDate = new Date(departureDate);

    for (const leg of routeData.legs) {
      const rest = restDays[leg.fromCity] || 0;
      if (rest > 0) {
        items.push({
          type: "rest",
          city: leg.fromCity,
          country: leg.fromCountry,
          date: new Date(currentDate),
          restDays: rest,
        });
        currentDate.setDate(currentDate.getDate() + rest);
      }

      const travelDays = Math.ceil(leg.durationHours / 24) || 1;
      items.push({
        type: "travel",
        city: leg.fromCity,
        country: leg.fromCountry,
        date: new Date(currentDate),
        endDate: new Date(currentDate.getTime() + travelDays * 86400000),
        leg,
      });
      currentDate.setDate(currentDate.getDate() + travelDays);
    }

    const lastLeg = routeData.legs[routeData.legs.length - 1];
    if (lastLeg) {
      const rest = restDays[lastLeg.toCity] || 0;
      if (rest > 0) {
        items.push({
          type: "rest",
          city: lastLeg.toCity,
          country: lastLeg.toCountry,
          date: new Date(currentDate),
          restDays: rest,
        });
      }
    }

    return items;
  }, [routeData, departureDate, restDays]);

  const totalDays = useMemo(() => {
    if (timeline.length === 0) return 0;
    const start = new Date(departureDate);
    const lastItem = timeline[timeline.length - 1];
    const end = lastItem.endDate || new Date(lastItem.date.getTime() + (lastItem.restDays || 0) * 86400000);
    return Math.ceil((end.getTime() - start.getTime()) / 86400000);
  }, [timeline, departureDate]);

  const formatDate = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

  // CO2 comparison
  const co2Flight = routeData ? Math.round(routeData.totalDistanceKm * 0.255) : 0;
  const co2Overland = routeData ? Math.round(routeData.totalDistanceKm * 0.04) : 0;

  const adjustRest = (city: string, delta: number) => {
    setRestDays(prev => ({
      ...prev,
      [city]: Math.max(0, (prev[city] || 0) + delta),
    }));
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-6 h-6 animate-spin text-[#FF0066]" />
      </div>
    );
  }

  if (!routeData) {
    return (
      <div className="flex items-center justify-center h-full p-8">
        <div className="text-center">
          <p className="font-bold">Route not found</p>
          <Link href="/" className="text-[#FF0066] text-sm hover:underline mt-1 inline-block">
            Go back to planner
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-hidden flex flex-col">
      {/* Header */}
      <div className="border-b border-border bg-card px-4 py-3">
        <div className="flex items-center gap-3">
          <Link href="/" data-testid="back-to-planner">
            <Button variant="outline" size="sm" className="gap-1 h-8 text-[11px] uppercase tracking-[0.08em] font-bold border-foreground/20 hover:bg-foreground hover:text-background">
              <ArrowLeft className="w-3.5 h-3.5" /> Back
            </Button>
          </Link>
          <div>
            <h1 className="text-base font-bold uppercase tracking-[0.02em]">
              Itinerary Builder
            </h1>
            <p className="text-[11px] text-muted-foreground uppercase tracking-wider">{routeData.name}</p>
          </div>
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="max-w-4xl mx-auto p-4 lg:p-6 space-y-6">
          {/* Controls */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground block mb-1.5">Departure Date</label>
              <Input
                type="date"
                value={departureDate}
                onChange={e => setDepartureDate(e.target.value)}
                className="h-9 text-sm border-foreground/20"
                data-testid="input-departure-date"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground block mb-1.5">Pace</label>
              <Select value={pace} onValueChange={(v) => setPace(v as any)}>
                <SelectTrigger className="h-9 text-sm border-foreground/20" data-testid="select-pace">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="fast">Fast (no rest days)</SelectItem>
                  <SelectItem value="moderate">Moderate (1 day per stop)</SelectItem>
                  <SelectItem value="slow">Slow (2 days per stop)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end">
              <Button
                onClick={() => saveMutation.mutate()}
                disabled={saveMutation.isPending}
                className="h-9 gap-1.5 w-full bg-[#FF0066] hover:bg-[#E6005C] text-white border-0 text-[11px] uppercase tracking-[0.08em] font-bold"
                data-testid="button-save-itinerary"
              >
                {saveMutation.isPending ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : savedId ? (
                  <CheckCircle className="w-3.5 h-3.5" />
                ) : (
                  <Calendar className="w-3.5 h-3.5" />
                )}
                {savedId ? "Saved" : "Save Itinerary"}
              </Button>
            </div>
          </div>

          {/* CO2 Comparison */}
          <div className="border border-border">
            <div className="px-4 py-3 border-b border-border flex items-center gap-2">
              <Leaf className="w-4 h-4 text-[#FF0066]" />
              <h2 className="text-sm font-bold uppercase tracking-[0.04em]">Carbon Footprint</h2>
            </div>
            <div className="grid grid-cols-2">
              <div className="p-4 border-r border-border">
                <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground mb-1">Overland</p>
                <p className="text-2xl font-black font-mono" data-testid="text-co2-overland">{(co2Overland / 1000).toFixed(1)}</p>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">tons CO₂</p>
              </div>
              <div className="p-4">
                <div className="flex items-center gap-1.5 mb-1">
                  <Plane className="w-3 h-3 text-muted-foreground" />
                  <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">Flying</p>
                </div>
                <p className="text-2xl font-black font-mono" data-testid="text-co2-flying">{(co2Flight / 1000).toFixed(1)}</p>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">tons CO₂</p>
              </div>
            </div>
            <div className="px-4 py-3 border-t border-border">
              <p className="text-xs text-muted-foreground">
                You save <span className="text-[#FF0066] font-bold">{((co2Flight - co2Overland) / 1000).toFixed(1)} tons</span> of CO₂ — equivalent to ~{Math.round((co2Flight - co2Overland) / 330)} transatlantic flights.
              </p>
            </div>
          </div>

          {/* Summary */}
          <div className="flex items-center gap-3 text-sm">
            <span className="text-[10px] font-bold uppercase tracking-[0.1em] border border-border px-2 py-1 flex items-center gap-1.5">
              <Clock className="w-3 h-3" />
              {totalDays} days
            </span>
            <span className="text-[10px] font-bold uppercase tracking-[0.1em] border border-border px-2 py-1 flex items-center gap-1.5">
              <Calendar className="w-3 h-3" />
              {formatDate(new Date(departureDate))} — {timeline.length > 0 ? formatDate(timeline[timeline.length - 1].endDate || timeline[timeline.length - 1].date) : ""}
            </span>
          </div>

          {/* Timeline */}
          <div className="space-y-0">
            {timeline.map((item, idx) => (
              <div key={idx} className="flex gap-4">
                {/* Timeline line */}
                <div className="flex flex-col items-center">
                  <div className={`w-3 h-3 shrink-0 ${
                    item.type === "rest" ? "bg-background border-2 border-foreground/40" : "bg-[#FF0066]"
                  }`} />
                  {idx < timeline.length - 1 && (
                    <div className="w-px flex-1 bg-border min-h-[2rem]" />
                  )}
                </div>

                {/* Content */}
                <div className={`pb-4 flex-1 ${idx === timeline.length - 1 ? "pb-0" : ""}`}>
                  <div className="text-[10px] text-muted-foreground mb-0.5 uppercase tracking-wider font-medium">
                    {formatDate(item.date)}
                  </div>

                  {item.type === "rest" ? (
                    <div className="flex items-center gap-2">
                      <span className="text-sm">
                        Rest in <strong>{item.city}</strong>, {item.country}
                      </span>
                      <div className="flex items-center gap-1 ml-auto">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-6 w-6 p-0 border-foreground/20"
                          onClick={() => adjustRest(item.city, -1)}
                          data-testid={`button-rest-minus-${item.city}`}
                        >
                          <Minus className="w-3 h-3" />
                        </Button>
                        <span className="text-sm font-bold font-mono w-6 text-center">{item.restDays}d</span>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-6 w-6 p-0 border-foreground/20"
                          onClick={() => adjustRest(item.city, 1)}
                          data-testid={`button-rest-plus-${item.city}`}
                        >
                          <Plus className="w-3 h-3" />
                        </Button>
                      </div>
                    </div>
                  ) : item.leg ? (
                    <div className="text-sm">
                      <span className="font-bold">{item.leg.fromCity}</span>
                      <span className="text-muted-foreground"> → </span>
                      <span className="font-bold">{item.leg.toCity}</span>
                      <span className="text-[11px] text-muted-foreground ml-2 font-mono">
                        ({item.leg.transportType} · {item.leg.durationHours < 24 ? `${Math.round(item.leg.durationHours)}h` : `${Math.round(item.leg.durationHours / 24)}d`})
                      </span>
                      {item.leg.operatorId && operatorsMap.has(item.leg.operatorId) && (
                        <span className="text-[11px] text-muted-foreground block mt-0.5">
                          {operatorsMap.get(item.leg.operatorId)!.name}
                        </span>
                      )}
                    </div>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}
