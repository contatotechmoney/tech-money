import { ClerkProvider, SignIn, SignUp, useAuth, useClerk } from "@clerk/react";
import { publishableKeyFromHost } from "@clerk/react/internal";
import { shadcn } from "@clerk/themes";
import { useEffect, useRef, type ComponentType, type ReactNode } from "react";
import { Router as WouterRouter, Switch, Route, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { LanguageProvider } from "@/contexts/LanguageContext";
import NotFound from "@/pages/not-found";
import Layout from "@/components/layout";
import Login from "@/pages/login";
import Dashboard from "@/pages/dashboard";
import DREInput from "@/pages/dre-input";
import Report from "@/pages/report";
import Analysis from "@/pages/analysis";
import Projections from "@/pages/projections";
import Credits from "@/pages/credits";
import BalanceSheet from "@/pages/balance-sheet";
import AreaSelection from "@/pages/area-selection";
import InvestmentLayout from "@/components/investment-layout";
import AIAgents from "@/pages/ai-agents";
import InvestmentReport from "@/pages/investment-report";
import InvestmentPlaceholder from "@/pages/investment-placeholder";
import InvestmentReports from "@/pages/investment-reports";
import InvestmentPortfolio from "@/pages/investment-portfolio";
import Settings from "@/pages/settings";

const clerkPubKey = publishableKeyFromHost(
  window.location.hostname,
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY,
);
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;
const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

if (!clerkPubKey) {
  throw new Error("Missing VITE_CLERK_PUBLISHABLE_KEY in .env file");
}

const clerkAppearance = {
  theme: shadcn,
  cssLayerName: "clerk",
  options: {
    logoPlacement: "inside" as const,
    logoLinkUrl: basePath || "/",
    logoImageUrl: `${window.location.origin}${basePath}/logo.svg`,
  },
  variables: {
    colorPrimary: "#2a9d8f",
    colorForeground: "#172033",
    colorMutedForeground: "#64748b",
    colorDanger: "#dc2626",
    colorBackground: "#ffffff",
    colorInput: "#ffffff",
    colorInputForeground: "#172033",
    colorNeutral: "#dbe3ec",
    fontFamily: "Inter, sans-serif",
    borderRadius: "0.5rem",
  },
  elements: {
    rootBox: "w-full flex justify-center",
    cardBox: "bg-white rounded-2xl w-[440px] max-w-full overflow-hidden",
    card: "!shadow-none !border-0 !bg-transparent !rounded-none",
    footer: "!shadow-none !border-0 !bg-transparent !rounded-none",
    headerTitle: "text-slate-900",
    headerSubtitle: "text-slate-600",
    socialButtonsBlockButtonText: "text-slate-800",
    formFieldLabel: "text-slate-800",
    footerActionLink: "text-teal-700",
    footerActionText: "text-slate-600",
    dividerText: "text-slate-500",
    identityPreviewEditButton: "text-teal-700",
    formFieldSuccessText: "text-emerald-700",
    alertText: "text-red-700",
    logoBox: "mb-2",
    logoImage: "max-h-10",
    socialButtonsBlockButton: "border-slate-200 hover:bg-slate-50",
    formButtonPrimary: "bg-[#2a9d8f] hover:bg-[#238276]",
    formFieldInput: "border-slate-200 text-slate-900",
    footerAction: "text-slate-600",
    dividerLine: "bg-slate-200",
    alert: "bg-red-50 border-red-200",
    otpCodeFieldInput: "border-slate-200 text-slate-900",
    formFieldRow: "text-slate-800",
    main: "bg-white",
  },
};

function LoadingScreen() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background">
      <p className="text-sm text-muted-foreground">Carregando sua sessão...</p>
    </main>
  );
}

function AuthGuard({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn } = useAuth();
  const [, navigate] = useLocation();

  useEffect(() => {
    if (isLoaded && !isSignedIn) {
      const redirect = `${window.location.pathname}${window.location.search}`;
      navigate(`/?redirect=${encodeURIComponent(redirect)}`, { replace: true });
    }
  }, [isLoaded, isSignedIn, navigate]);

  if (!isLoaded) return <LoadingScreen />;
  if (!isSignedIn) return null;

  return <>{children}</>;
}

function ProtectedRoute({
  component: Component,
  investment = false,
  ...routeProps
}: {
  component: ComponentType<any>;
  investment?: boolean;
  [key: string]: any;
}) {
  const PageLayout = investment ? InvestmentLayout : Layout;

  return (
    <Route {...routeProps}>
      {(params) => (
        <AuthGuard>
          <PageLayout>
            <Component {...params} />
          </PageLayout>
        </AuthGuard>
      )}
    </Route>
  );
}

function ProtectedAreaSelection() {
  return (
    <AuthGuard>
      <AreaSelection />
    </AuthGuard>
  );
}

function SignInPage() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-background px-4">
      <SignIn
        routing="path"
        path={`${basePath}/sign-in`}
        signUpUrl={`${basePath}/sign-up`}
      />
    </div>
  );
}

function SignUpPage() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-background px-4">
      <SignUp
        routing="path"
        path={`${basePath}/sign-up`}
        signInUrl={`${basePath}/sign-in`}
      />
    </div>
  );
}

function ClerkQueryClientCacheInvalidator() {
  const { addListener } = useClerk();
  const prevUserIdRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    const unsubscribe = addListener(({ user }) => {
      const userId = user?.id ?? null;
      if (
        prevUserIdRef.current !== undefined &&
        prevUserIdRef.current !== userId
      ) {
        queryClient.clear();
      }
      prevUserIdRef.current = userId;
    });
    return unsubscribe;
  }, [addListener]);

  return null;
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={Login} />
      <Route path="/sign-in/*?" component={SignInPage} />
      <Route path="/sign-up/*?" component={SignUpPage} />
      <Route path="/areas" component={ProtectedAreaSelection} />
      <ProtectedRoute path="/dashboard" component={Dashboard} />
      <ProtectedRoute path="/dre/new" component={DREInput} />
      <ProtectedRoute path="/reports/:id" component={Report} />
      <ProtectedRoute path="/reports" component={Report} />
      <ProtectedRoute path="/analysis" component={Analysis} />
      <ProtectedRoute path="/projections" component={Projections} />
      <ProtectedRoute path="/credits" component={Credits} />
      <ProtectedRoute path="/balance-sheet" component={BalanceSheet} />
      <ProtectedRoute path="/settings" component={Settings} />
      <ProtectedRoute investment path="/investments/agents/:ticker" component={InvestmentReport} />
      <ProtectedRoute investment path="/investments/agents" component={AIAgents} />
      <ProtectedRoute
        investment
        path="/investments/portfolio"
        component={InvestmentPortfolio}
      />
      <ProtectedRoute
        investment
        path="/investments/reports"
        component={InvestmentReports}
      />
      <ProtectedRoute
        investment
        path="/investments/credits"
        component={Credits}
      />
      <ProtectedRoute
        investment
        path="/investments/settings"
        component={() => <InvestmentPlaceholder kind="settings" />}
      />
      <Route component={NotFound} />
    </Switch>
  );
}

import { LanguageModal } from "@/components/language-modal";

function ClerkProviderWithRoutes() {
  const [, setLocation] = useLocation();

  return (
    <ClerkProvider
      publishableKey={clerkPubKey}
      proxyUrl={clerkProxyUrl}
      appearance={clerkAppearance}
      signInUrl={`${basePath}/sign-in`}
      signUpUrl={`${basePath}/sign-up`}
      localization={{
        signIn: {
          start: {
            title: "Bem-vindo de volta",
            subtitle: "Entre com sua conta para acessar seus relatórios",
          },
        },
        signUp: {
          start: {
            title: "Crie sua conta",
            subtitle: "Comece a transformar seus dados em decisões",
          },
        },
      }}
      routerPush={(to) =>
        setLocation(
          basePath && to.startsWith(basePath)
            ? to.slice(basePath.length) || "/"
            : to,
        )
      }
      routerReplace={(to) =>
        setLocation(
          basePath && to.startsWith(basePath)
            ? to.slice(basePath.length) || "/"
            : to,
          { replace: true },
        )
      }
    >
      <ClerkQueryClientCacheInvalidator />
      <Router />
    </ClerkProvider>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <LanguageProvider>
        <TooltipProvider>
          <Toaster />
          <LanguageModal />
          <WouterRouter base={basePath}>
            <ClerkProviderWithRoutes />
          </WouterRouter>
        </TooltipProvider>
      </LanguageProvider>
    </QueryClientProvider>
  );
}

export default App;
