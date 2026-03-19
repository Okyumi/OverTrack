import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertItinerarySchema } from "@shared/schema";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  // ---- Routes ----
  app.get("/api/routes", async (_req, res) => {
    const routes = await storage.getRoutes();
    res.json(routes);
  });

  app.get("/api/routes/:id", async (req, res) => {
    const id = parseInt(req.params.id);
    const route = await storage.getRoute(id);
    if (!route) return res.status(404).json({ error: "Route not found" });

    const legs = await storage.getRouteLegs(id);
    res.json({ ...route, legs });
  });

  app.get("/api/routes/:id/legs", async (req, res) => {
    const id = parseInt(req.params.id);
    const legs = await storage.getRouteLegs(id);
    res.json(legs);
  });

  app.post("/api/routes/search", async (req, res) => {
    const { fromCity, toCity } = req.body;
    if (!fromCity || !toCity) {
      return res.status(400).json({ error: "fromCity and toCity are required" });
    }
    const route = await storage.searchRoutes(fromCity, toCity);
    if (!route) {
      return res.status(404).json({ error: "No route found matching those cities" });
    }
    const legs = await storage.getRouteLegs(route.id);
    res.json({ ...route, legs });
  });

  // ---- Operators ----
  app.get("/api/operators", async (req, res) => {
    const country = req.query.country as string | undefined;
    const type = req.query.type as string | undefined;
    const operators = await storage.getOperators(country, type);
    res.json(operators);
  });

  app.get("/api/operators/:id", async (req, res) => {
    const id = parseInt(req.params.id);
    const op = await storage.getOperator(id);
    if (!op) return res.status(404).json({ error: "Operator not found" });
    res.json(op);
  });

  // ---- Itineraries ----
  app.post("/api/itineraries", async (req, res) => {
    const parsed = insertItinerarySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.errors });
    }
    const itinerary = await storage.createItinerary(parsed.data);
    res.json(itinerary);
  });

  app.get("/api/itineraries/:id", async (req, res) => {
    const id = parseInt(req.params.id);
    const itinerary = await storage.getItinerary(id);
    if (!itinerary) return res.status(404).json({ error: "Itinerary not found" });
    res.json(itinerary);
  });

  return httpServer;
}
