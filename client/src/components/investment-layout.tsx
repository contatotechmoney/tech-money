import { useState } from "react";
import { Link, useLocation } from "wouter";
import {
  ArrowLeft,
  BriefcaseBusiness,
  BrainCircuit,
  ChartNoAxesCombined,
  CreditCard,
  LogOut,
  Menu,
  Settings,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { useLanguage } from "@/contexts/LanguageContext";
import { LanguageSelector } from "@/components/language-selector";
import { useClerk, useUser } from "@clerk/react";

export default function InvestmentLayout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const { t } = useLanguage();
  const { signOut } = useClerk();
  const { user } = useUser();
  const userName =
    user?.fullName ||
    user?.primaryEmailAddress?.emailAddress ||
    "Conta Tech Money";
  const userInitials = userName
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const navItems = [
    { label: t("aiAgents"), icon: BrainCircuit, href: "/investments/agents" },
    { label: t("portfolio"), icon: BriefcaseBusiness, href: "/investments/portfolio" },
    { label: t("investmentReports"), icon: ChartNoAxesCombined, href: "/investments/reports" },
    { label: t("creditsPlans"), icon: CreditCard, href: "/investments/credits" },
    { label: t("investmentSettings"), icon: Settings, href: "/investments/settings" },
  ];

  const isActive = (href: string) => location === href || location.startsWith(`${href}/`);

  const SidebarContent = () => (
    <div className="flex h-full flex-col border-r border-[#143d31] bg-[#1b4d3e] text-white">
      <div className="p-6">
        <Link href="/areas" className="block">
          <div className="flex items-center gap-2">
            <div className="flex gap-0.5" aria-hidden="true">
              <div className="flex flex-col gap-0.5">
                <div className="flex h-4 w-4 items-center justify-center bg-[#2a9d8f] text-[8px] font-bold">T</div>
                <div className="flex h-4 w-4 items-center justify-center bg-[#2a9d8f] text-[8px] font-bold">T</div>
              </div>
              <div className="mt-2 flex flex-col gap-0.5">
                <div className="flex h-4 w-4 items-center justify-center bg-[#264653] text-[8px] font-bold">M</div>
                <div className="flex h-4 w-4 items-center justify-center bg-[#2a9d8f] text-[8px] font-bold">R</div>
              </div>
            </div>
            <span className="ml-1 text-xl font-bold tracking-tight">Tech Money®</span>
          </div>
        </Link>
        <p className="mt-2 pl-1 text-[10px] uppercase tracking-wider text-white/70">{t("investmentArea")}</p>
      </div>

      <div className="flex-1 space-y-1 px-3 py-4">
        {navItems.map((item) => (
          <Link key={item.href} href={item.href} onClick={() => setIsMobileOpen(false)}>
            <div
              className={`flex cursor-pointer items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors ${
                isActive(item.href)
                  ? "bg-[#2a9d8f] text-white shadow-md"
                  : "text-white/80 hover:bg-white/10 hover:text-white"
              }`}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </div>
          </Link>
        ))}
      </div>

      <div className="border-t border-[#143d31] p-4">
        <Link href="/areas" onClick={() => setIsMobileOpen(false)}>
          <div className="mb-4 flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-xs text-white/70 transition-colors hover:bg-white/10 hover:text-white">
            <ArrowLeft className="h-3.5 w-3.5" />
            {t("chooseAnotherArea")}
          </div>
        </Link>
        <div className="flex items-center gap-3 rounded-md p-2">
          <Avatar className="h-8 w-8 rounded-lg border border-[#2a9d8f]/30">
            <AvatarFallback className="bg-[#2a9d8f] text-white">{userInitials}</AvatarFallback>
          </Avatar>
          <div className="flex min-w-0 flex-col text-left">
            <span className="truncate text-sm font-medium">{userName}</span>
            <span className="text-xs text-white/60">{t("investmentArea")}</span>
          </div>
          <button
            type="button"
            className="ml-auto rounded p-1 text-white/50 transition-colors hover:bg-white/10 hover:text-white"
            aria-label={t("logout")}
            onClick={() => void signOut({ redirectUrl: "/" })}
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen w-full bg-background">
      <aside className="fixed z-30 hidden h-full w-64 md:block">
        <SidebarContent />
      </aside>

      <Sheet open={isMobileOpen} onOpenChange={setIsMobileOpen}>
        <SheetContent side="left" className="w-64 p-0">
          <SidebarContent />
        </SheetContent>
      </Sheet>

      <main className="flex min-h-screen flex-1 flex-col md:ml-64">
        <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-border bg-background/95 px-4 backdrop-blur md:px-6">
          <Button variant="ghost" size="icon" className="md:hidden" onClick={() => setIsMobileOpen(true)} aria-label="Open menu">
            <Menu className="h-5 w-5" />
          </Button>
          <div className="hidden items-center gap-3 md:flex">
            <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{t("investmentArea")}</span>
          </div>
          <LanguageSelector />
        </header>
        <div className="mx-auto w-full max-w-7xl flex-1 p-4 pt-6 md:p-8">{children}</div>
      </main>
    </div>
  );
}