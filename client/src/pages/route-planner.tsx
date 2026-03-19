import { useState, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Search, Loader2, Train, Bus, Ship, Anchor } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import RouteMap from "@/components/RouteMap";
import LegsList from "@/components/LegsList";
import RouteStats from "@/components/RouteStats";
import { apiRequest } from "@/lib/queryClient";
import type { Route, RouteLeg, Operator } from "@shared/schema";

interface RouteWithLegs extends Route {
  legs: RouteLeg[];
}

export default function RoutePlanner() {
  const [fromCity, setFromCity] = useState("Tokyo");
  const [toCity, setToCity] = useState("Ushuaia");
  const [searchTrigger, setSearchTrigger] = useState(0);
  const [selectedLeg, setSelectedLeg] = useState<number | null>(null);
  const [, navigate] = useLocation();

  // Auto-load the default route
  useEffect(() => {
    setSearchTrigger(1);
  }, []);

  // Search for route
  const { data: routeData, isLoading: routeLoading, error: routeError } = useQuery<RouteWithLegs>({
    queryKey: ["/api/routes/search", searchTrigger, fromCity, toCity],
    queryFn: async () => {
      const res = await apiRequest("POST", "/api/routes/search", { fromCity, toCity });
      return res.json();
    },
    enabled: searchTrigger > 0,
    retry: false,
  });

  // Load operators
  const { data: operators = [] } = useQuery<Operator[]>({
    queryKey: ["/api/operators"],
  });

  const operatorsMap = useMemo(() => {
    const map = new Map<number, Operator>();
    operators.forEach(op => map.set(op.id, op));
    return map;
  }, [operators]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setSelectedLeg(null);
    setSearchTrigger(prev => prev + 1);
  };

  const legs = routeData?.legs || [];

  // Transport type legend
  const legend = [
    { type: "train", color: "#2563eb", icon: Train, label: "Train" },
    { type: "bus", color: "#16a34a", icon: Bus, label: "Bus" },
    { type: "ferry", color: "#ea580c", icon: Ship, label: "Ferry" },
    { type: "cruise", color: "#7c3aed", icon: Anchor, label: "Cruise" },
  ];

  return (
    <div className="flex flex-col h-full">
      {/* Search bar */}
      <div className="border-b border-border bg-card px-4 py-3">
        <form onSubmit={handleSearch} className="flex items-center gap-3 max-w-2xl" data-testid="search-form">
          <div className="flex-1 relative">
            <Input
              data-testid="input-from"
              value={fromCity}
              onChange={e => setFromCity(e.target.value)}
              placeholder="From city..."
              className="bg-background h-9 text-sm border-foreground/20"
            />
          </div>
          <span className="text-foreground text-sm font-bold">→</span>
          <div className="flex-1 relative">
            <Input
              data-testid="input-to"
              value={toCity}
              onChange={e => setToCity(e.target.value)}
              placeholder="To city..."
              className="bg-background h-9 text-sm border-foreground/20"
            />
          </div>
          <Button
            type="submit"
            size="sm"
            className="gap-1.5 h-9 bg-[#FF0066] hover:bg-[#E6005C] text-white border-0"
            data-testid="button-plan-route"
            disabled={routeLoading}
          >
            {routeLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
            <span className="text-[11px] font-bold uppercase tracking-[0.08em]">Plan Route</span>
          </Button>
        </form>
      </div>

      {/* Main content: Map + Sidebar */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        {/* Map */}
        <div className="relative flex-1 lg:w-[60%]">
          {routeLoading ? (
            <div className="w-full h-full flex items-center justify-center bg-background">
              <div className="flex flex-col items-center gap-3">
                <Loader2 className="w-8 h-8 animate-spin text-[#FF0066]" />
                <p className="text-xs text-muted-foreground uppercase tracking-widest">Finding route</p>
              </div>
            </div>
          ) : (
            <RouteMap legs={legs} selectedLeg={selectedLeg} onLegSelect={setSelectedLeg} />
          )}

          {/* Map legend */}
          {legs.length > 0 && (
            <div className="absolute bottom-4 left-4 bg-card border border-border px-3 py-2 flex items-center gap-3 z-[1000]">
              {legend.map(item => (
                <div key={item.type} className="flex items-center gap-1.5">
                  <div className="w-4 h-0.5" style={{ backgroundColor: item.color }} />
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">{item.label}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="lg:w-[40%] lg:max-w-[480px] border-l border-border flex flex-col bg-card h-[40vh] lg:h-full">
          {routeData ? (
            <>
              {/* Route header */}
              <div className="px-4 py-3 border-b border-border">
                <h2 className="text-base font-bold" data-testid="route-name">
                  {routeData.name}
                </h2>
                <p className="text-[11px] text-muted-foreground mt-0.5 uppercase tracking-wider">
                  {routeData.fromCity} → {routeData.toCity}
                </p>
                <div className="mt-3">
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-[11px] h-8 gap-1 uppercase tracking-[0.08em] font-bold border-foreground/20 hover:bg-foreground hover:text-background"
                    data-testid="button-build-itinerary"
                    onClick={() => navigate(`/itinerary?routeId=${routeData.id}`)}
                  >
                    Build Itinerary
                  </Button>
                </div>
              </div>

              {/* Legs list */}
              <div className="flex-1 overflow-hidden">
                <LegsList
                  legs={legs}
                  operators={operatorsMap}
                  selectedLeg={selectedLeg}
                  onLegSelect={setSelectedLeg}
                />
              </div>

              {/* Stats bar */}
              <RouteStats route={routeData} />
            </>
          ) : routeError ? (
            <div className="flex items-center justify-center h-full p-8 text-center">
              <div>
                <p className="text-sm font-bold">No route found</p>
                <p className="text-[11px] text-muted-foreground mt-1">
                  Try searching for "Tokyo" → "Ushuaia" to see the sample route
                </p>
              </div>
            </div>
          ) : !routeLoading ? (
            <div className="flex items-center justify-center h-full p-8 text-center">
              <div>
                <div className="w-12 h-12 border border-border flex items-center justify-center mx-auto mb-3">
                  <Search className="w-5 h-5 text-[#FF0066]" />
                </div>
                <p className="text-sm font-bold">Search for a route</p>
                <p className="text-[11px] text-muted-foreground mt-1 uppercase tracking-wider">
                  Enter origin and destination cities
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-0 p-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-14 border-b border-border" />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
