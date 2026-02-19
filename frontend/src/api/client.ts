import axios, { AxiosError } from "axios";

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "/api",
  timeout: 30_000,
  headers: { "Content-Type": "application/json" },
});

// Error message mapping per HTTP status (Table 16.1)
const ERROR_MESSAGES: Record<number, { title: string; description: string }> = {
  400: { title: "Invalid Request", description: "The request parameters were invalid." },
  401: { title: "Unauthorized", description: "Authentication required." },
  403: { title: "Forbidden", description: "You don't have permission for this action." },
  404: { title: "Not Found", description: "The requested resource was not found." },
  422: { title: "Validation Error", description: "The server couldn't process the request." },
  429: { title: "Too Many Requests", description: "Please slow down and try again." },
  500: { title: "Server Error", description: "An internal server error occurred." },
  502: { title: "Bad Gateway", description: "The server is temporarily unreachable." },
  503: { title: "Service Unavailable", description: "The server is under maintenance." },
};

export function getApiErrorMessage(error: unknown): { title: string; description: string } {
  if (error instanceof AxiosError) {
    if (!error.response) {
      return { title: "Network Error", description: "Cannot reach the server. Check your connection." };
    }
    return (
      ERROR_MESSAGES[error.response.status] ?? {
        title: `Error ${error.response.status}`,
        description: error.message,
      }
    );
  }
  return { title: "Unexpected Error", description: String(error) };
}
