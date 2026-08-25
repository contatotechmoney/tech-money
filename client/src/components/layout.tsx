import { useState } from "react";
import { Link, useLocation } from "wouter";
import { 
  LayoutDashboard, 
  FileSpreadsheet, 
  PieChart, 
  CreditCard, 
  Settings, 
  LogOut,
  Menu,
  X,
  Scale,
  ArrowLeft,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuLabel, 
  DropdownMenuSeparator, 
  DropdownMenuTrigger 
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { useLanguage } from "@/contexts/LanguageContext";
import { LanguageSelector } from "@/components/language-selector";
import { useClerk, useUser } from "@clerk/react";

export default function Layout({ children }: { children: React.ReactNode }) {
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
  // Using Tech Money brand color #0056b3 (approximate from "corporate blue")
  // Logo text style matches the site description

  const navItems = [
    { label: t("dashboard"), icon: LayoutDashboard, href: "/dashboard" },
    { label: t("newDRE"), icon: FileSpreadsheet, href: "/dre/new" },
    { label: t("balanceSheet"), icon: Scale, href: "/balance-sheet" },
    { label: t("reports"), icon: PieChart, href: "/reports" },
    { label: t("creditsPlans"), icon: CreditCard, href: "/credits" },
    { label: t("settings"), icon: Settings, href: "/settings" },
  ];

  const SidebarContent = () => (
    <div className="flex flex-col h-full bg-[#1b4d3e] text-white border-r border-[#143d31]">
      <div className="p-6">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2 mb-2">
            <div className="flex gap-0.5">
              <div className="flex flex-col gap-0.5">
                <div className="h-4 w-4 bg-[#2a9d8f] flex items-center justify-center text-[8px] font-bold text-white">T</div>
                <div className="h-4 w-4 bg-[#2a9d8f] flex items-center justify-center text-[8px] font-bold text-white">T</div>
              </div>
              <div className="flex flex-col gap-0.5 mt-2">
                <div className="h-4 w-4 bg-[#264653] flex items-center justify-center text-[8px] font-bold text-white">M</div>
                <div className="h-4 w-4 bg-[#2a9d8f] flex items-center justify-center text-[8px] font-bold text-white">R</div>
              </div>
            </div>
            <span className="text-xl font-bold tracking-tight text-white ml-1">Tech Money®</span>
          </div>
          <p className="text-[10px] text-white/70 uppercase tracking-wider pl-1">{t("transformingResults")}</p>
        </div>
        <Link href="/areas">
          <div className="mt-5 flex items-center gap-2 text-xs text-white/70 hover:text-white transition-colors cursor-pointer">
            <ArrowLeft className="h-3.5 w-3.5" />
            {t("chooseAnotherArea")}
          </div>
        </Link>
      </div>
      
      <div className="flex-1 py-4 px-3 space-y-1">
        {navItems.map((item) => {
          const isActive = location === item.href;
          return (
            <Link key={item.href} href={item.href}>
              <div
                className={`flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors cursor-pointer
                  ${isActive 
                    ? "bg-[#2a9d8f] text-white shadow-md" 
                    : "text-white/80 hover:bg-white/10 hover:text-white"
                  }`}
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </div>
            </Link>
          );
        })}
      </div>

      <div className="p-4 border-t border-[#143d31]">
        <div className="bg-[#143d31]/50 rounded-lg p-4 mb-4 border border-[#2a9d8f]/30">
          <div className="text-xs font-medium text-white/70 mb-1">{t("yourCredits")}</div>
          <div className="text-2xl font-bold text-white">12</div>
          <Link href="/credits">
            <Button variant="link" className="h-auto p-0 text-xs text-[#2a9d8f] hover:text-[#4db6ac] mt-1">
              {t("addMore")}
            </Button>
          </Link>
        </div>
        
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <div className="flex items-center gap-3 cursor-pointer hover:bg-white/10 rounded-md p-2 transition-colors">
              <Avatar className="h-8 w-8 rounded-lg border border-[#2a9d8f]/30">
                <AvatarImage src={user?.imageUrl} />
                <AvatarFallback>{userInitials}</AvatarFallback>
              </Avatar>
              <div className="flex flex-col text-left">
                <span className="max-w-32 truncate text-sm font-medium text-white">{userName}</span>
                <span className="text-xs text-white/60">{t("financialArea")}</span>
              </div>
            </div>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56 bg-[#1b4d3e] border-[#2a9d8f]/30 text-white">
            <DropdownMenuLabel>{t("myAccount")}</DropdownMenuLabel>
            <DropdownMenuSeparator className="bg-[#2a9d8f]/30" />
            <DropdownMenuItem className="focus:bg-[#2a9d8f] focus:text-white">{t("profile")}</DropdownMenuItem>
            <DropdownMenuItem className="focus:bg-[#2a9d8f] focus:text-white">{t("billing")}</DropdownMenuItem>
            <DropdownMenuSeparator className="bg-[#2a9d8f]/30" />
            <DropdownMenuItem
              className="text-red-300 focus:bg-[#2a9d8f] focus:text-red-200"
              onSelect={() => void signOut({ redirectUrl: "/" })}
            >
              <LogOut className="mr-2 h-4 w-4" />
              {t("logout")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-background flex w-full">
      {/* Desktop Sidebar */}
      <aside className="hidden md:block w-64 fixed h-full z-30">
        <SidebarContent />
      </aside>

      {/* Mobile Sidebar */}
      <Sheet open={isMobileOpen} onOpenChange={setIsMobileOpen}>
        <SheetContent side="left" className="p-0 w-64">
          <SidebarContent />
        </SheetContent>
      </Sheet>

      {/* Main Content */}
      <main className="flex-1 md:ml-64 min-h-screen flex flex-col">
        <header className="h-14 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-20 px-4 md:px-6 flex items-center justify-between">
          <Button variant="ghost" size="icon" className="md:hidden" onClick={() => setIsMobileOpen(true)} aria-label={t("openMenu")}>
            <Menu className="h-5 w-5" />
          </Button>
          <div className="flex">
            <LanguageSelector />
          </div>
        </header>
        <div className="flex-1 p-4 md:p-8 pt-6 max-w-7xl mx-auto w-full animate-in fade-in duration-500">
          {children}
        </div>
      </main>
    </div>
  );
}
