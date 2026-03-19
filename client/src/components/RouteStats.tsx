import { MapPin, Globe, Clock, Leaf, Ruler } from "lucide-react";
import type { Route } from "@shared/schema";

interface RouteStatsProps {
  route: Route;
}

export default function RouteStats({ route }: RouteStatsProps) {
  const stats = [
    {
      icon: MapPin,
      label: "LEGS",
      value: route.totalLegs.toString(),
    },
    {
      icon: Globe,
      label: "COUNTRIES",
      value: route.totalCountries.toString(),
    },
    {
      icon: Ruler,
      label: "DISTANCE",
      value: `${(route.totalDistanceKm / 1000).toFixed(1)}k km`,
    },
    {
      icon: Clock,
      label: "DURATION",
      value: `${Math.round(route.totalDurationHours / 24)} days`,
    },
    {
      icon: Leaf,
      label: "CO₂ SAVED",
      value: `${(route.co2SavedKg / 1000).toFixed(1)}t`,
    },
  ];

  return (
    <div className="flex items-center overflow-x-auto bg-black text-white" data-testid="route-stats">
      {stats.map((stat, i) => (
        <div
          key={stat.label}
          className={`flex items-center gap-2.5 px-4 py-2.5 ${
            i < stats.length - 1 ? "border-r border-white/10" : ""
          }`}
        >
          <stat.icon className="w-3.5 h-3.5 text-[#FF0066] shrink-0" />
          <div className="flex items-baseline gap-1.5">
            <span className="text-sm font-bold font-mono whitespace-nowrap">{stat.value}</span>
            <span className="text-[10px] font-medium tracking-[0.1em] text-white/50 whitespace-nowrap">{stat.label}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
