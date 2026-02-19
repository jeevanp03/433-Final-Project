import { Outlet, useLocation } from "react-router-dom";
import { MessageSquare } from "lucide-react";
import { AnimatePresence } from "framer-motion";
import Sidebar from "./Sidebar";
import TopBar from "./TopBar";
import MobileNav from "./MobileNav";
import PageTransition from "./PageTransition";
import ToastContainer from "@/components/ui/Toast";
import ErrorBoundary from "@/components/ui/ErrorBoundary";
import ChatDrawer from "@/components/chat/ChatDrawer";
import { useChatStore } from "@/stores/useChatStore";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { usePrefetch } from "@/hooks/usePrefetch";

export default function AppLayout() {
  const { toggleDrawer, drawerOpen } = useChatStore();
  const location = useLocation();
  useKeyboardShortcuts();
  usePrefetch();

  return (
    <div className="flex h-screen bg-background">
      <Sidebar />
      <div className="flex flex-col flex-1 overflow-hidden">
        <TopBar />
        <main className="flex-1 overflow-y-auto p-4 md:p-6 pb-20 md:pb-6">
          <div className="max-w-[1440px] mx-auto">
            <ErrorBoundary level="page" key={location.pathname}>
              <AnimatePresence mode="wait">
                <PageTransition key={location.pathname}>
                  <Outlet />
                </PageTransition>
              </AnimatePresence>
            </ErrorBoundary>
          </div>
        </main>
      </div>
      <MobileNav />
      <ToastContainer />
      <ChatDrawer />

      {/* Floating chat toggle button */}
      {!drawerOpen && (
        <button
          onClick={toggleDrawer}
          className="fixed bottom-20 md:bottom-6 right-6 z-40 w-12 h-12 rounded-full bg-energy-teal text-white shadow-lg hover:bg-energy-teal/90 transition-colors flex items-center justify-center cursor-pointer"
          aria-label="Open chat assistant (Ctrl+J)"
        >
          <MessageSquare className="w-5 h-5" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
