import { NavLink } from "react-router-dom";
import {
  LayoutDashboard,
  TrendingUp,
  FlaskConical,
  BarChart3,
  ListChecks,
  Settings,
  ChevronLeft,
  ChevronRight,
  Zap,
} from "lucide-react";
import { useUIStore } from "@/stores/useUIStore";

const navItems = [
  { to: "/", icon: LayoutDashboard, label: "Dashboard" },
  { to: "/forecast", icon: TrendingUp, label: "Forecast" },
  { to: "/simulate", icon: FlaskConical, label: "Simulate" },
  { to: "/analytics", icon: BarChart3, label: "Analytics" },
  { to: "/actions", icon: ListChecks, label: "Actions" },
  { to: "/settings", icon: Settings, label: "Settings" },
];

export default function Sidebar() {
  const { sidebarCollapsed, toggleSidebar } = useUIStore();

  return (
    <aside
      className={`flex flex-col bg-sidebar border-r border-sidebar-border transition-all duration-200 ${
        sidebarCollapsed ? "w-16" : "w-60"
      }`}
    >
      {/* Logo */}
      <div className="flex items-center gap-2 px-4 h-14 border-b border-sidebar-border">
        <Zap className="w-6 h-6 text-energy-blue shrink-0" />
        {!sidebarCollapsed && (
          <span className="text-card-title text-sidebar-foreground truncate">
            Energy IDSS
          </span>
        )}
      </div>

      {/* Nav Items */}
      <nav className="flex-1 py-2">
        {navItems.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === "/"}
            className={({ isActive }) =>
              `flex items-center gap-3 px-4 py-2.5 mx-2 rounded-lg transition-colors ${
                isActive
                  ? "bg-sidebar-accent text-sidebar-primary"
                  : "text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground"
              }`
            }
          >
            <Icon className="w-5 h-5 shrink-0" />
            {!sidebarCollapsed && <span className="text-body">{label}</span>}
          </NavLink>
        ))}
      </nav>

      {/* Collapse Toggle */}
      <button
        onClick={toggleSidebar}
        className="flex items-center justify-center h-10 border-t border-sidebar-border text-muted-foreground hover:text-sidebar-foreground transition-colors cursor-pointer"
      >
        {sidebarCollapsed ? (
          <ChevronRight className="w-4 h-4" />
        ) : (
          <ChevronLeft className="w-4 h-4" />
        )}
      </button>
    </aside>
  );
}
