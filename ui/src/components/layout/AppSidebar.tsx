"use client";

import {
  AlertTriangle,
  ArrowUpCircle,
  ChevronLeft,
  ChevronRight,
  FileText,
  LogOut,
  MoreVertical,
  Phone,
  Settings,
  TrendingUp,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import React from "react";

import { BrandLogo } from "@/components/BrandLogo";
import ThemeToggle from "@/components/ThemeSwitcher";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useAppConfig } from "@/context/AppConfigContext";
import { useTelephonyConfigWarnings } from "@/context/TelephonyConfigWarningsContext";
import { useLatestReleaseVersion } from "@/hooks/useLatestReleaseVersion";
import type { LocalUser } from "@/lib/auth";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";

import { AiIcon } from "../icons/AiIcon";
import { AiIconOutline } from "../icons/AiIconOutline";
import { Audio } from "../icons/Audio";
import { AudioOutline } from "../icons/AudioOutline";
import { File } from "../icons/File";
import { FileOutline } from "../icons/FileOutline";
import { Key } from "../icons/Key";
import { KeyOutline } from "../icons/KeyOutline";
import { Model } from "../icons/Model";
import { ModelOutline } from "../icons/ModelOutline";
import { Tool } from "../icons/Tool";
import { ToolOutline } from "../icons/ToolOutline";
import { Trade } from "../icons/Trade";
import { TradeOutline } from "../icons/TradeOutline";

type IconComponent = React.ComponentType<{ className?: string }>;

type SidebarNavItem = {
  title: string;
  url: string;
  /** Icon shown when the item is inactive (outline variant). */
  icon: IconComponent;
  /** Icon shown when the item is active (filled variant). Falls back to `icon`. */
  activeIcon?: IconComponent;
  showsTelephonyWarning?: boolean;
};

type SidebarNavSection = {
  label?: string;
  items: SidebarNavItem[];
};

const TELEPHONY_WARNING_COPY = "Action required";

const NAV_SECTIONS: SidebarNavSection[] = [
  {
    label: "BUILD",
    items: [
      {
        title: "Agents",
        url: "/workflow",
        icon: AiIconOutline,
        activeIcon: AiIcon,
      },
      {
        title: "Campaigns",
        url: "/campaigns",
        icon: TradeOutline,
        activeIcon: Trade,
      },
      {
        title: "Models",
        url: "/model-configurations",
        icon: ModelOutline,
        activeIcon: Model,
      },
      {
        title: "Telephony",
        url: "/telephony-configurations",
        icon: Phone,
        showsTelephonyWarning: true,
      },
      {
        title: "Tools",
        url: "/tools",
        icon: ToolOutline,
        activeIcon: Tool,
      },
      {
        title: "Files",
        url: "/files",
        icon: FileOutline,
        activeIcon: File,
      },
      {
        title: "Recordings",
        url: "/recordings",
        icon: AudioOutline,
        activeIcon: Audio,
      },
      {
        title: "Developers",
        url: "/api-keys",
        icon: KeyOutline,
        activeIcon: Key,
      },
    ],
  },
  {
    label: "MANAGE",
    items: [
      {
        title: "Agent Runs",
        url: "/usage",
        icon: TrendingUp,
      },
      {
        title: "Reports",
        url: "/reports",
        icon: FileText,
      },
    ],
  },
];

export function AppSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { state, isMobile, setOpenMobile } = useSidebar();
  const { provider, logout, user } = useAuth();
  const { config } = useAppConfig();
  const {
    telnyxMissingWebhookPublicKeyCount,
    vonageMissingSignatureSecretCount,
  } = useTelephonyConfigWarnings();
  const hasTelephonyWarning =
    telnyxMissingWebhookPublicKeyCount > 0 ||
    vonageMissingSignatureSecretCount > 0;
  const isCollapsed = !isMobile && state === "collapsed";

  // Version info from app config context
  const versionInfo = config
    ? { ui: config.uiVersion, api: config.apiVersion }
    : null;

  // Check for updates only on self-hosted (OSS) deployments — cloud is managed for the user.
  const {
    latest: latestRelease,
    isBehind,
    isLatest,
  } = useLatestReleaseVersion(versionInfo?.ui, {
    enabled: config?.deploymentMode === "oss",
  });

  const isActive = (path: string) => pathname.startsWith(path);

  const handleMobileNavClick = () => {
    if (isMobile) {
      setOpenMobile(false);
    }
  };

  const SidebarLink = ({ item }: { item: SidebarNavItem }) => {
    const isItemActive = isActive(item.url);
    // Show the filled variant when active, the outline variant otherwise.
    const Icon = isItemActive ? (item.activeIcon ?? item.icon) : item.icon;
    const showWarningDot = item.showsTelephonyWarning && hasTelephonyWarning;
    const tooltip = {
      children: (
        <div className="notranslate" translate="no">
          <p>{item.title}</p>
          {showWarningDot && (
            <p className="text-amber-600 dark:text-amber-400">
              {TELEPHONY_WARNING_COPY}
            </p>
          )}
        </div>
      ),
    };
    const warningIndicator = (
      <AlertTriangle
        aria-label="Action required on a telephony configuration"
        className={cn(
          "text-amber-500",
          isCollapsed
            ? "absolute -right-0.5 -top-0.5 h-3 w-3"
            : "ml-auto h-3.5 w-3.5",
        )}
      />
    );

    return (
      <SidebarMenuButton
        asChild
        tooltip={tooltip}
        className={cn(
          "rounded-xl transition-colors hover:bg-accent hover:text-foreground",
          isItemActive &&
            "bg-cta/15 font-semibold text-foreground hover:bg-cta/20 hover:text-foreground",
        )}
      >
        <Link
          href={item.url}
          onClick={handleMobileNavClick}
          className={cn("relative", isCollapsed && "justify-center")}
          translate="no"
        >
          <Icon className={cn("h-4 w-4 shrink-0")} />
          <span
            className={cn(
              "notranslate min-w-0 flex-1 truncate",
              isCollapsed && "sr-only",
            )}
            translate="no"
          >
            {item.title}
          </span>
          {showWarningDot &&
            (isCollapsed ? (
              warningIndicator
            ) : (
              <Tooltip>
                <TooltipTrigger asChild>{warningIndicator}</TooltipTrigger>
                <TooltipContent side="right">
                  <p>{TELEPHONY_WARNING_COPY}</p>
                </TooltipContent>
              </Tooltip>
            ))}
        </Link>
      </SidebarMenuButton>
    );
  };

  // Footer identity: avatar + name/email + a "more" menu. Expanded shows the
  // full identity card; collapsed shows the avatar alone as the menu trigger.
  const userEmail =
    (user as { primaryEmail?: string } | undefined)?.primaryEmail ||
    (user as LocalUser | undefined)?.email ||
    "";
  const userName =
    user?.displayName || (userEmail ? userEmail.split("@")[0] : "") || "User";
  const displayIdentity = user?.displayName || userEmail || "";
  const userInitials =
    displayIdentity
      .split(/[\s@]/)
      .filter(Boolean)
      .slice(0, 2)
      .map((s: string) => s[0]?.toUpperCase())
      .join("") || "U";

  const avatar = (
    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border/80 bg-muted/40">
      <span className="text-xs font-medium">{userInitials}</span>
    </div>
  );

  // Shared dropdown contents for the footer identity menu. The three-dot
  // trigger (expanded) and the avatar trigger (collapsed) both open this.
  const userMenuContent = (
    <DropdownMenuContent
      side="top"
      align={isCollapsed ? "start" : "end"}
      className="w-56"
    >
      <DropdownMenuLabel className="font-normal">
        <div className="flex flex-col space-y-1">
          <p className="truncate text-sm font-medium">{userName}</p>
          {userEmail && (
            <p className="truncate text-xs text-muted-foreground">{userEmail}</p>
          )}
        </div>
      </DropdownMenuLabel>
      <DropdownMenuSeparator />
      {provider === "stack" && (
        <DropdownMenuItem
          onClick={() => router.push("/handler/account-settings")}
          className="cursor-pointer"
        >
          <Settings className="mr-2 h-4 w-4" />
          Account settings
        </DropdownMenuItem>
      )}
      <DropdownMenuItem
        onClick={() => router.push("/settings")}
        className="cursor-pointer"
      >
        <Settings className="mr-2 h-4 w-4" />
        Platform Settings
      </DropdownMenuItem>
      <DropdownMenuItem onClick={() => logout()} className="cursor-pointer">
        <LogOut className="mr-2 h-4 w-4" />
        Sign out
      </DropdownMenuItem>
    </DropdownMenuContent>
  );

  return (
    <Sidebar
      collapsible="icon"
      variant="sidebar"
      className="app-sidebar-dock py-4 bg-transparent"
    >
      <SidebarHeader className="px-2 py-3 notranslate" translate="no">
        <div className="flex items-center justify-between">
          <div
            className={cn("flex items-center gap-2", isCollapsed && "hidden")}
          >
            <Link
              href="/"
              className="notranslate flex items-center gap-2 px-1"
              translate="no"
            >
              <BrandLogo mark className="h-6" />
              {versionInfo && (
                <span
                  className="notranslate text-xs font-normal text-muted-foreground"
                  translate="no"
                >
                  v{versionInfo.ui}
                </span>
              )}
            </Link>
            {isBehind && latestRelease && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <a
                    href="https://docs.dograh.com/deployment/update"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 rounded-md border bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium leading-none text-amber-900 transition-opacity hover:opacity-80 dark:bg-amber-950 dark:text-amber-200"
                  >
                    <ArrowUpCircle className="h-3 w-3" />
                    Update
                  </a>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  <p>Latest: {latestRelease} - click to see the update guide</p>
                </TooltipContent>
              </Tooltip>
            )}
            {isLatest && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="inline-flex items-center rounded-md border bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium leading-none text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200">
                    Latest
                  </span>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  <p>You&apos;re running the latest release</p>
                </TooltipContent>
              </Tooltip>
            )}
          </div>

          <div
            className={cn(
              "flex items-center gap-0.5",
              isCollapsed && "mx-auto flex-col",
            )}
          >
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="notranslate" translate="no">
                  <ThemeToggle
                    showLabel={false}
                    className="rounded-full hover:bg-accent hover:text-foreground"
                  />
                </div>
              </TooltipTrigger>
              <TooltipContent side={isCollapsed ? "right" : "bottom"}>
                <p>Toggle theme</p>
              </TooltipContent>
            </Tooltip>
            <SidebarTrigger className="hover:bg-accent">
              {isCollapsed ? (
                <ChevronRight className="h-4 w-4" />
              ) : (
                <ChevronLeft className="h-4 w-4" />
              )}
            </SidebarTrigger>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent
        className={cn("notranslate", isCollapsed && "px-0")}
        translate="no"
      >
        {NAV_SECTIONS.map((section, index) => (
          <SidebarGroup
            key={section.label ?? "overview"}
            className={index === 0 ? "mt-2" : "mt-6"}
          >
            {section.label && (
              <SidebarGroupLabel
                className={cn(
                  "notranslate text-xs font-semibold uppercase tracking-wider text-muted-foreground",
                  isCollapsed && "hidden",
                )}
                translate="no"
              >
                {section.label}
              </SidebarGroupLabel>
            )}
            <SidebarMenu>
              {section.items.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarLink item={item} />
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter
        className={cn("p-3 notranslate", isCollapsed && "p-2")}
        translate="no"
      >
        <div className="space-y-2">
          <DropdownMenu>
            {isCollapsed ? (
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Account menu"
                  className="mx-auto h-9 w-9 shrink-0 cursor-pointer rounded-full border border-border/80 bg-muted/40 hover:bg-muted/60"
                >
                  <span className="text-xs font-medium">{userInitials}</span>
                </Button>
              </DropdownMenuTrigger>
            ) : (
              <div className="flex items-center gap-2 rounded-xl border border-border/60 bg-muted/30 p-1.5">
                {avatar}
                <div className="min-w-0 flex-1 leading-tight">
                  <p className="truncate text-sm font-medium">{userName}</p>
                  {userEmail && (
                    <p className="truncate text-xs text-muted-foreground">
                      {userEmail}
                    </p>
                  )}
                </div>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Account menu"
                    className="h-7 w-7 shrink-0 cursor-pointer rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
                  >
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
              </div>
            )}
            {userMenuContent}
          </DropdownMenu>
        </div>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
