import type {
  Operator, RouteLeg, Route, Itinerary,
  InsertOperator, InsertRouteLeg, InsertRoute, InsertItinerary,
} from "@shared/schema";

// ---- Graph types ----
interface CityNode {
  name: string;
  country: string;
  lat: number;
  lng: number;
}

interface TransportEdge {
  from: string;
  to: string;
  operatorId: number | null;
  transportType: "train" | "bus" | "ferry" | "cruise";
  durationHours: number;
  distanceKm: number;
  confidence: "verified" | "likely" | "unverified";
  notes: string;
  visaNotes: string;
  borderCrossingNotes: string;
}

// ---- Storage interface ----
export interface IStorage {
  getOperators(country?: string, type?: string): Promise<Operator[]>;
  getOperator(id: number): Promise<Operator | undefined>;
  getRoutes(): Promise<Route[]>;
  getRoute(id: number): Promise<Route | undefined>;
  getRouteLegs(routeId: number): Promise<RouteLeg[]>;
  searchRoutes(fromCity: string, toCity: string): Promise<Route | undefined>;
  createRoute(route: InsertRoute): Promise<Route>;
  createItinerary(itinerary: InsertItinerary): Promise<Itinerary>;
  getItinerary(id: number): Promise<Itinerary | undefined>;
}

// ---- Dijkstra ----
function dijkstra(
  adjacency: Map<string, { to: string; edgeIndex: number; weight: number }[]>,
  start: string,
  end: string
): number[] | null {
  const dist = new Map<string, number>();
  const prev = new Map<string, { node: string; edgeIndex: number } | null>();
  const visited = new Set<string>();

  dist.set(start, 0);
  prev.set(start, null);

  // Simple priority queue via array (adequate for ~200 nodes)
  const pq: { node: string; cost: number }[] = [{ node: start, cost: 0 }];

  while (pq.length > 0) {
    pq.sort((a, b) => a.cost - b.cost);
    const current = pq.shift()!;
    if (visited.has(current.node)) continue;
    visited.add(current.node);

    if (current.node === end) break;

    const neighbors = adjacency.get(current.node) || [];
    for (const edge of neighbors) {
      if (visited.has(edge.to)) continue;
      const newDist = current.cost + edge.weight;
      if (!dist.has(edge.to) || newDist < dist.get(edge.to)!) {
        dist.set(edge.to, newDist);
        prev.set(edge.to, { node: current.node, edgeIndex: edge.edgeIndex });
        pq.push({ node: edge.to, cost: newDist });
      }
    }
  }

  if (!prev.has(end)) return null;

  // Reconstruct path as edge indices
  const edgeIndices: number[] = [];
  let cur = end;
  while (prev.get(cur) !== null) {
    const p = prev.get(cur)!;
    edgeIndices.unshift(p.edgeIndex);
    cur = p.node;
  }
  return edgeIndices;
}

// ---- MemStorage ----
export class MemStorage implements IStorage {
  private operators: Map<number, Operator> = new Map();
  private routes: Map<number, Route> = new Map();
  private routeLegs: Map<number, RouteLeg[]> = new Map();
  private itineraries: Map<number, Itinerary> = new Map();
  private nextOperatorId = 1;
  private nextRouteId = 1;
  private nextLegId = 1;
  private nextItineraryId = 1;

  // Graph data
  private cities: Map<string, CityNode> = new Map();
  private edges: TransportEdge[] = [];
  private adjacency: Map<string, { to: string; edgeIndex: number; weight: number }[]> = new Map();

  constructor() {
    this.seedOperators();
    this.seedGraph();
    this.buildAdjacency();
  }

  // ---- Operators ----
  async getOperators(country?: string, type?: string): Promise<Operator[]> {
    let ops = Array.from(this.operators.values());
    if (country) {
      ops = ops.filter(o => o.countries.some(c => c.toLowerCase().includes(country.toLowerCase())));
    }
    if (type) {
      ops = ops.filter(o => o.transportType === type);
    }
    return ops;
  }

  async getOperator(id: number): Promise<Operator | undefined> {
    return this.operators.get(id);
  }

  // ---- Routes ----
  async getRoutes(): Promise<Route[]> {
    return Array.from(this.routes.values());
  }

  async getRoute(id: number): Promise<Route | undefined> {
    return this.routes.get(id);
  }

  async getRouteLegs(routeId: number): Promise<RouteLeg[]> {
    return (this.routeLegs.get(routeId) || []).sort((a, b) => a.legOrder - b.legOrder);
  }

  async searchRoutes(fromCity: string, toCity: string): Promise<Route | undefined> {
    const fromNode = this.fuzzyMatchCity(fromCity);
    const toNode = this.fuzzyMatchCity(toCity);
    if (!fromNode || !toNode) return undefined;
    if (fromNode === toNode) return undefined;

    const edgeIndices = dijkstra(this.adjacency, fromNode, toNode);
    if (!edgeIndices || edgeIndices.length === 0) return undefined;

    // Build route
    const routeId = this.nextRouteId++;
    let totalDistance = 0;
    let totalDuration = 0;
    const countriesSet = new Set<string>();
    const legs: RouteLeg[] = [];

    for (let i = 0; i < edgeIndices.length; i++) {
      const edge = this.edges[edgeIndices[i]];
      const fromC = this.cities.get(edge.from)!;
      const toC = this.cities.get(edge.to)!;
      countriesSet.add(fromC.country);
      countriesSet.add(toC.country);
      totalDistance += edge.distanceKm;
      totalDuration += edge.durationHours;

      const legId = this.nextLegId++;
      legs.push({
        id: legId,
        routeId,
        legOrder: i + 1,
        fromCity: fromC.name,
        fromCountry: fromC.country,
        fromLat: fromC.lat,
        fromLng: fromC.lng,
        toCity: toC.name,
        toCountry: toC.country,
        toLat: toC.lat,
        toLng: toC.lng,
        operatorId: edge.operatorId,
        transportType: edge.transportType,
        durationHours: edge.durationHours,
        distanceKm: edge.distanceKm,
        confidence: edge.confidence,
        notes: edge.notes,
        visaNotes: edge.visaNotes,
        borderCrossingNotes: edge.borderCrossingNotes,
      });
    }

    const co2SavedKg = Math.round(totalDistance * 0.215);
    const route: Route = {
      id: routeId,
      name: `${fromNode} → ${toNode}`,
      fromCity: fromNode,
      toCity: toNode,
      totalLegs: legs.length,
      totalCountries: countriesSet.size,
      totalDistanceKm: Math.round(totalDistance),
      totalDurationHours: Math.round(totalDuration * 10) / 10,
      co2SavedKg,
      createdAt: new Date().toISOString(),
    };

    this.routes.set(routeId, route);
    this.routeLegs.set(routeId, legs);
    return route;
  }

  async createRoute(data: InsertRoute): Promise<Route> {
    const route: Route = { ...data, id: this.nextRouteId++, createdAt: new Date().toISOString() };
    this.routes.set(route.id, route);
    return route;
  }

  // ---- Itineraries ----
  async createItinerary(data: InsertItinerary): Promise<Itinerary> {
    const itinerary: Itinerary = { ...data, id: this.nextItineraryId++ };
    this.itineraries.set(itinerary.id, itinerary);
    return itinerary;
  }

  async getItinerary(id: number): Promise<Itinerary | undefined> {
    return this.itineraries.get(id);
  }

  // ---- Fuzzy city matching ----
  private fuzzyMatchCity(input: string): string | undefined {
    const lower = input.toLowerCase().trim();
    // Exact match first
    for (const [name] of this.cities) {
      if (name.toLowerCase() === lower) return name;
    }
    // Partial match
    for (const [name] of this.cities) {
      if (name.toLowerCase().includes(lower) || lower.includes(name.toLowerCase())) return name;
    }
    // Handle common aliases
    const aliases: Record<string, string> = {
      "dc": "Washington DC", "washington": "Washington DC", "washington d.c.": "Washington DC",
      "la": "Los Angeles", "sf": "San Francisco", "nyc": "New York",
      "hk": "Hong Kong", "kl": "Kuala Lumpur", "bkk": "Bangkok",
      "spb": "St Petersburg", "saint petersburg": "St Petersburg",
      "nursultan": "Astana", "bombay": "Mumbai", "calcutta": "Kolkata",
      "madras": "Chennai", "peking": "Beijing", "saigon": "Ho Chi Minh City",
      "sao paulo": "São Paulo", "rio": "Rio de Janeiro",
    };
    if (aliases[lower]) {
      return this.cities.has(aliases[lower]) ? aliases[lower] : undefined;
    }
    return undefined;
  }

  // ---- Build adjacency list from edges ----
  private buildAdjacency() {
    this.adjacency.clear();
    for (let i = 0; i < this.edges.length; i++) {
      const edge = this.edges[i];
      if (!this.adjacency.has(edge.from)) this.adjacency.set(edge.from, []);
      this.adjacency.get(edge.from)!.push({ to: edge.to, edgeIndex: i, weight: edge.durationHours });
    }
  }

  // ---- Helper to add a city ----
  private addCity(name: string, country: string, lat: number, lng: number) {
    this.cities.set(name, { name, country, lat, lng });
  }

  // ---- Helper to add a bidirectional edge ----
  private addEdge(
    from: string, to: string, operatorId: number | null,
    type: "train" | "bus" | "ferry" | "cruise",
    hours: number, km: number,
    conf: "verified" | "likely" | "unverified" = "verified",
    notes = "", visa = "", border = ""
  ) {
    this.edges.push({ from, to, operatorId, transportType: type, durationHours: hours, distanceKm: km, confidence: conf, notes, visaNotes: visa, borderCrossingNotes: border });
    this.edges.push({ from: to, to: from, operatorId, transportType: type, durationHours: hours, distanceKm: km, confidence: conf, notes, visaNotes: visa, borderCrossingNotes: border });
  }

  // ---- One-way edge (e.g. Darién Gap) ----
  private addOneWayEdge(
    from: string, to: string, operatorId: number | null,
    type: "train" | "bus" | "ferry" | "cruise",
    hours: number, km: number,
    conf: "verified" | "likely" | "unverified" = "unverified",
    notes = "", visa = "", border = ""
  ) {
    this.edges.push({ from, to, operatorId, transportType: type, durationHours: hours, distanceKm: km, confidence: conf, notes, visaNotes: visa, borderCrossingNotes: border });
  }

  // ---- Helper to add an operator ----
  private addOp(name: string, countries: string[], type: "train" | "bus" | "ferry" | "cruise", url: string, rating: number): number {
    const id = this.nextOperatorId++;
    this.operators.set(id, { id, name, countries, transportType: type, bookingUrl: url, reliabilityRating: rating, logoUrl: "" });
    return id;
  }

  // ===================== SEED OPERATORS =====================
  private opIds: Record<string, number> = {};

  private seedOperators() {
    const a = (key: string, name: string, countries: string[], type: "train" | "bus" | "ferry" | "cruise", url: string, rating: number) => {
      this.opIds[key] = this.addOp(name, countries, type, url, rating);
    };

    // ---- Rail operators ----
    a("jr", "JR (Japan Railways)", ["Japan"], "train", "https://www.jrpass.com", 5);
    a("korail", "Korail", ["South Korea"], "train", "https://www.letskorail.com", 5);
    a("cr", "China Railway (CR)", ["China"], "train", "https://www.12306.cn", 4);
    a("vietnamRail", "Vietnam Railways", ["Vietnam"], "train", "https://dsvn.vn", 3);
    a("srt", "SRT (State Railway Thailand)", ["Thailand"], "train", "https://www.railway.co.th", 3);
    a("ktm", "KTM (Keretapi Tanah Melayu)", ["Malaysia"], "train", "https://www.ktmb.com.my", 4);
    a("kcic", "KCIC (Kereta Cepat Indonesia China)", ["Indonesia"], "train", "https://www.kcic.co.id", 4);
    a("indianRail", "Indian Railways", ["India"], "train", "https://www.irctc.co.in", 3);
    a("pakistanRail", "Pakistan Railways", ["Pakistan"], "train", "https://www.pakrail.gov.pk", 2);
    a("mongolianRail", "Mongolian Railway (UBTZ)", ["Mongolia"], "train", "https://www.mtz.mn", 3);
    a("rzd", "Russian Railways (RZD)", ["Russia"], "train", "https://www.rzd.ru", 4);
    a("eurostar", "Eurostar", ["United Kingdom", "France", "Belgium", "Netherlands"], "train", "https://www.eurostar.com", 5);
    a("thalys", "Thalys", ["France", "Belgium", "Netherlands", "Germany"], "train", "https://www.thalys.com", 5);
    a("sncf", "SNCF / TGV", ["France"], "train", "https://www.sncf-connect.com", 5);
    a("db", "Deutsche Bahn (DB)", ["Germany", "Austria", "Czech Republic"], "train", "https://www.bahn.de", 4);
    a("obb", "ÖBB (Austrian Federal Railways)", ["Austria", "Hungary", "Czech Republic"], "train", "https://www.oebb.at", 5);
    a("sbb", "SBB (Swiss Federal Railways)", ["Switzerland"], "train", "https://www.sbb.ch", 5);
    a("trenitalia", "Trenitalia", ["Italy"], "train", "https://www.trenitalia.com", 4);
    a("renfe", "Renfe", ["Spain"], "train", "https://www.renfe.com", 4);
    a("cp", "CP (Comboios de Portugal)", ["Portugal"], "train", "https://www.cp.pt", 4);
    a("ns", "NS (Nederlandse Spoorwegen)", ["Netherlands"], "train", "https://www.ns.nl", 5);
    a("dsb", "DSB (Danish State Railways)", ["Denmark"], "train", "https://www.dsb.dk", 4);
    a("sj", "SJ (Swedish Railways)", ["Sweden"], "train", "https://www.sj.se", 4);
    a("vr", "VR (Finnish Railways)", ["Finland"], "train", "https://www.vr.fi", 4);
    a("pkp", "PKP Intercity", ["Poland"], "train", "https://www.intercity.pl", 4);
    a("zssk", "ZSSK (Slovak Railways)", ["Slovakia"], "train", "https://www.zssk.sk", 3);
    a("mav", "MÁV-START", ["Hungary"], "train", "https://www.mavcsoport.hu", 3);
    a("cfr", "CFR Călători", ["Romania"], "train", "https://www.cfrcalatori.ro", 3);
    a("bdz", "BDZ (Bulgarian State Railways)", ["Bulgaria"], "train", "https://www.bdz.bg", 3);
    a("sz", "SŽ (Slovenian Railways)", ["Slovenia"], "train", "https://www.slo-zeleznice.si", 4);
    a("hz", "HŽ (Croatian Railways)", ["Croatia"], "train", "https://www.hzpp.hr", 3);
    a("tcdd", "TCDD (Turkish State Railways)", ["Turkey"], "train", "https://www.tcddtasimacilik.gov.tr", 3);
    a("amtrak", "Amtrak", ["United States"], "train", "https://www.amtrak.com", 4);
    a("viaRail", "VIA Rail Canada", ["Canada"], "train", "https://www.viarail.ca", 4);
    a("elron", "Elron", ["Estonia"], "train", "https://elron.ee", 4);
    a("pv", "Pasažieru vilciens", ["Latvia"], "train", "https://www.pv.lv", 4);
    a("ltg", "LTG Link", ["Lithuania"], "train", "https://ltglink.lt", 4);
    a("serbianRail", "Srbija Voz", ["Serbia"], "train", "https://www.srbijavoz.rs", 3);
    a("taiwanRail", "Taiwan Railways / THSR", ["Taiwan"], "train", "https://www.thsrc.com.tw", 5);

    // ---- Bus operators ----
    a("flixbus", "FlixBus", ["Germany", "Europe", "United States"], "bus", "https://www.flixbus.com", 4);
    a("greyhound", "Greyhound", ["United States"], "bus", "https://www.greyhound.com", 3);
    a("boltbus", "BoltBus", ["United States"], "bus", "https://www.boltbus.com", 3);
    a("ado", "ADO", ["Mexico"], "bus", "https://www.ado.com.mx", 4);
    a("ticaBus", "Tica Bus", ["Guatemala", "El Salvador", "Honduras", "Nicaragua", "Costa Rica", "Panama"], "bus", "https://www.ticabus.com", 3);
    a("cruzDelSur", "Cruz del Sur", ["Peru"], "bus", "https://www.cruzdelsur.com.pe", 4);
    a("turbus", "Turbus", ["Chile"], "bus", "https://www.turbus.cl", 4);
    a("pullmanBus", "Pullman Bus", ["Chile"], "bus", "https://www.pullman.cl", 4);
    a("alsa", "ALSA", ["Spain", "Morocco"], "bus", "https://www.alsa.com", 4);
    a("nationalExpress", "National Express", ["United Kingdom"], "bus", "https://www.nationalexpress.com", 4);
    a("eurolines", "Eurolines", ["Europe"], "bus", "https://www.eurolines.eu", 3);
    a("ecolines", "Ecolines", ["Estonia", "Latvia", "Lithuania", "Poland", "Russia"], "bus", "https://www.ecolines.net", 4);
    a("luxExpress", "Lux Express", ["Estonia", "Latvia", "Lithuania", "Finland", "Russia"], "bus", "https://www.luxexpress.eu", 4);
    a("redbus", "RedBus", ["India"], "bus", "https://www.redbus.in", 3);
    a("nakhonchaiAir", "Nakhonchai Air", ["Thailand"], "bus", "https://www.nakhonchaiair.com", 4);
    a("mekongExpress", "Mekong Express", ["Cambodia", "Vietnam"], "bus", "https://www.catmekongexpress.com", 3);
    a("busbud", "Busbud", ["Worldwide"], "bus", "https://www.busbud.com", 3);
    a("kamalanBus", "Kamalan Bus (Iran Peyma)", ["Iran"], "bus", "https://www.iranpeyma.com", 3);
    a("metroPk", "Metro (Daewoo Express)", ["Pakistan"], "bus", "https://www.daewoo.com.pk", 3);
    a("greenLine", "GreenLine", ["Bangladesh"], "bus", "https://www.greenlinebd.com", 3);
    a("colombiaBus", "Bolivariano", ["Colombia"], "bus", "https://www.bolivariano.com.co", 3);
    a("argentinaBus", "Via Bariloche", ["Argentina"], "bus", "https://www.viabariloche.com.ar", 4);
    a("brazilBus", "Viação Cometa", ["Brazil"], "bus", "https://www.viacaocometa.com.br", 3);

    // ---- Ferry / Cruise operators ----
    a("cunard", "Cunard (Queen Mary 2)", ["United Kingdom", "United States"], "cruise", "https://www.cunard.com", 5);
    a("smyrilLine", "Smyril Line", ["Denmark", "Faroe Islands", "Iceland"], "ferry", "https://www.smyrilline.com", 4);
    a("vikingLine", "Viking Line", ["Sweden", "Finland", "Estonia"], "ferry", "https://www.vikingline.com", 4);
    a("tallinkSilja", "Tallink Silja", ["Estonia", "Finland", "Sweden", "Latvia"], "ferry", "https://www.tallink.com", 4);
    a("stenaLine", "Stena Line", ["Sweden", "Denmark", "Germany", "United Kingdom", "Netherlands"], "ferry", "https://www.stenaline.com", 4);
    a("dfds", "DFDS", ["Denmark", "Norway", "Sweden", "United Kingdom", "Netherlands", "France"], "ferry", "https://www.dfds.com", 4);
    a("corsicaFerries", "Corsica Ferries", ["France", "Italy"], "ferry", "https://www.corsica-ferries.co.uk", 3);
    a("gnv", "GNV (Grandi Navi Veloci)", ["Italy", "Spain", "Morocco", "Tunisia"], "ferry", "https://www.gnv.it", 3);
    a("tirrenia", "Tirrenia", ["Italy"], "ferry", "https://www.tirrenia.it", 3);
    a("blueStarFerries", "Blue Star Ferries", ["Greece"], "ferry", "https://www.bluestarferries.com", 4);
    a("anekLines", "ANEK Lines", ["Greece", "Italy"], "ferry", "https://www.anek.gr", 3);
    a("trasmediterranea", "Trasmediterranea", ["Spain", "Morocco"], "ferry", "https://www.trasmediterranea.es", 4);
    a("frs", "FRS (Ferries del Estrecho)", ["Spain", "Morocco"], "ferry", "https://www.frs.es", 4);
    a("newCamellia", "New Camellia Line", ["Japan", "South Korea"], "ferry", "https://www.camellia-line.co.jp", 4);
    a("jinchin", "Jinchin Ferry", ["South Korea", "China"], "ferry", "https://www.jinchon.co.kr", 3);
    a("tabsa", "TABSA Ferry", ["Chile"], "ferry", "https://www.tabsa.cl", 3);
    a("sanBlas", "San Blas Adventures", ["Panama", "Colombia"], "ferry", "https://www.sanblasadventures.com", 2);
    a("pelni", "Pelni", ["Indonesia"], "ferry", "https://www.pelni.co.id", 3);
    a("starCruises", "Star Cruises", ["Malaysia", "Singapore", "Thailand"], "cruise", "https://www.starcruises.com", 3);
    a("quark", "Quark Expeditions", ["Argentina", "Antarctica"], "cruise", "https://www.quarkexpeditions.com", 5);
    a("navieraAustral", "Naviera Austral", ["Chile"], "ferry", "https://www.navieraustral.cl", 3);

    // Extra operators to surpass 100
    a("italo", "Italo (NTV)", ["Italy"], "train", "https://www.italotreno.it", 5);
    a("ouigo", "OUIGO", ["France", "Spain"], "train", "https://www.ouigo.com", 4);
    a("avlo", "Avlo (Renfe low-cost)", ["Spain"], "train", "https://www.renfe.com/es/es/viajar/avlo", 4);
    a("iryo", "iryo", ["Spain"], "train", "https://www.iryo.eu", 4);
    a("westbahn", "WESTbahn", ["Austria", "Germany"], "train", "https://www.westbahn.at", 4);
    a("regiojet", "RegioJet", ["Czech Republic", "Slovakia", "Austria", "Hungary", "Poland"], "train", "https://www.regiojet.com", 4);
    a("leo", "Leo Express", ["Czech Republic", "Slovakia", "Poland"], "train", "https://www.leoexpress.com", 4);
    a("hellenic", "Hellenic Train (TrainOSE)", ["Greece"], "train", "https://www.hellenictrain.gr", 3);
    a("renfeAve", "Renfe AVE", ["Spain"], "train", "https://www.renfe.com", 5);
    a("thello", "Thello", ["France", "Italy"], "train", "https://www.thello.com", 3);
    a("iranRail", "Raja Rail (Iran)", ["Iran"], "train", "https://www.raja.ir", 3);
    a("ethiopiaRail", "Ethio-Djibouti Railway", ["Ethiopia", "Djibouti"], "train", "https://www.erc.gov.et", 3);
    a("moroccoRail", "ONCF (Morocco)", ["Morocco"], "train", "https://www.oncf.ma", 4);
    a("egyptRail", "Egyptian National Railways", ["Egypt"], "train", "https://www.enr.gov.eg", 3);
    a("kenyaRail", "Kenya Railways (Madaraka Express)", ["Kenya"], "train", "https://metickets.krc.co.ke", 4);
    a("tanzaniaRail", "TAZARA", ["Tanzania", "Zambia"], "train", "https://www.tazarasite.com", 2);
    a("sriLankaRail", "Sri Lanka Railways", ["Sri Lanka"], "train", "https://www.railway.gov.lk", 3);
    a("nepalBus", "Sajha Yatayat", ["Nepal"], "bus", "https://sajhayatayat.com.np", 3);
    a("myanmarBus", "JJ Express", ["Myanmar"], "bus", "https://www.jjexpress.net", 3);
    a("laosBus", "Laos-Vietnam Bus", ["Laos", "Vietnam"], "bus", "https://12go.asia", 3);
  }

  // ===================== SEED GRAPH =====================
  private seedGraph() {
    const op = this.opIds;

    // ==================== CITIES ====================

    // East Asia — Japan
    this.addCity("Tokyo", "Japan", 35.6762, 139.6503);
    this.addCity("Osaka", "Japan", 34.6937, 135.5023);
    this.addCity("Kyoto", "Japan", 35.0116, 135.7681);
    this.addCity("Hiroshima", "Japan", 34.3853, 132.4553);
    this.addCity("Fukuoka", "Japan", 33.5904, 130.4017);
    this.addCity("Sapporo", "Japan", 43.0618, 141.3545);
    this.addCity("Nagoya", "Japan", 35.1815, 136.9066);
    this.addCity("Kanazawa", "Japan", 36.5613, 136.6562);

    // East Asia — South Korea
    this.addCity("Seoul", "South Korea", 37.5665, 126.978);
    this.addCity("Busan", "South Korea", 35.1796, 129.0756);
    this.addCity("Daegu", "South Korea", 35.8714, 128.6014);
    this.addCity("Gwangju", "South Korea", 35.1595, 126.8526);
    this.addCity("Incheon", "South Korea", 37.4563, 126.7052);

    // East Asia — China
    this.addCity("Beijing", "China", 39.9042, 116.4074);
    this.addCity("Shanghai", "China", 31.2304, 121.4737);
    this.addCity("Guangzhou", "China", 23.1291, 113.2644);
    this.addCity("Chengdu", "China", 30.5728, 104.0668);
    this.addCity("Xi'an", "China", 34.3416, 108.9398);
    this.addCity("Kunming", "China", 25.0389, 102.7183);
    this.addCity("Urumqi", "China", 43.8256, 87.6168);
    this.addCity("Lhasa", "China", 29.6500, 91.1000);
    this.addCity("Harbin", "China", 45.8038, 126.535);
    this.addCity("Tianjin", "China", 39.3434, 117.3616);
    this.addCity("Nanning", "China", 22.817, 108.3669);
    this.addCity("Shenzhen", "China", 22.5431, 114.0579);

    // East Asia — Taiwan
    this.addCity("Taipei", "Taiwan", 25.033, 121.5654);
    this.addCity("Kaohsiung", "Taiwan", 22.6273, 120.3014);

    // Southeast Asia
    this.addCity("Hanoi", "Vietnam", 21.0285, 105.8542);
    this.addCity("Ho Chi Minh City", "Vietnam", 10.8231, 106.6297);
    this.addCity("Da Nang", "Vietnam", 16.0544, 108.2022);
    this.addCity("Hue", "Vietnam", 16.4637, 107.5909);
    this.addCity("Bangkok", "Thailand", 13.7563, 100.5018);
    this.addCity("Chiang Mai", "Thailand", 18.7884, 98.9853);
    this.addCity("Hat Yai", "Thailand", 7.0065, 100.4747);
    this.addCity("Vientiane", "Laos", 17.9757, 102.6331);
    this.addCity("Luang Prabang", "Laos", 19.8863, 102.1347);
    this.addCity("Phnom Penh", "Cambodia", 11.5564, 104.9282);
    this.addCity("Siem Reap", "Cambodia", 13.3671, 103.8448);
    this.addCity("Yangon", "Myanmar", 16.8661, 96.1951);
    this.addCity("Mandalay", "Myanmar", 21.9588, 96.0891);
    this.addCity("Kuala Lumpur", "Malaysia", 3.139, 101.6869);
    this.addCity("Penang", "Malaysia", 5.4164, 100.3327);
    this.addCity("Johor Bahru", "Malaysia", 1.4927, 103.7414);
    this.addCity("Singapore", "Singapore", 1.3521, 103.8198);
    this.addCity("Jakarta", "Indonesia", -6.2088, 106.8456);
    this.addCity("Surabaya", "Indonesia", -7.2575, 112.7521);
    this.addCity("Denpasar", "Indonesia", -8.6705, 115.2126);

    // South Asia
    this.addCity("Delhi", "India", 28.6139, 77.209);
    this.addCity("Mumbai", "India", 19.076, 72.8777);
    this.addCity("Kolkata", "India", 22.5726, 88.3639);
    this.addCity("Chennai", "India", 13.0827, 80.2707);
    this.addCity("Varanasi", "India", 25.3176, 83.0102);
    this.addCity("Jaipur", "India", 26.9124, 75.7873);
    this.addCity("Amritsar", "India", 31.634, 74.8723);
    this.addCity("Kochi", "India", 9.9312, 76.2673);
    this.addCity("Goa", "India", 15.2993, 74.124);
    this.addCity("Kathmandu", "Nepal", 27.7172, 85.324);
    this.addCity("Colombo", "Sri Lanka", 6.9271, 79.8612);
    this.addCity("Dhaka", "Bangladesh", 23.8103, 90.4125);
    this.addCity("Lahore", "Pakistan", 31.5204, 74.3587);
    this.addCity("Islamabad", "Pakistan", 33.6844, 73.0479);
    this.addCity("Karachi", "Pakistan", 24.8607, 67.0011);
    this.addCity("Quetta", "Pakistan", 30.1798, 66.975);

    // Central Asia
    this.addCity("Almaty", "Kazakhstan", 43.2220, 76.8512);
    this.addCity("Astana", "Kazakhstan", 51.1694, 71.4491);
    this.addCity("Tashkent", "Uzbekistan", 41.2995, 69.2401);
    this.addCity("Samarkand", "Uzbekistan", 39.6542, 66.9597);
    this.addCity("Bukhara", "Uzbekistan", 39.7745, 64.4286);
    this.addCity("Bishkek", "Kyrgyzstan", 42.8746, 74.5698);

    // Middle East
    this.addCity("Tehran", "Iran", 35.6892, 51.389);
    this.addCity("Isfahan", "Iran", 32.6546, 51.668);
    this.addCity("Tabriz", "Iran", 38.08, 46.2919);
    this.addCity("Zahedan", "Iran", 29.4963, 60.8629);
    this.addCity("Istanbul", "Turkey", 41.0082, 28.9784);
    this.addCity("Ankara", "Turkey", 39.9334, 32.8597);
    this.addCity("Izmir", "Turkey", 38.4237, 27.1428);
    this.addCity("Van", "Turkey", 38.4942, 43.38);
    this.addCity("Amman", "Jordan", 31.9454, 35.9284);
    this.addCity("Tel Aviv", "Israel", 32.0853, 34.7818);
    this.addCity("Jerusalem", "Israel", 31.7683, 35.2137);

    // Russia & Trans-Siberian
    this.addCity("Moscow", "Russia", 55.7558, 37.6173);
    this.addCity("St Petersburg", "Russia", 59.9343, 30.3351);
    this.addCity("Yekaterinburg", "Russia", 56.8389, 60.6057);
    this.addCity("Novosibirsk", "Russia", 55.0084, 82.9357);
    this.addCity("Irkutsk", "Russia", 52.287, 104.305);
    this.addCity("Vladivostok", "Russia", 43.1332, 131.9113);
    this.addCity("Ulan-Ude", "Russia", 51.8335, 107.5842);

    // Mongolia
    this.addCity("Ulaanbaatar", "Mongolia", 47.8864, 106.9057);
    this.addCity("Zamyn-Üüd", "Mongolia", 43.725, 111.9028);

    // Europe — Western
    this.addCity("London", "United Kingdom", 51.5074, -0.1278);
    this.addCity("Southampton", "United Kingdom", 50.9097, -1.4044);
    this.addCity("Paris", "France", 48.8566, 2.3522);
    this.addCity("Amsterdam", "Netherlands", 52.3676, 4.9041);
    this.addCity("Brussels", "Belgium", 50.8503, 4.3517);
    this.addCity("Berlin", "Germany", 52.52, 13.405);
    this.addCity("Munich", "Germany", 48.1351, 11.582);
    this.addCity("Frankfurt", "Germany", 50.1109, 8.6821);
    this.addCity("Hamburg", "Germany", 53.5511, 9.9937);
    this.addCity("Cologne", "Germany", 50.9375, 6.9603);
    this.addCity("Zurich", "Switzerland", 47.3769, 8.5417);
    this.addCity("Milan", "Italy", 45.4642, 9.19);
    this.addCity("Rome", "Italy", 41.9028, 12.4964);
    this.addCity("Barcelona", "Spain", 41.3874, 2.1686);
    this.addCity("Madrid", "Spain", 40.4168, -3.7038);
    this.addCity("Lisbon", "Portugal", 38.7223, -9.1393);

    // Europe — Central
    this.addCity("Vienna", "Austria", 48.2082, 16.3738);
    this.addCity("Prague", "Czech Republic", 50.0755, 14.4378);
    this.addCity("Budapest", "Hungary", 47.4979, 19.0402);
    this.addCity("Warsaw", "Poland", 52.2297, 21.0122);
    this.addCity("Krakow", "Poland", 50.0647, 19.945);
    this.addCity("Bratislava", "Slovakia", 48.1486, 17.1077);

    // Europe — Northern
    this.addCity("Stockholm", "Sweden", 59.3293, 18.0686);
    this.addCity("Copenhagen", "Denmark", 55.6761, 12.5683);
    this.addCity("Oslo", "Norway", 59.9139, 10.7522);
    this.addCity("Helsinki", "Finland", 60.1699, 24.9384);
    this.addCity("Hirtshals", "Denmark", 57.5939, 9.9576);

    // Europe — Baltics
    this.addCity("Tallinn", "Estonia", 59.437, 24.7536);
    this.addCity("Riga", "Latvia", 56.9496, 24.1052);
    this.addCity("Vilnius", "Lithuania", 54.6872, 25.2797);

    // Europe — Southeast
    this.addCity("Athens", "Greece", 37.9838, 23.7275);
    this.addCity("Thessaloniki", "Greece", 40.6401, 22.9444);
    this.addCity("Belgrade", "Serbia", 44.7866, 20.4489);
    this.addCity("Zagreb", "Croatia", 45.815, 15.9819);
    this.addCity("Ljubljana", "Slovenia", 46.0569, 14.5058);
    this.addCity("Bucharest", "Romania", 44.4268, 26.1025);
    this.addCity("Sofia", "Bulgaria", 42.6977, 23.3219);
    this.addCity("Sarajevo", "Bosnia", 43.8563, 18.4131);
    this.addCity("Podgorica", "Montenegro", 42.4304, 19.2594);
    this.addCity("Tirana", "Albania", 41.3275, 19.8187);
    this.addCity("Skopje", "North Macedonia", 41.9973, 21.428);

    // Atlantic islands
    this.addCity("Tórshavn", "Faroe Islands", 62.0177, -6.7719);
    this.addCity("Seyðisfjörður", "Iceland", 65.26, -14.0098);
    this.addCity("Reykjavik", "Iceland", 64.1466, -21.9426);

    // Africa — North & East
    this.addCity("Casablanca", "Morocco", 33.5731, -7.5898);
    this.addCity("Marrakech", "Morocco", 31.6295, -7.9811);
    this.addCity("Tangier", "Morocco", 35.7595, -5.834);
    this.addCity("Fez", "Morocco", 34.0181, -5.0078);
    this.addCity("Cairo", "Egypt", 30.0444, 31.2357);
    this.addCity("Alexandria", "Egypt", 31.2001, 29.9187);
    this.addCity("Aswan", "Egypt", 24.0889, 32.8998);
    this.addCity("Addis Ababa", "Ethiopia", 9.0054, 38.7636);
    this.addCity("Djibouti City", "Djibouti", 11.5721, 43.1456);
    this.addCity("Nairobi", "Kenya", 1.2921, 36.8219);
    this.addCity("Mombasa", "Kenya", -4.0435, 39.6682);
    this.addCity("Dar es Salaam", "Tanzania", -6.7924, 39.2083);
    this.addCity("Arusha", "Tanzania", -3.3869, 36.6830);
    this.addCity("Tarifa", "Spain", 36.0143, -5.6044);

    // Americas — USA
    this.addCity("New York", "United States", 40.7128, -74.006);
    this.addCity("Washington DC", "United States", 38.9072, -77.0369);
    this.addCity("Chicago", "United States", 41.8781, -87.6298);
    this.addCity("Los Angeles", "United States", 34.0522, -118.2437);
    this.addCity("San Francisco", "United States", 37.7749, -122.4194);
    this.addCity("Seattle", "United States", 47.6062, -122.3321);
    this.addCity("Boston", "United States", 42.3601, -71.0589);
    this.addCity("Miami", "United States", 25.7617, -80.1918);
    this.addCity("Houston", "United States", 29.7604, -95.3698);
    this.addCity("New Orleans", "United States", 29.9511, -90.0715);
    this.addCity("Denver", "United States", 39.7392, -104.9903);

    // Americas — Canada
    this.addCity("Toronto", "Canada", 43.6532, -79.3832);
    this.addCity("Montreal", "Canada", 45.5017, -73.5673);
    this.addCity("Vancouver", "Canada", 49.2827, -123.1207);

    // Americas — Mexico
    this.addCity("Mexico City", "Mexico", 19.4326, -99.1332);
    this.addCity("Guadalajara", "Mexico", 20.6597, -103.3496);
    this.addCity("Cancun", "Mexico", 21.1619, -86.8515);
    this.addCity("Oaxaca", "Mexico", 17.0732, -96.7266);
    this.addCity("Monterrey", "Mexico", 25.6866, -100.3161);
    this.addCity("Tijuana", "Mexico", 32.5149, -117.0382);

    // Americas — Central America
    this.addCity("Guatemala City", "Guatemala", 14.6349, -90.5069);
    this.addCity("San Salvador", "El Salvador", 13.6929, -89.2182);
    this.addCity("Tegucigalpa", "Honduras", 14.0723, -87.1921);
    this.addCity("Managua", "Nicaragua", 12.115, -86.2362);
    this.addCity("San José", "Costa Rica", 9.9281, -84.0907);
    this.addCity("Panama City", "Panama", 8.9824, -79.5199);

    // Americas — South America
    this.addCity("Bogotá", "Colombia", 4.711, -74.0721);
    this.addCity("Medellín", "Colombia", 6.2442, -75.5812);
    this.addCity("Cartagena", "Colombia", 10.3910, -75.5364);
    this.addCity("Quito", "Ecuador", -0.1807, -78.4678);
    this.addCity("Lima", "Peru", -12.0464, -77.0428);
    this.addCity("Cusco", "Peru", -13.532, -71.9675);
    this.addCity("La Paz", "Bolivia", -16.4897, -68.1193);
    this.addCity("Santiago", "Chile", -33.4489, -70.6693);
    this.addCity("Buenos Aires", "Argentina", -34.6037, -58.3816);
    this.addCity("São Paulo", "Brazil", -23.5505, -46.6333);
    this.addCity("Rio de Janeiro", "Brazil", -22.9068, -43.1729);
    this.addCity("Ushuaia", "Argentina", -54.8019, -68.303);
    this.addCity("Punta Arenas", "Chile", -53.1638, -70.9171);
    this.addCity("Montevideo", "Uruguay", -34.9011, -56.1645);
    this.addCity("Asunción", "Paraguay", -25.2637, -57.5759);

    // Australia / NZ (isolated subgraph)
    this.addCity("Sydney", "Australia", -33.8688, 151.2093);
    this.addCity("Melbourne", "Australia", -37.8136, 144.9631);
    this.addCity("Perth", "Australia", -31.9505, 115.8605);

    // ==================== EDGES ====================

    // ---- Japan domestic ----
    this.addEdge("Tokyo", "Nagoya", op.jr, "train", 1.75, 350, "verified", "Shinkansen Nozomi");
    this.addEdge("Nagoya", "Kyoto", op.jr, "train", 0.6, 130, "verified", "Shinkansen Nozomi");
    this.addEdge("Kyoto", "Osaka", op.jr, "train", 0.25, 30, "verified", "JR Special Rapid");
    this.addEdge("Osaka", "Hiroshima", op.jr, "train", 1.5, 340, "verified", "Shinkansen Sakura");
    this.addEdge("Hiroshima", "Fukuoka", op.jr, "train", 1.25, 280, "verified", "Shinkansen Sakura");
    this.addEdge("Tokyo", "Kanazawa", op.jr, "train", 2.5, 450, "verified", "Hokuriku Shinkansen");
    this.addEdge("Kanazawa", "Kyoto", op.jr, "train", 2.25, 240, "verified", "Thunderbird Limited Express");
    this.addEdge("Tokyo", "Sapporo", op.jr, "train", 4.5, 1035, "verified", "Hokkaido Shinkansen + Hayabusa");
    this.addEdge("Tokyo", "Osaka", op.jr, "train", 2.5, 515, "verified", "Shinkansen Nozomi direct");

    // ---- South Korea domestic ----
    this.addEdge("Seoul", "Busan", op.korail, "train", 2.75, 325, "verified", "KTX high-speed");
    this.addEdge("Seoul", "Daegu", op.korail, "train", 1.75, 240, "verified", "KTX");
    this.addEdge("Daegu", "Busan", op.korail, "train", 0.75, 90, "verified", "KTX");
    this.addEdge("Seoul", "Gwangju", op.korail, "train", 2, 270, "verified", "KTX");
    this.addEdge("Seoul", "Incheon", op.korail, "train", 1, 40, "verified", "AREX");

    // ---- Japan-Korea ferry ----
    this.addEdge("Fukuoka", "Busan", op.newCamellia, "ferry", 12, 230, "verified", "New Camellia Line overnight ferry", "Japan visa-free for many", "International ferry terminal");

    // ---- Korea-China ferry ----
    this.addEdge("Incheon", "Tianjin", op.jinchin, "ferry", 24, 950, "likely", "Jinchin Ferry 2-3x/week", "Chinese visa required", "Ferry terminal immigration");

    // ---- China domestic ----
    this.addEdge("Tianjin", "Beijing", op.cr, "train", 0.5, 120, "verified", "CRH high-speed");
    this.addEdge("Beijing", "Shanghai", op.cr, "train", 4.5, 1318, "verified", "CRH Fuxing high-speed");
    this.addEdge("Shanghai", "Guangzhou", op.cr, "train", 6.5, 1780, "verified", "CRH high-speed");
    this.addEdge("Guangzhou", "Shenzhen", op.cr, "train", 0.5, 140, "verified", "CRH intercity");
    this.addEdge("Beijing", "Xi'an", op.cr, "train", 4.5, 1200, "verified", "CRH high-speed");
    this.addEdge("Xi'an", "Chengdu", op.cr, "train", 3, 660, "verified", "CRH Xi-Cheng line");
    this.addEdge("Chengdu", "Kunming", op.cr, "train", 7, 1100, "verified", "CRH or sleeper");
    this.addEdge("Kunming", "Nanning", op.cr, "train", 4.5, 710, "verified", "CRH high-speed");
    this.addEdge("Nanning", "Guangzhou", op.cr, "train", 3, 570, "verified", "CRH high-speed");
    this.addEdge("Beijing", "Harbin", op.cr, "train", 4.5, 1240, "verified", "CRH high-speed");
    this.addEdge("Beijing", "Urumqi", op.cr, "train", 15, 3140, "verified", "CRH or Z-train sleeper");
    this.addEdge("Chengdu", "Lhasa", op.cr, "train", 36, 3070, "likely", "Z322 sleeper, requires Tibet Travel Permit", "Tibet Travel Permit required");
    this.addEdge("Xi'an", "Urumqi", op.cr, "train", 14, 2550, "verified", "CRH or sleeper via Lanzhou");
    this.addEdge("Shanghai", "Nanning", op.cr, "train", 12, 1900, "verified", "Direct sleeper");

    // ---- China-Vietnam ----
    this.addEdge("Nanning", "Hanoi", null, "train", 12, 400, "likely", "International sleeper train", "Vietnam visa or e-visa required", "Friendship Pass border");

    // ---- China-Mongolia-Russia corridor ----
    this.addEdge("Beijing", "Zamyn-Üüd", op.cr, "train", 14, 850, "likely", "K3/K23 international train via Erenhot", "", "Chinese exit at Erenhot");
    this.addEdge("Zamyn-Üüd", "Ulaanbaatar", op.mongolianRail, "train", 15, 700, "verified", "Mongolian Railway overnight", "Mongolia visa-free for many", "Mongolian immigration at Zamyn-Üüd");
    this.addEdge("Ulaanbaatar", "Ulan-Ude", op.rzd, "train", 24, 600, "verified", "Trans-Mongolian Railway", "Russian visa required", "Border at Sukhbaatar/Naushki");
    this.addEdge("Ulan-Ude", "Irkutsk", op.rzd, "train", 7, 460, "verified", "Trans-Siberian mainline");

    // ---- Trans-Siberian ----
    this.addEdge("Irkutsk", "Novosibirsk", op.rzd, "train", 24, 1850, "verified", "Trans-Siberian mainline");
    this.addEdge("Novosibirsk", "Yekaterinburg", op.rzd, "train", 19, 1500, "verified", "Trans-Siberian mainline");
    this.addEdge("Yekaterinburg", "Moscow", op.rzd, "train", 26, 1780, "verified", "Trans-Siberian mainline");
    this.addEdge("Moscow", "St Petersburg", op.rzd, "train", 4, 700, "verified", "Sapsan high-speed");
    this.addEdge("Vladivostok", "Ulan-Ude", op.rzd, "train", 48, 3800, "verified", "Trans-Siberian east leg");
    this.addEdge("Moscow", "Vladivostok", op.rzd, "train", 144, 9289, "verified", "Trans-Siberian complete");

    // ---- Russia-Europe connections ----
    this.addEdge("St Petersburg", "Tallinn", null, "bus", 7, 395, "likely", "Lux Express or Ecolines via Narva", "Schengen visa may be required", "EU/Schengen border at Narva");
    this.addEdge("St Petersburg", "Helsinki", null, "bus", 6, 380, "likely", "Lux Express bus", "Schengen visa may be required", "Finnish border");
    this.addEdge("Moscow", "Warsaw", op.rzd, "train", 20, 1260, "likely", "Direct sleeper train via Brest/Terespol", "Schengen visa required", "Poland-Belarus border");

    // ---- Taiwan ----
    this.addEdge("Taipei", "Kaohsiung", op.taiwanRail, "train", 1.5, 345, "verified", "THSR high-speed");

    // ---- Southeast Asia ----
    this.addEdge("Hanoi", "Hue", op.vietnamRail, "train", 13, 690, "verified", "Reunification Express");
    this.addEdge("Hue", "Da Nang", op.vietnamRail, "train", 2.5, 100, "verified", "Reunification Express");
    this.addEdge("Da Nang", "Ho Chi Minh City", op.vietnamRail, "train", 17, 960, "verified", "Reunification Express");
    this.addEdge("Hanoi", "Vientiane", null, "bus", 24, 850, "likely", "International bus via Cau Treo border", "Laos visa on arrival", "Cau Treo/Nam Phao border");
    this.addEdge("Vientiane", "Luang Prabang", null, "bus", 9, 340, "likely", "Laos-China Railway or bus");
    this.addEdge("Vientiane", "Bangkok", op.srt, "train", 15, 650, "likely", "Train to Nong Khai then Thai train", "", "Friendship Bridge border");
    this.addEdge("Bangkok", "Chiang Mai", op.srt, "train", 12, 700, "verified", "Thai sleeper train");
    this.addEdge("Bangkok", "Hat Yai", op.srt, "train", 12, 950, "verified", "Thai express train south");
    this.addEdge("Ho Chi Minh City", "Phnom Penh", op.mekongExpress, "bus", 7, 230, "verified", "Mekong Express luxury bus", "Cambodia visa on arrival/e-visa", "Moc Bai/Bavet border");
    this.addEdge("Phnom Penh", "Siem Reap", null, "bus", 6, 310, "verified", "Local bus or shared minivan");
    this.addEdge("Phnom Penh", "Bangkok", null, "bus", 12, 650, "likely", "Bus via Poipet border", "", "Poipet/Aranyaprathet border");
    this.addEdge("Bangkok", "Yangon", null, "bus", 14, 850, "likely", "Bus via Mae Sot/Myawaddy border", "Myanmar visa required", "Mae Sot/Myawaddy border");
    this.addEdge("Yangon", "Mandalay", op.myanmarBus, "bus", 9, 620, "verified", "JJ Express VIP bus");
    this.addEdge("Chiang Mai", "Luang Prabang", null, "bus", 18, 700, "likely", "Slowboat or bus via Huay Xai", "Laos visa on arrival", "Chiang Khong/Huay Xai border");
    this.addEdge("Hat Yai", "Penang", null, "bus", 5, 200, "verified", "Minivan or bus via Padang Besar", "", "Thai-Malaysian border");
    this.addEdge("Penang", "Kuala Lumpur", op.ktm, "train", 4, 350, "verified", "KTM ETS train");
    this.addEdge("Kuala Lumpur", "Johor Bahru", op.ktm, "train", 5, 330, "verified", "KTM intercity or bus");
    this.addEdge("Johor Bahru", "Singapore", null, "bus", 1, 30, "verified", "Causeway bus", "", "Immigration at Woodlands/JB checkpoint");
    this.addEdge("Singapore", "Jakarta", op.pelni, "ferry", 24, 1000, "likely", "Ferry via Batam to Jakarta", "Indonesia visa-free/on arrival for many", "Indonesian immigration");
    this.addEdge("Jakarta", "Surabaya", op.kcic, "train", 8, 780, "verified", "Argo train or Whoosh connection");
    this.addEdge("Surabaya", "Denpasar", op.pelni, "ferry", 7, 340, "likely", "Ferry from Ketapang to Gilimanuk then bus to Denpasar");
    this.addEdge("Kuala Lumpur", "Singapore", null, "bus", 5, 350, "verified", "Express bus via Second Link");
    this.addEdge("Mandalay", "Chiang Mai", null, "bus", 16, 600, "likely", "Bus via Tachileik/Mae Sai border", "", "Tachileik/Mae Sai border");

    // ---- South Asia ----
    this.addEdge("Delhi", "Jaipur", op.indianRail, "train", 4.5, 310, "verified", "Shatabdi Express");
    this.addEdge("Delhi", "Varanasi", op.indianRail, "train", 8, 800, "verified", "Rajdhani or Shatabdi");
    this.addEdge("Delhi", "Mumbai", op.indianRail, "train", 16, 1400, "verified", "Rajdhani Express");
    this.addEdge("Mumbai", "Goa", op.indianRail, "train", 9, 590, "verified", "Konkan Kanya or Jan Shatabdi");
    this.addEdge("Mumbai", "Chennai", op.indianRail, "train", 24, 1280, "verified", "Chennai Express");
    this.addEdge("Chennai", "Kochi", op.indianRail, "train", 12, 700, "verified", "Alleppy Express");
    this.addEdge("Kolkata", "Varanasi", op.indianRail, "train", 8, 680, "verified", "Poorva Express");
    this.addEdge("Delhi", "Amritsar", op.indianRail, "train", 6, 450, "verified", "Shatabdi Express");
    this.addEdge("Delhi", "Kolkata", op.indianRail, "train", 17, 1450, "verified", "Rajdhani Express");
    this.addEdge("Chennai", "Colombo", null, "ferry", 18, 600, "unverified", "Seasonal ferry service (historically)", "Sri Lanka ETA/visa required", "Maritime immigration");
    this.addEdge("Kolkata", "Dhaka", null, "bus", 12, 350, "verified", "Shyamoli/GreenLine bus via Benapole", "Bangladesh visa required for some", "Benapole/Haridaspur border");
    this.addEdge("Delhi", "Kathmandu", op.nepalBus, "bus", 24, 1000, "likely", "Bus via Sunauli/Bhairahawa border", "Nepal visa on arrival", "Sunauli/Bhairahawa border");
    this.addEdge("Amritsar", "Lahore", null, "bus", 2, 50, "likely", "DTPC or local bus via Wagah border", "Pakistan visa required", "Wagah/Attari border");
    this.addEdge("Lahore", "Islamabad", op.pakistanRail, "train", 5, 380, "verified", "Pakistan Railways Business Express");
    this.addEdge("Islamabad", "Karachi", op.pakistanRail, "train", 22, 1230, "verified", "Tezgam or Green Line Express");
    this.addEdge("Islamabad", "Quetta", op.pakistanRail, "train", 24, 1200, "likely", "Jaffar Express");
    this.addEdge("Quetta", "Zahedan", op.metroPk, "bus", 12, 650, "likely", "Bus via Taftan border", "Iran visa required", "Taftan/Mirjaveh border — challenging crossing");
    this.addEdge("Lahore", "Karachi", op.pakistanRail, "train", 18, 1200, "verified", "Karakoram Express");

    // ---- Central Asia ----
    this.addEdge("Urumqi", "Almaty", null, "bus", 24, 1200, "likely", "International bus via Khorgos border", "Kazakhstan visa-free for many", "Khorgos/Korgas border");
    this.addEdge("Almaty", "Bishkek", null, "bus", 4, 250, "verified", "Frequent marshrutka/bus service", "Kyrgyzstan visa-free for many", "Korday border");
    this.addEdge("Almaty", "Astana", null, "train", 14, 1300, "verified", "Tulpar Talgo train");
    this.addEdge("Almaty", "Tashkent", null, "train", 18, 900, "likely", "Train via Shymkent", "Uzbekistan e-visa available", "Kazakh-Uzbek border");
    this.addEdge("Tashkent", "Samarkand", null, "train", 2, 350, "verified", "Afrosiyob high-speed train");
    this.addEdge("Samarkand", "Bukhara", null, "train", 1.5, 270, "verified", "Afrosiyob or Sharq train");
    this.addEdge("Bishkek", "Tashkent", null, "bus", 12, 600, "likely", "Bus via border crossing");

    // ---- Middle East ----
    this.addEdge("Zahedan", "Tehran", op.iranRail, "train", 18, 1400, "verified", "Iran Railways sleeper");
    this.addEdge("Tehran", "Isfahan", op.iranRail, "train", 5, 450, "verified", "Iran Railways express");
    this.addEdge("Tehran", "Tabriz", op.iranRail, "train", 8, 620, "verified", "Iran Railways sleeper");
    this.addEdge("Tabriz", "Van", op.kamalanBus, "bus", 8, 370, "likely", "International bus via Bazargan/Gürbulak border", "Turkey visa/e-visa required", "Bazargan/Gürbulak border");
    this.addEdge("Van", "Ankara", op.tcdd, "train", 24, 1200, "likely", "TCDD Eastern Express (seasonal)");
    this.addEdge("Ankara", "Istanbul", op.tcdd, "train", 4.5, 450, "verified", "YHT high-speed train");
    this.addEdge("Ankara", "Izmir", op.tcdd, "train", 5.5, 580, "verified", "TCDD express train");
    this.addEdge("Istanbul", "Izmir", op.tcdd, "train", 6, 600, "verified", "TCDD train via Eskişehir");
    this.addEdge("Istanbul", "Amman", null, "bus", 30, 1800, "unverified", "Bus via Antakya and Jordan", "Jordan visa on arrival for many");
    this.addEdge("Amman", "Jerusalem", null, "bus", 3, 100, "likely", "Bus via King Hussein/Allenby Bridge", "Israeli entry permit required for some", "Allenby Bridge border — complex security");
    this.addEdge("Jerusalem", "Tel Aviv", null, "bus", 1, 60, "verified", "Egged bus or train");

    // ---- Europe — UK/France ----
    this.addEdge("London", "Paris", op.eurostar, "train", 2.25, 460, "verified", "Eurostar via Channel Tunnel");
    this.addEdge("London", "Southampton", op.nationalExpress, "bus", 2, 125, "verified", "National Express coach");

    // ---- Europe — France ----
    this.addEdge("Paris", "Brussels", op.thalys, "train", 1.5, 310, "verified", "Thalys high-speed");
    this.addEdge("Paris", "Amsterdam", op.thalys, "train", 3.25, 500, "verified", "Thalys direct");
    this.addEdge("Paris", "Barcelona", op.sncf, "train", 6.5, 1040, "verified", "TGV direct");
    this.addEdge("Paris", "Milan", op.sncf, "train", 7, 850, "verified", "TGV via Lyon and Turin");
    this.addEdge("Paris", "Frankfurt", op.sncf, "train", 3.75, 570, "verified", "TGV/ICE cooperation");
    this.addEdge("Paris", "Zurich", op.sncf, "train", 4, 610, "verified", "TGV Lyria");

    // ---- Europe — Benelux/Germany ----
    this.addEdge("Brussels", "Amsterdam", op.thalys, "train", 2, 210, "verified", "Thalys");
    this.addEdge("Amsterdam", "Berlin", op.db, "train", 6, 660, "verified", "ICE International");
    this.addEdge("Brussels", "Cologne", op.db, "train", 2, 220, "verified", "ICE or Thalys");
    this.addEdge("Cologne", "Frankfurt", op.db, "train", 1, 190, "verified", "ICE high-speed");
    this.addEdge("Frankfurt", "Munich", op.db, "train", 3.5, 390, "verified", "ICE");
    this.addEdge("Frankfurt", "Berlin", op.db, "train", 4, 550, "verified", "ICE");
    this.addEdge("Berlin", "Hamburg", op.db, "train", 1.75, 290, "verified", "ICE");
    this.addEdge("Hamburg", "Copenhagen", op.dsb, "train", 4.5, 380, "verified", "IC train via Flensburg");

    // ---- Europe — Scandinavia ----
    this.addEdge("Copenhagen", "Stockholm", op.sj, "train", 5, 600, "verified", "SJ X2000 high-speed");
    this.addEdge("Copenhagen", "Oslo", op.dsb, "train", 8, 600, "verified", "Train via Gothenburg");
    this.addEdge("Stockholm", "Oslo", op.sj, "train", 6, 530, "verified", "SJ intercity");
    this.addEdge("Stockholm", "Helsinki", op.vikingLine, "ferry", 16, 400, "verified", "Viking Line or Tallink Silja overnight");
    this.addEdge("Stockholm", "Tallinn", op.tallinkSilja, "ferry", 16, 380, "verified", "Tallink Silja overnight");
    this.addEdge("Helsinki", "Tallinn", op.tallinkSilja, "ferry", 2, 80, "verified", "Tallink or Eckerö fast ferry");
    this.addEdge("Hamburg", "Hirtshals", op.dsb, "train", 7, 580, "verified", "Train via Aalborg");
    this.addEdge("Copenhagen", "Hirtshals", op.dsb, "train", 5, 450, "verified", "IC train to Aalborg then regional");

    // ---- Europe — North Atlantic ----
    this.addEdge("Hirtshals", "Tórshavn", op.smyrilLine, "ferry", 36, 970, "verified", "Smyril Line MS Norröna weekly");
    this.addEdge("Tórshavn", "Seyðisfjörður", op.smyrilLine, "ferry", 36, 700, "verified", "Smyril Line continues to Iceland");
    this.addEdge("Seyðisfjörður", "Reykjavik", null, "bus", 10, 680, "likely", "Straetó bus routes, seasonal");

    // ---- Europe — Baltics ----
    this.addEdge("Tallinn", "Riga", op.luxExpress, "bus", 4.5, 310, "verified", "Lux Express");
    this.addEdge("Riga", "Vilnius", op.ltg, "train", 4, 300, "verified", "LTG Link direct");
    this.addEdge("Vilnius", "Warsaw", op.pkp, "train", 8, 530, "verified", "PKP/LTG service via Mockava");

    // ---- Europe — Central ----
    this.addEdge("Berlin", "Prague", op.db, "train", 4.5, 350, "verified", "EuroCity direct");
    this.addEdge("Berlin", "Warsaw", op.pkp, "train", 5.5, 570, "verified", "EuroCity Berlin-Warszawa-Express");
    this.addEdge("Prague", "Vienna", op.obb, "train", 4, 330, "verified", "Railjet via Brno");
    this.addEdge("Vienna", "Budapest", op.obb, "train", 2.5, 250, "verified", "ÖBB Railjet");
    this.addEdge("Budapest", "Bratislava", op.mav, "train", 2.5, 200, "verified", "EuroCity or Railjet");
    this.addEdge("Bratislava", "Vienna", op.obb, "train", 1, 65, "verified", "Railjet or REX train");
    this.addEdge("Warsaw", "Krakow", op.pkp, "train", 2.5, 300, "verified", "PKP IC or EIP");
    this.addEdge("Krakow", "Prague", op.regiojet, "train", 6.5, 540, "verified", "RegioJet or LEO Express");
    this.addEdge("Munich", "Vienna", op.obb, "train", 4, 400, "verified", "Railjet");
    this.addEdge("Munich", "Zurich", op.db, "train", 3.5, 310, "verified", "EuroCity");
    this.addEdge("Zurich", "Milan", op.sbb, "train", 3.25, 290, "verified", "EuroCity via Gotthard tunnel");

    // ---- Europe — Italy/Spain/Portugal ----
    this.addEdge("Milan", "Rome", op.trenitalia, "train", 3, 570, "verified", "Frecciarossa high-speed");
    this.addEdge("Barcelona", "Madrid", op.renfe, "train", 2.5, 620, "verified", "AVE high-speed");
    this.addEdge("Madrid", "Lisbon", op.renfe, "train", 10, 625, "likely", "Talgo or bus");
    this.addEdge("Milan", "Barcelona", op.flixbus, "bus", 14, 1000, "likely", "FlixBus overnight");

    // ---- Europe — Southeast ----
    this.addEdge("Budapest", "Belgrade", op.mav, "train", 7, 380, "verified", "IC train via Subotica");
    this.addEdge("Budapest", "Zagreb", op.mav, "train", 6, 350, "verified", "IC or EuroCity");
    this.addEdge("Zagreb", "Ljubljana", op.hz, "train", 2, 140, "verified", "IC train");
    this.addEdge("Ljubljana", "Vienna", op.obb, "train", 6, 380, "verified", "ÖBB EuroCity");
    this.addEdge("Belgrade", "Sofia", op.serbianRail, "train", 10, 400, "likely", "International sleeper");
    this.addEdge("Sofia", "Thessaloniki", op.bdz, "train", 7, 300, "likely", "International train");
    this.addEdge("Thessaloniki", "Athens", op.hellenic, "train", 4, 500, "verified", "Hellenic Train IC");
    this.addEdge("Belgrade", "Sarajevo", null, "bus", 7, 300, "verified", "Lasta or Centrotrans bus");
    this.addEdge("Belgrade", "Podgorica", null, "bus", 8, 450, "likely", "Bus service");
    this.addEdge("Podgorica", "Tirana", null, "bus", 4, 170, "verified", "Local bus service");
    this.addEdge("Tirana", "Skopje", null, "bus", 5, 280, "likely", "International bus");
    this.addEdge("Skopje", "Sofia", null, "bus", 5, 240, "verified", "Bus via Deve Bair border");
    this.addEdge("Skopje", "Thessaloniki", null, "bus", 4, 240, "verified", "International bus");
    this.addEdge("Bucharest", "Sofia", op.cfr, "train", 9, 390, "likely", "International sleeper");
    this.addEdge("Bucharest", "Budapest", op.cfr, "train", 13, 830, "likely", "Sleeper via Arad");
    this.addEdge("Zagreb", "Sarajevo", null, "bus", 6, 400, "likely", "Eurolines or local bus");

    // ---- Europe — Turkey connection ----
    this.addEdge("Istanbul", "Sofia", null, "bus", 8, 550, "verified", "Metro Turizm or FlixBus");
    this.addEdge("Istanbul", "Thessaloniki", null, "bus", 7, 570, "likely", "Metro Turizm bus");
    this.addEdge("Istanbul", "Bucharest", null, "bus", 12, 660, "likely", "Bus via Bulgaria");

    // ---- Europe — Italy-Greece ferry ----
    this.addEdge("Rome", "Athens", op.anekLines, "ferry", 20, 1050, "likely", "Ferry from Bari/Brindisi to Patras then bus to Athens");

    // ---- Spain-Morocco ----
    this.addEdge("Tarifa", "Tangier", op.frs, "ferry", 1, 40, "verified", "FRS fast ferry across Strait of Gibraltar", "Morocco visa-free for many");
    this.addEdge("Madrid", "Tarifa", op.alsa, "bus", 7, 660, "verified", "ALSA bus via Algeciras");
    this.addEdge("Barcelona", "Tarifa", op.alsa, "bus", 12, 1100, "likely", "ALSA bus via Madrid");

    // ---- Africa — Morocco ----
    this.addEdge("Tangier", "Casablanca", op.moroccoRail, "train", 2.25, 340, "verified", "Al Boraq high-speed");
    this.addEdge("Tangier", "Fez", op.moroccoRail, "train", 3.5, 310, "verified", "ONCF express");
    this.addEdge("Casablanca", "Marrakech", op.moroccoRail, "train", 2.5, 240, "verified", "ONCF train");
    this.addEdge("Fez", "Marrakech", op.moroccoRail, "train", 7, 530, "verified", "ONCF via Casablanca");
    this.addEdge("Casablanca", "Fez", op.moroccoRail, "train", 3.5, 300, "verified", "ONCF express");

    // ---- Africa — Egypt ----
    this.addEdge("Cairo", "Alexandria", op.egyptRail, "train", 2.5, 220, "verified", "ENR express");
    this.addEdge("Cairo", "Aswan", op.egyptRail, "train", 13, 880, "verified", "ENR sleeper train");

    // ---- Africa — East ----
    this.addEdge("Addis Ababa", "Djibouti City", op.ethiopiaRail, "train", 12, 760, "verified", "Ethio-Djibouti Railway");
    this.addEdge("Addis Ababa", "Nairobi", null, "bus", 36, 1500, "likely", "Bus via Moyale border", "Kenya e-visa available", "Moyale border crossing");
    this.addEdge("Nairobi", "Mombasa", op.kenyaRail, "train", 5, 480, "verified", "Madaraka Express SGR");
    this.addEdge("Nairobi", "Arusha", null, "bus", 6, 280, "verified", "Shuttle bus service", "Tanzania visa on arrival/e-visa", "Namanga border");
    this.addEdge("Arusha", "Dar es Salaam", null, "bus", 9, 660, "verified", "Kilimanjaro Express bus");

    // ---- Transatlantic ----
    this.addEdge("Southampton", "New York", op.cunard, "cruise", 168, 5500, "verified", "Cunard Queen Mary 2 transatlantic crossing", "US ESTA or visa required", "US CBP at Brooklyn Cruise Terminal");
    this.addEdge("Reykjavik", "Southampton", op.cunard, "cruise", 120, 2500, "likely", "Repositioning cruise via Tórshavn", "UK visa may be required");

    // ---- Americas — USA ----
    this.addEdge("New York", "Boston", op.amtrak, "train", 3.5, 350, "verified", "Amtrak Acela or Northeast Regional");
    this.addEdge("New York", "Washington DC", op.amtrak, "train", 3, 360, "verified", "Amtrak Northeast Regional");
    this.addEdge("Washington DC", "Miami", op.amtrak, "train", 24, 1700, "verified", "Amtrak Silver Meteor");
    this.addEdge("New York", "Chicago", op.amtrak, "train", 20, 1270, "verified", "Amtrak Lake Shore Limited");
    this.addEdge("Chicago", "Denver", op.amtrak, "train", 18, 1530, "verified", "Amtrak California Zephyr");
    this.addEdge("Denver", "San Francisco", op.amtrak, "train", 24, 2000, "verified", "Amtrak California Zephyr");
    this.addEdge("San Francisco", "Los Angeles", op.amtrak, "train", 11, 600, "verified", "Amtrak Coast Starlight");
    this.addEdge("Los Angeles", "Houston", op.greyhound, "bus", 22, 2500, "verified", "Greyhound or FlixBus");
    this.addEdge("Houston", "New Orleans", op.greyhound, "bus", 5, 550, "verified", "Greyhound direct");
    this.addEdge("New Orleans", "Miami", op.greyhound, "bus", 16, 1350, "verified", "Greyhound via Jacksonville");
    this.addEdge("Seattle", "San Francisco", op.amtrak, "train", 23, 1300, "verified", "Amtrak Coast Starlight");
    this.addEdge("Seattle", "Vancouver", op.amtrak, "train", 4, 230, "verified", "Amtrak Cascades");
    this.addEdge("Chicago", "New Orleans", op.amtrak, "train", 19, 1500, "verified", "Amtrak City of New Orleans");

    // ---- Americas — Canada ----
    this.addEdge("Toronto", "Montreal", op.viaRail, "train", 5, 540, "verified", "VIA Rail corridor service");
    this.addEdge("New York", "Toronto", op.amtrak, "train", 12, 800, "verified", "Amtrak Maple Leaf");
    this.addEdge("New York", "Montreal", op.amtrak, "train", 11, 610, "verified", "Amtrak Adirondack");
    this.addEdge("Vancouver", "Toronto", op.viaRail, "train", 86, 4400, "verified", "VIA Rail Canadian transcontinental");

    // ---- Americas — USA-Mexico ----
    this.addEdge("Los Angeles", "Tijuana", op.flixbus, "bus", 3, 200, "verified", "FlixBus to San Ysidro then walk across border", "Mexico FMM form required", "San Ysidro/Tijuana border");
    this.addEdge("Houston", "Monterrey", null, "bus", 8, 740, "likely", "Bus via Laredo/Nuevo Laredo border", "Mexico visa-free for many", "Laredo/Nuevo Laredo border");

    // ---- Americas — Mexico ----
    this.addEdge("Tijuana", "Mexico City", op.ado, "bus", 36, 2800, "likely", "ADO or similar long-distance via Pacific coast");
    this.addEdge("Monterrey", "Mexico City", op.ado, "bus", 12, 900, "verified", "Primera Plus or ETN");
    this.addEdge("Mexico City", "Guadalajara", op.ado, "bus", 7, 540, "verified", "ETN or Primera Plus");
    this.addEdge("Mexico City", "Oaxaca", op.ado, "bus", 7, 460, "verified", "ADO first-class");
    this.addEdge("Mexico City", "Cancun", op.ado, "bus", 18, 1550, "verified", "ADO GL or Platino");
    this.addEdge("Oaxaca", "Guatemala City", op.ticaBus, "bus", 18, 900, "likely", "Bus via Tapachula and border", "Guatemala visa-free for many", "Tecún Umán border");

    // ---- Americas — Central America ----
    this.addEdge("Guatemala City", "San Salvador", op.ticaBus, "bus", 5, 260, "likely", "Tica Bus or Pullmantur");
    this.addEdge("San Salvador", "Tegucigalpa", op.ticaBus, "bus", 8, 380, "likely", "Tica Bus via El Amatillo border", "Honduras: CA-4 agreement");
    this.addEdge("Tegucigalpa", "Managua", op.ticaBus, "bus", 8, 460, "likely", "Tica Bus via Las Manos", "Nicaragua may require visa");
    this.addEdge("Managua", "San José", op.ticaBus, "bus", 9, 440, "likely", "Tica Bus via Peñas Blancas");
    this.addEdge("San José", "Panama City", op.ticaBus, "bus", 16, 880, "likely", "Tica Bus to David then Albrook", "Panama visa-free for many");

    // ---- Darién Gap (one-way sailboat) ----
    this.addOneWayEdge("Panama City", "Cartagena", op.sanBlas, "ferry", 48, 500, "unverified", "San Blas Adventures sailboat. No road through Darién Gap.", "Colombia visa may be required", "No land border — Darién Gap is impassable jungle");
    this.addOneWayEdge("Cartagena", "Panama City", op.sanBlas, "ferry", 48, 500, "unverified", "San Blas Adventures sailboat return", "Panama visa may be required", "No land border — Darién Gap");

    // ---- Americas — South America ----
    this.addEdge("Cartagena", "Medellín", op.colombiaBus, "bus", 13, 650, "verified", "Rápido Ochoa or Brasilia");
    this.addEdge("Cartagena", "Bogotá", op.colombiaBus, "bus", 18, 1050, "likely", "Bolivariano bus");
    this.addEdge("Medellín", "Bogotá", op.colombiaBus, "bus", 9, 420, "verified", "Bolivariano or Expreso Brasilia");
    this.addEdge("Bogotá", "Quito", null, "bus", 22, 900, "likely", "Bus via Ipiales/Rumichaca border", "Ecuador visa-free for many", "Rumichaca border");
    this.addEdge("Quito", "Lima", null, "bus", 28, 1900, "likely", "Bus via Guayaquil and Tumbes border", "Peru visa-free for many", "Aguas Verdes/Huaquillas border");
    this.addEdge("Lima", "Cusco", op.cruzDelSur, "bus", 22, 1100, "verified", "Cruz del Sur premium overnight");
    this.addEdge("Cusco", "La Paz", null, "bus", 12, 550, "likely", "Bus via Desaguadero border", "Bolivia visa policy varies", "Desaguadero border");
    this.addEdge("La Paz", "Buenos Aires", null, "bus", 40, 3000, "likely", "Bus via Villazón or Yacuiba border to Argentina", "Argentina visa-free for many", "Villazón/La Quiaca border");
    this.addEdge("Lima", "Santiago", null, "bus", 52, 3700, "likely", "Bus via Arica and Pan-American", "Chile visa-free for most");
    this.addEdge("Santiago", "Buenos Aires", null, "bus", 22, 1400, "verified", "Turbus or CATA via Los Libertadores pass", "", "Los Libertadores/Cristo Redentor border");
    this.addEdge("Buenos Aires", "Montevideo", null, "ferry", 3, 230, "verified", "Buquebus fast ferry");
    this.addEdge("Buenos Aires", "Asunción", null, "bus", 18, 1100, "likely", "Nuestra Señora de la Asunción bus");
    this.addEdge("Buenos Aires", "São Paulo", null, "bus", 30, 2200, "likely", "Pluma or JBL bus", "Brazil visa required for some", "Uruguaiana or Foz do Iguaçu border");
    this.addEdge("São Paulo", "Rio de Janeiro", op.brazilBus, "bus", 6, 440, "verified", "Viação Cometa or 1001");
    this.addEdge("Santiago", "Punta Arenas", op.turbus, "bus", 40, 3100, "likely", "Turbus via Puerto Montt and Coyhaique region");
    this.addEdge("Punta Arenas", "Ushuaia", null, "bus", 12, 600, "likely", "Bus-Sur or Tecni Austral via Tierra del Fuego ferry", "Argentina visa-free for many", "Chilean-Argentine border on Tierra del Fuego");
    this.addEdge("Buenos Aires", "Ushuaia", op.argentinaBus, "bus", 44, 3200, "likely", "Via Bariloche or Andesmar long-haul bus");

    // ---- Australia (isolated unless we connect Indonesia) ----
    this.addEdge("Sydney", "Melbourne", null, "train", 11, 880, "verified", "NSW TrainLink XPT");
    this.addEdge("Melbourne", "Perth", null, "train", 65, 3400, "verified", "Indian Pacific (via Adelaide)");
    this.addEdge("Sydney", "Perth", null, "train", 65, 3960, "verified", "Indian Pacific");
    // Add a speculative Indonesia-Australia ferry for connectivity
    this.addEdge("Denpasar", "Perth", null, "ferry", 96, 2700, "unverified", "Speculative/seasonal ferry or cruise route — no regular service", "Australian visa required", "Australian immigration");

    // Additional edges for better connectivity and 250+ total
    this.addEdge("Krakow", "Budapest", op.regiojet, "train", 7, 400, "verified", "RegioJet or IC via Slovakia");
    this.addEdge("Krakow", "Vienna", op.regiojet, "train", 6, 430, "verified", "RegioJet via Katowice");
    this.addEdge("Rome", "Barcelona", op.flixbus, "bus", 15, 1350, "likely", "FlixBus or Trenitalia to Genova + Renfe");
    this.addEdge("Berlin", "Munich", op.db, "train", 4, 585, "verified", "ICE high-speed");
    this.addEdge("Brussels", "London", op.eurostar, "train", 2, 370, "verified", "Eurostar");
    this.addEdge("Vienna", "Zurich", op.obb, "train", 8, 750, "verified", "ÖBB Railjet via Innsbruck");
    this.addEdge("Amsterdam", "Copenhagen", op.db, "train", 11, 790, "verified", "IC via Hamburg");
    this.addEdge("Munich", "Prague", op.db, "train", 5, 380, "verified", "EuroCity or Alex train");
    this.addEdge("Vienna", "Warsaw", op.obb, "train", 8, 680, "verified", "ÖBB/PKP EuroNight");
    this.addEdge("Delhi", "Chennai", op.indianRail, "train", 28, 2180, "verified", "Tamil Nadu Express");
    this.addEdge("Bangkok", "Siem Reap", null, "bus", 9, 410, "likely", "Bus via Poipet border");
    this.addEdge("Bangkok", "Kuala Lumpur", op.srt, "train", 22, 1500, "likely", "Sleeper train via Hat Yai and Butterworth");
    this.addEdge("Istanbul", "Tehran", op.tcdd, "train", 60, 2500, "likely", "Train via Ankara-Van then bus to Tabriz-Tehran");
    this.addEdge("Cairo", "Amman", null, "bus", 14, 800, "likely", "Bus via Taba/Aqaba border", "Jordan visa on arrival", "Taba/Aqaba border");
    this.addEdge("Casablanca", "Cairo", null, "bus", 72, 4500, "unverified", "Multi-day bus/shared transport via Algeria/Tunisia/Libya — complex journey");
  }
}

export const storage = new MemStorage();
