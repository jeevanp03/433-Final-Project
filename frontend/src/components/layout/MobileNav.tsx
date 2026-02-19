import { NavLink } from "react-router-dom";
import {
  LayoutDashboard,
  TrendingUp,
  FlaskConical,
  BarChart3,
  ListChecks,
  Settings,
} from "lucide-react";

const navItems = [
  { to: "/", icon: LayoutDashboard, label: "Home" },
  { to: "/forecast", icon: TrendingUp, label: "Forecast" },
  { to: "/simulate", icon: FlaskConical, label: "Simulate" },
  { to: "/analytics", icon: BarChart3, label: "Analytics" },
  { to: "/actions", icon: ListChecks, label: "Actions" },
  { to: "/settings", icon: Settings, label: "Settings" },
];

export default function MobileNav() {
  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 bg-card border-t border-border md:hidden"
      role="navigation"
      aria-label="Main navigation"
    >
      <div className="flex items-center justify-around h-14 px-1">
        {navItems.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === "/"}
            className={({ isActive }) =>
              `flex flex-col items-center gap-0.5 px-2 py-1.5 rounded-lg transition-colors min-w-0 ${
                isActive
                  ? "text-energy-blue"
                  : "text-muted-foreground"
              }`
            }
          >
            <Icon className="w-5 h-5 shrink-0" />
            <span className="text-[10px] leading-tight truncate">{label}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
