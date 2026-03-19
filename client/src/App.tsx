import { Switch, Route, Router } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/lib/theme";
import Navbar from "@/components/Navbar";
import RoutePlanner from "@/pages/route-planner";
import ItineraryPage from "@/pages/itinerary";
import OperatorsPage from "@/pages/operators";
import NotFound from "@/pages/not-found";

function AppLayout() {
  return (
    <div className="h-screen flex flex-col overflow-hidden">
      <Navbar />
      <main className="flex-1 overflow-hidden">
        <Switch>
          <Route path="/" component={RoutePlanner} />
          <Route path="/itinerary" component={ItineraryPage} />
          <Route path="/operators" component={OperatorsPage} />
          <Route component={NotFound} />
        </Switch>
      </main>
    </div>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <ThemeProvider>
          <Toaster />
          <Router hook={useHashLocation}>
            <AppLayout />
          </Router>
        </ThemeProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
