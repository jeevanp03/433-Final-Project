import { useLocation } from "react-router-dom";
import { Sun, Moon } from "lucide-react";
import { useSettingsStore } from "@/stores/useSettingsStore";
import DensityToggle from "./DensityToggle";
import Breadcrumb from "./Breadcrumb";

const pageTitles: Record<string, string> = {
  "/": "Dashboard",
  "/forecast": "Forecast Explorer",
  "/simulate": "Simulation Sandbox",
  "/analytics": "Usage Analytics",
  "/actions": "Recommendations & Actions",
  "/settings": "Settings",
};

export default function TopBar() {
  const location = useLocation();
  const { theme, toggleTheme } = useSettingsStore();
  const title = pageTitles[location.pathname] ?? "Energy IDSS";
  const showBreadcrumb = location.pathname !== "/";

  return (
    <header className="border-b border-border bg-card px-4 md:px-6" role="banner">
      <div className="flex items-center justify-between h-14">
        <h1 className="text-section-heading text-foreground truncate">{title}</h1>

        <div className="flex items-center gap-2 md:gap-3">
          <div className="hidden sm:block">
            <DensityToggle />
          </div>
          <button
            onClick={toggleTheme}
            className="p-2 rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground transition-colors cursor-pointer"
            aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          >
            {theme === "dark" ? (
              <Sun className="w-5 h-5" />
            ) : (
              <Moon className="w-5 h-5" />
            )}
          </button>
        </div>
      </div>
      {showBreadcrumb && (
        <div className="pb-2 hidden md:block">
          <Breadcrumb />
        </div>
      )}
    </header>
  );
}
