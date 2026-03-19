import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Train, Bus, Ship, Anchor, ExternalLink, Star, Filter } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { Operator } from "@shared/schema";

const TRANSPORT_ICONS: Record<string, any> = {
  train: Train,
  bus: Bus,
  ferry: Ship,
  cruise: Anchor,
};

export default function OperatorsPage() {
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [countryFilter, setCountryFilter] = useState<string>("all");

  const { data: operators = [], isLoading } = useQuery<Operator[]>({
    queryKey: ["/api/operators"],
  });

  // Get unique countries
  const countries = useMemo(() => {
    const set = new Set<string>();
    operators.forEach(op => op.countries.forEach(c => set.add(c)));
    return Array.from(set).sort();
  }, [operators]);

  // Filter operators
  const filtered = useMemo(() => {
    return operators.filter(op => {
      if (search && !op.name.toLowerCase().includes(search.toLowerCase())) return false;
      if (typeFilter !== "all" && op.transportType !== typeFilter) return false;
      if (countryFilter !== "all" && !op.countries.includes(countryFilter)) return false;
      return true;
    });
  }, [operators, search, typeFilter, countryFilter]);

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="border-b border-border bg-card px-4 py-4">
        <div className="max-w-5xl mx-auto">
          <h1 className="text-xl font-black uppercase tracking-[0.04em]">
            Transport Operators
          </h1>
          <p className="text-[11px] text-muted-foreground mt-1 uppercase tracking-[0.12em]">
            {operators.length} operators across {countries.length} countries
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="border-b border-border bg-card px-4 py-2.5">
        <div className="max-w-5xl mx-auto flex items-center gap-3">
          <Filter className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
          <Input
            data-testid="input-search-operators"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search operators..."
            className="h-8 text-sm max-w-[240px] bg-background border-foreground/20"
          />
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="h-8 text-sm w-[140px] border-foreground/20" data-testid="select-type-filter">
              <SelectValue placeholder="All types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              <SelectItem value="train">Train</SelectItem>
              <SelectItem value="bus">Bus</SelectItem>
              <SelectItem value="ferry">Ferry</SelectItem>
              <SelectItem value="cruise">Cruise</SelectItem>
            </SelectContent>
          </Select>
          <Select value={countryFilter} onValueChange={setCountryFilter}>
            <SelectTrigger className="h-8 text-sm w-[180px] border-foreground/20" data-testid="select-country-filter">
              <SelectValue placeholder="All countries" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All countries</SelectItem>
              {countries.map(c => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="text-[10px] text-muted-foreground ml-auto uppercase tracking-wider font-medium">
            {filtered.length} result{filtered.length !== 1 ? "s" : ""}
          </span>
        </div>
      </div>

      {/* Grid */}
      <ScrollArea className="flex-1">
        <div className="max-w-5xl mx-auto p-4">
          {isLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {Array.from({ length: 12 }).map((_, i) => (
                <Skeleton key={i} className="h-32" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-sm text-muted-foreground">No operators match your filters</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {filtered.map(op => {
                const Icon = TRANSPORT_ICONS[op.transportType] || Train;
                return (
                  <div
                    key={op.id}
                    className="group border border-border bg-card p-4 transition-colors hover:border-[#FF0066]"
                    data-testid={`card-operator-${op.id}`}
                  >
                    <div className="flex items-start gap-3">
                      <div className="w-8 h-8 flex items-center justify-center border border-border">
                        <Icon className="w-4 h-4 text-foreground" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="text-sm font-bold truncate">{op.name}</h3>
                        <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
                          {op.countries.join(", ")}
                        </p>
                      </div>
                    </div>

                    <div className="mt-3 flex items-center gap-2">
                      <span className="text-[10px] font-bold uppercase tracking-[0.08em] border border-border px-1.5 py-0.5">
                        {op.transportType}
                      </span>
                      <div className="flex items-center gap-0.5 ml-auto">
                        {Array.from({ length: 5 }).map((_, i) => (
                          <Star
                            key={i}
                            className={`w-3 h-3 ${
                              i < op.reliabilityRating
                                ? "text-amber-400 fill-amber-400"
                                : "text-muted-foreground/30"
                            }`}
                          />
                        ))}
                      </div>
                    </div>

                    {op.bookingUrl && (
                      <a
                        href={op.bookingUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-3 inline-flex items-center gap-1 text-xs text-[#FF0066] hover:underline font-medium"
                        data-testid={`link-booking-${op.id}`}
                      >
                        Book tickets <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
