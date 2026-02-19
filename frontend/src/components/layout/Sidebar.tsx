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
import { useIsTablet } from "@/hooks/useMediaQuery";

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
  const isTablet = useIsTablet();
  const collapsed = sidebarCollapsed || isTablet;

  return (
    <aside
      className={`hidden md:flex flex-col bg-sidebar border-r border-sidebar-border transition-all duration-200 ${
        collapsed ? "w-16" : "w-60"
      }`}
      role="navigation"
      aria-label="Main navigation"
    >
      {/* Logo */}
      <div className="flex items-center gap-2 px-4 h-14 border-b border-sidebar-border">
        <Zap className="w-6 h-6 text-energy-blue shrink-0" aria-hidden="true" />
        {!collapsed && (
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
            title={collapsed ? label : undefined}
            aria-label={label}
          >
            <Icon className="w-5 h-5 shrink-0" aria-hidden="true" />
            {!collapsed && <span className="text-body">{label}</span>}
          </NavLink>
        ))}
      </nav>

      {/* Collapse Toggle — hidden on tablet (always collapsed there) */}
      {!isTablet && (
        <button
          onClick={toggleSidebar}
          className="flex items-center justify-center h-10 border-t border-sidebar-border text-muted-foreground hover:text-sidebar-foreground transition-colors cursor-pointer"
          aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {sidebarCollapsed ? (
            <ChevronRight className="w-4 h-4" />
          ) : (
            <ChevronLeft className="w-4 h-4" />
          )}
        </button>
      )}
    </aside>
  );
}
