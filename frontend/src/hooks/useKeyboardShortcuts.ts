import { useEffect, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useUIStore } from "@/stores/useUIStore";
import { useSettingsStore } from "@/stores/useSettingsStore";
import { useChatStore } from "@/stores/useChatStore";

const NAV_MAP: Record<string, string> = {
  d: "/",
  f: "/forecast",
  s: "/simulate",
  a: "/analytics",
  r: "/actions",
};

export function useKeyboardShortcuts() {
  const navigate = useNavigate();
  const location = useLocation();
  const pendingG = useRef(false);
  const gTimeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const toggleSidebar = useUIStore((s) => s.toggleSidebar);
  const setDensity = useUIStore((s) => s.setDensity);
  const closeModal = useUIStore((s) => s.closeModal);
  const activeModal = useUIStore((s) => s.activeModal);
  const setCommandPaletteOpen = useUIStore((s) => s.setCommandPaletteOpen);
  const toggleTheme = useSettingsStore((s) => s.toggleTheme);
  const toggleDrawer = useChatStore((s) => s.toggleDrawer);
  const drawerOpen = useChatStore((s) => s.drawerOpen);

  useEffect(() => {
    function handle(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      const isInput =
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.tagName === "SELECT" ||
        target.isContentEditable;

      // Ctrl/Cmd shortcuts work even in inputs
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        setCommandPaletteOpen(true);
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key === "j") {
        e.preventDefault();
        toggleDrawer();
        return;
      }

      // Esc always works
      if (e.key === "Escape") {
        if (drawerOpen) {
          toggleDrawer();
          return;
        }
        if (activeModal) {
          closeModal();
          return;
        }
        return;
      }

      // Don't handle other shortcuts when typing
      if (isInput) return;

      // G then letter navigation
      if (pendingG.current) {
        pendingG.current = false;
        clearTimeout(gTimeout.current);
        const path = NAV_MAP[e.key.toLowerCase()];
        if (path && location.pathname !== path) {
          e.preventDefault();
          navigate(path);
        }
        return;
      }

      if (e.key === "g" && !e.ctrlKey && !e.metaKey) {
        pendingG.current = true;
        gTimeout.current = setTimeout(() => {
          pendingG.current = false;
        }, 500);
        return;
      }

      // Density shortcuts
      if (e.key === "1") {
        setDensity("glance");
        return;
      }
      if (e.key === "2") {
        setDensity("explore");
        return;
      }
      if (e.key === "3") {
        setDensity("deep_dive");
        return;
      }

      // Sidebar toggle
      if (e.key === "[") {
        toggleSidebar();
        return;
      }
      if (e.key === "]") {
        toggleSidebar();
        return;
      }

      // Theme toggle
      if (e.key === "t" && !e.ctrlKey && !e.metaKey) {
        toggleTheme();
        return;
      }
    }

    window.addEventListener("keydown", handle);
    return () => {
      window.removeEventListener("keydown", handle);
      clearTimeout(gTimeout.current);
    };
  }, [
    navigate,
    location.pathname,
    toggleSidebar,
    setDensity,
    closeModal,
    activeModal,
    setCommandPaletteOpen,
    toggleTheme,
    toggleDrawer,
    drawerOpen,
  ]);
}
