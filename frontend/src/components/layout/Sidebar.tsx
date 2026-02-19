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
      className={`hidden md:flex flex-col bg-sidebar transition-all duration-200 ${
        collapsed ? "w-[60px]" : "w-[220px]"
      }`}
      role="navigation"
      aria-label="Main navigation"
    >
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-4 h-14">
        <div className="w-7 h-7 rounded-lg bg-sidebar-primary/20 flex items-center justify-center shrink-0">
          <Zap className="w-4 h-4 text-sidebar-primary" aria-hidden="true" />
        </div>
        {!collapsed && (
          <span className="text-[13px] font-semibold text-sidebar-primary-foreground tracking-tight truncate">
            Energy IDSS
          </span>
        )}
      </div>

      {/* Nav Items */}
      <nav className="flex-1 py-3 px-2 space-y-0.5">
        {navItems.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === "/"}
            className={({ isActive }) =>
              `group relative flex items-center gap-2.5 px-3 py-2 rounded-lg transition-colors ${
                isActive
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-sidebar-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
              }`
            }
            title={collapsed ? label : undefined}
            aria-label={label}
          >
            {({ isActive }) => (
              <>
                {isActive && (
                  <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-4 rounded-r-full bg-sidebar-primary" />
                )}
                <Icon className={`w-[18px] h-[18px] shrink-0 ${isActive ? "text-sidebar-primary" : ""}`} aria-hidden="true" />
                {!collapsed && <span className="text-[13px]">{label}</span>}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Collapse Toggle */}
      {!isTablet && (
        <button
          onClick={toggleSidebar}
          className="flex items-center justify-center h-10 border-t border-sidebar-border text-sidebar-foreground/60 hover:text-sidebar-accent-foreground transition-colors cursor-pointer"
          aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {sidebarCollapsed ? (
            <ChevronRight className="w-3.5 h-3.5" />
          ) : (
            <ChevronLeft className="w-3.5 h-3.5" />
          )}
        </button>
      )}
    </aside>
  );
}
