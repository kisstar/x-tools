import { RouterProvider } from "@tanstack/react-router";
import { ThemeProvider } from "./providers/ThemeProvider";
import { I18nProvider } from "./providers/I18nProvider";
import { ChannelProvider } from "./providers/ChannelProvider";
import { router } from "./router";

function App() {
  return (
    <ChannelProvider>
      <ThemeProvider>
        <I18nProvider>
          <RouterProvider router={router} />
        </I18nProvider>
      </ThemeProvider>
    </ChannelProvider>
  );
}

export { App };
