// Isolated browser fixture for the actual history component, not a production route.
import * as React from "react";
import { createRoot } from "react-dom/client";
import { ClerkProvider } from "@clerk/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { LanguageProvider } from "../../client/src/contexts/LanguageContext";
import { ReportDeliveryHistory } from "../../client/src/components/report-delivery-history";
import "../../client/src/index.css";

createRoot(document.getElementById("root")!).render(
  <ClerkProvider>
    <QueryClientProvider client={new QueryClient()}>
      <LanguageProvider>
        <ReportDeliveryHistory ticker="BBDC3" />
      </LanguageProvider>
    </QueryClientProvider>
  </ClerkProvider>,
);
