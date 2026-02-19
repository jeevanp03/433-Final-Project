import { useLocation, Link } from "react-router-dom";
import { ChevronRight } from "lucide-react";

const routeLabels: Record<string, string> = {
  "": "Dashboard",
  forecast: "Forecast Explorer",
  simulate: "Simulation Sandbox",
  analytics: "Usage Analytics",
  actions: "Recommendations & Actions",
  settings: "Settings",
};

export default function Breadcrumb() {
  const { pathname } = useLocation();
  const segments = pathname.split("/").filter(Boolean);

  if (segments.length === 0) return null;

  return (
    <nav aria-label="Breadcrumb" className="flex items-center gap-1 text-[11px] text-muted-foreground">
      <Link to="/" className="hover:text-foreground transition-colors">
        Dashboard
      </Link>
      {segments.map((seg, i) => {
        const path = "/" + segments.slice(0, i + 1).join("/");
        const label = routeLabels[seg] ?? seg;
        const isLast = i === segments.length - 1;

        return (
          <span key={path} className="flex items-center gap-1">
            <ChevronRight className="w-3 h-3 opacity-40" />
            {isLast ? (
              <span className="text-foreground font-medium">{label}</span>
            ) : (
              <Link to={path} className="hover:text-foreground transition-colors">
                {label}
              </Link>
            )}
          </span>
        );
      })}
    </nav>
  );
}
