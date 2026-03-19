import { z } from "zod";

// ---- Types (no drizzle/pg needed for in-memory storage) ----

export interface Operator {
  id: number;
  name: string;
  countries: string[];
  transportType: "train" | "bus" | "ferry" | "cruise";
  bookingUrl: string;
  reliabilityRating: number; // 1-5
  logoUrl: string;
}

export interface RouteLeg {
  id: number;
  routeId: number;
  legOrder: number;
  fromCity: string;
  fromCountry: string;
  fromLat: number;
  fromLng: number;
  toCity: string;
  toCountry: string;
  toLat: number;
  toLng: number;
  operatorId: number | null;
  transportType: "train" | "bus" | "ferry" | "cruise";
  durationHours: number;
  distanceKm: number;
  confidence: "verified" | "likely" | "unverified";
  notes: string;
  visaNotes: string;
  borderCrossingNotes: string;
}

export interface Route {
  id: number;
  name: string;
  fromCity: string;
  toCity: string;
  totalLegs: number;
  totalCountries: number;
  totalDistanceKm: number;
  totalDurationHours: number;
  co2SavedKg: number;
  createdAt: string;
}

export interface Itinerary {
  id: number;
  routeId: number;
  departureDate: string;
  pace: "fast" | "moderate" | "slow";
  restDays: { city: string; days: number }[];
}

// ---- Insert schemas ----

export const insertOperatorSchema = z.object({
  name: z.string().min(1),
  countries: z.array(z.string()),
  transportType: z.enum(["train", "bus", "ferry", "cruise"]),
  bookingUrl: z.string(),
  reliabilityRating: z.number().min(1).max(5),
  logoUrl: z.string().optional().default(""),
});

export const insertRouteLegSchema = z.object({
  routeId: z.number(),
  legOrder: z.number(),
  fromCity: z.string(),
  fromCountry: z.string(),
  fromLat: z.number(),
  fromLng: z.number(),
  toCity: z.string(),
  toCountry: z.string(),
  toLat: z.number(),
  toLng: z.number(),
  operatorId: z.number().nullable(),
  transportType: z.enum(["train", "bus", "ferry", "cruise"]),
  durationHours: z.number(),
  distanceKm: z.number(),
  confidence: z.enum(["verified", "likely", "unverified"]),
  notes: z.string().optional().default(""),
  visaNotes: z.string().optional().default(""),
  borderCrossingNotes: z.string().optional().default(""),
});

export const insertRouteSchema = z.object({
  name: z.string(),
  fromCity: z.string(),
  toCity: z.string(),
  totalLegs: z.number(),
  totalCountries: z.number(),
  totalDistanceKm: z.number(),
  totalDurationHours: z.number(),
  co2SavedKg: z.number(),
});

export const insertItinerarySchema = z.object({
  routeId: z.number(),
  departureDate: z.string(),
  pace: z.enum(["fast", "moderate", "slow"]),
  restDays: z.array(z.object({ city: z.string(), days: z.number() })),
});

export type InsertOperator = z.infer<typeof insertOperatorSchema>;
export type InsertRouteLeg = z.infer<typeof insertRouteLegSchema>;
export type InsertRoute = z.infer<typeof insertRouteSchema>;
export type InsertItinerary = z.infer<typeof insertItinerarySchema>;
