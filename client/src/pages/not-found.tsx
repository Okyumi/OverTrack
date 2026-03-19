import { AlertCircle } from "lucide-react";
import { Link } from "wouter";

export default function NotFound() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-background">
      <div className="w-full max-w-md mx-4 border border-border p-6">
        <div className="flex mb-4 gap-3 items-center">
          <AlertCircle className="h-6 w-6 text-[#FF0066]" />
          <h1 className="text-xl font-black uppercase tracking-[0.04em] text-foreground">404</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Page not found.
        </p>
        <Link href="/" className="text-[#FF0066] text-sm hover:underline mt-3 inline-block font-medium">
          Back to planner
        </Link>
      </div>
    </div>
  );
}
