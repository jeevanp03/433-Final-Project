import { Component, type ReactNode, type ErrorInfo } from "react";
import ErrorFallback from "./ErrorFallback";

interface Props {
  children: ReactNode;
  level?: "app" | "page" | "component";
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[ErrorBoundary:${this.props.level ?? "component"}]`, error, info.componentStack);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      const level = this.props.level ?? "component";
      const title =
        level === "app"
          ? "Application Error"
          : level === "page"
            ? "Page Error"
            : "Component Error";
      const message =
        level === "app"
          ? "The application encountered an unexpected error. Please refresh the page."
          : level === "page"
            ? "This page encountered an error. Try navigating back or refreshing."
            : "This section couldn't load. Click retry to try again.";

      return (
        <ErrorFallback
          title={title}
          message={message}
          onRetry={this.handleReset}
        />
      );
    }

    return this.props.children;
  }
}
