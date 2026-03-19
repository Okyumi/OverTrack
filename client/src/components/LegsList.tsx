import { useState } from "react";
import { Train, Bus, Ship, Anchor, ChevronDown, ChevronRight, ExternalLink, AlertTriangle, Shield, HelpCircle } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { RouteLeg, Operator } from "@shared/schema";

const TRANSPORT_ICONS: Record<string, any> = {
  train: Train,
  bus: Bus,
  ferry: Ship,
  cruise: Anchor,
};

const TRANSPORT_BORDER: Record<string, string> = {
  train: "border-l-blue-500",
  bus: "border-l-green-500",
  ferry: "border-l-orange-500",
  cruise: "border-l-purple-500",
};

const CONFIDENCE_CONFIG = {
  verified: { color: "bg-emerald-500", label: "Verified" },
  likely: { color: "bg-amber-500", label: "Likely" },
  unverified: { color: "bg-red-500", label: "Unverified" },
};

interface LegsListProps {
  legs: RouteLeg[];
  operators: Map<number, Operator>;
  selectedLeg: number | null;
  onLegSelect: (legId: number | null) => void;
}

export default function LegsList({ legs, operators, selectedLeg, onLegSelect }: LegsListProps) {
  const [expandedLeg, setExpandedLeg] = useState<number | null>(null);

  const handleClick = (legId: number) => {
    if (expandedLeg === legId) {
      setExpandedLeg(null);
      onLegSelect(null);
    } else {
      setExpandedLeg(legId);
      onLegSelect(legId);
    }
  };

  let lastCountry = "";

  return (
    <ScrollArea className="h-full">
      <div className="divide-y divide-border">
        {legs.map((leg, idx) => {
          const Icon = TRANSPORT_ICONS[leg.transportType] || Train;
          const conf = CONFIDENCE_CONFIG[leg.confidence];
          const operator = leg.operatorId ? operators.get(leg.operatorId) : null;
          const isExpanded = expandedLeg === leg.id;
          const isSelected = selectedLeg === leg.id;
          const borderColor = TRANSPORT_BORDER[leg.transportType] || "border-l-gray-500";

          const showFromHeader = leg.fromCountry !== lastCountry;
          const showBorderCrossing = leg.fromCountry !== leg.toCountry;
          lastCountry = leg.toCountry;

          return (
            <div key={leg.id}>
              {showFromHeader && idx > 0 && (
                <div className="flex items-center gap-3 py-2 px-4">
                  <div className="h-px flex-1 bg-border" />
                  <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground">{leg.fromCountry}</span>
                  <div className="h-px flex-1 bg-border" />
                </div>
              )}

              <button
                data-testid={`leg-item-${leg.id}`}
                onClick={() => handleClick(leg.id)}
                className={`w-full text-left px-4 py-3 transition-all border-l-[3px] ${borderColor} ${
                  isSelected
                    ? "bg-primary/5 border-l-[#FF0066]"
                    : "hover:bg-accent/50 border-l-transparent"
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 w-6 h-6 flex items-center justify-center border border-border">
                    <Icon className="w-3.5 h-3.5 text-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 text-sm font-bold">
                      <span className="truncate">{leg.fromCity}</span>
                      <span className="text-muted-foreground font-normal">→</span>
                      <span className="truncate">{leg.toCity}</span>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      {operator && (
                        <span className="text-[11px] text-muted-foreground truncate">{operator.name}</span>
                      )}
                      <span className="text-[11px] text-muted-foreground font-mono">
                        {leg.durationHours < 1 
                          ? `${Math.round(leg.durationHours * 60)}min`
                          : leg.durationHours >= 24
                            ? `${Math.round(leg.durationHours / 24)}d ${Math.round(leg.durationHours % 24)}h`
                            : `${Math.round(leg.durationHours)}h`
                        }
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <div className="flex items-center gap-1" title={conf.label}>
                      <div className={`w-2 h-2 ${conf.color}`} style={{ borderRadius: "50%" }} />
                    </div>
                    {isExpanded ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />}
                  </div>
                </div>

                {/* Expanded details */}
                {isExpanded && (
                  <div className="mt-3 pt-3 border-t border-border space-y-2 text-xs" onClick={e => e.stopPropagation()}>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-bold uppercase tracking-[0.08em] border border-border px-1.5 py-0.5">{conf.label}</span>
                      <span className="text-[10px] font-bold uppercase tracking-[0.08em] border border-border px-1.5 py-0.5">{leg.transportType}</span>
                      <span className="text-muted-foreground font-mono">{leg.distanceKm.toLocaleString()} km</span>
                    </div>

                    {leg.notes && (
                      <p className="text-muted-foreground leading-relaxed">{leg.notes}</p>
                    )}

                    {showBorderCrossing && leg.borderCrossingNotes && (
                      <div className="flex gap-2 p-2 border-l-4 border-l-[#FF0066] bg-accent/50">
                        <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-foreground" />
                        <span className="text-foreground">{leg.borderCrossingNotes}</span>
                      </div>
                    )}

                    {leg.visaNotes && (
                      <div className="flex gap-2 p-2 border-l-4 border-l-[#FF0066] bg-accent/50">
                        <Shield className="w-3.5 h-3.5 shrink-0 mt-0.5 text-foreground" />
                        <span className="text-foreground">{leg.visaNotes}</span>
                      </div>
                    )}

                    {operator?.bookingUrl && (
                      <a
                        href={operator.bookingUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-primary hover:underline font-medium"
                        data-testid={`booking-link-${leg.id}`}
                      >
                        Book via {operator.name} <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </div>
                )}
              </button>
            </div>
          );
        })}
      </div>
    </ScrollArea>
  );
}
