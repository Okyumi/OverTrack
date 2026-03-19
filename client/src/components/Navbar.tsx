import { Link, useLocation } from "wouter";
import { useTheme } from "@/lib/theme";
import { Sun, Moon } from "lucide-react";

export default function Navbar() {
  const { isDark, toggle } = useTheme();
  const [location] = useLocation();

  const links = [
    { href: "/", label: "Planner" },
    { href: "/operators", label: "Operators" },
  ];

  return (
    <header className="h-12 bg-black flex items-center px-5 gap-8 shrink-0 z-50" data-testid="navbar">
      {/* Logo */}
      <Link href="/" className="flex items-center gap-3 group" data-testid="logo-link">
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          aria-label="OverTrack logo"
        >
          {/* Abstract OT monogram — grid-inspired connected paths */}
          {/* O: open square with gap */}
          <path
            d="M2 2h8v8H2V2z"
            stroke="white"
            strokeWidth="1.8"
            fill="none"
          />
          {/* T: vertical + horizontal bar */}
          <path
            d="M14 2h8M18 2v10"
            stroke="white"
            strokeWidth="1.8"
            strokeLinecap="square"
          />
          {/* Connecting diagonal — route metaphor */}
          <path
            d="M10 10L14 14"
            stroke="#FF0066"
            strokeWidth="1.8"
            strokeLinecap="square"
          />
          {/* Lower track lines */}
          <path
            d="M2 14h6M14 14v8M14 22h8"
            stroke="white"
            strokeWidth="1.8"
            strokeLinecap="square"
          />
          {/* Accent dot — origin marker */}
          <rect x="2" y="20" width="4" height="4" fill="#FF0066" />
        </svg>
        <span className="text-[15px] font-bold tracking-tight text-white">
          OverTrack
        </span>
      </Link>

      {/* Nav links */}
      <nav className="flex items-center gap-1">
        {links.map(link => {
          const isActive = location === link.href || (link.href !== "/" && location.startsWith(link.href));
          return (
            <Link
              key={link.href}
              href={link.href}
              data-testid={`nav-${link.label.toLowerCase()}`}
              className={`px-3 py-1.5 text-[11px] font-medium uppercase tracking-[0.12em] transition-colors border-b-2 ${
                isActive
                  ? "text-white border-[#FF0066]"
                  : "text-white/60 border-transparent hover:text-white"
              }`}
            >
              {link.label}
            </Link>
          );
        })}
      </nav>

      {/* Right side */}
      <div className="ml-auto flex items-center">
        <button
          onClick={toggle}
          data-testid="theme-toggle"
          className="p-2 text-white/60 hover:text-white transition-colors"
          aria-label="Toggle dark mode"
        >
          {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </button>
      </div>
    </header>
  );
}
