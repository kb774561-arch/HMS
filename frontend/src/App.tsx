import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter } from "react-router-dom";
import { Toaster } from "sonner";
import { AppRouter } from "@/app/router";
import { ThemeProvider, useTheme } from "@/lib/theme";
import { ApiError } from "@/lib/api";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      // Retry only transient failures; 4xx answers will not change on retry.
      retry: (count, err) => count < 2 && (!(err instanceof ApiError) || err.status === 0 || err.status >= 500),
    },
    mutations: { retry: false },
  },
});

function ThemedToaster() {
  const { resolved } = useTheme();
  return <Toaster theme={resolved} richColors closeButton position="top-right" toastOptions={{ duration: 4000 }} />;
}

export default function App() {
  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <AppRouter />
        </BrowserRouter>
        <ThemedToaster />
      </QueryClientProvider>
    </ThemeProvider>
  );
}
