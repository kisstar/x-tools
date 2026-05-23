import { RouterProvider } from "@tanstack/react-router";
import { ThemeProvider } from "./providers/ThemeProvider";
import { I18nProvider } from "./providers/I18nProvider";
import { BridgeProvider } from "./providers/BridgeProvider";
import { router } from "./router";

function App() {
  return (
    <BridgeProvider>
      <ThemeProvider>
        <I18nProvider>
          <RouterProvider router={router} />
        </I18nProvider>
      </ThemeProvider>
    </BridgeProvider>
  );
}

export { App };
