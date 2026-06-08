"use client";

import { useState, useEffect } from "react";
import { Pencil, Save, X, Plus, Sparkles, GripVertical, LayoutDashboard, Store, BadgeCheck } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useDashboardLayoutStore } from "@/store/dashboard-layout-store";
import { useToastStore } from "@/store/toast-store";
import { useAuth } from "@/components/auth/auth-provider";
import { DashboardDataProvider } from "@/components/dashboard/dashboard-data-provider";
import { WidgetGrid } from "@/components/dashboard/widget-grid";
import { WidgetMarketplace } from "@/components/dashboard/widget-marketplace";
import DashboardLayout from "@/components/layout/DashboardLayout";

export function DashboardShell() {
  const {
    isEditMode,
    startEditing,
    finishEditing,
    cancelEditing,
    activeWidgets,
    showWidget,
    hideWidget,
    lastSavedAt,
    validateLayouts
  } = useDashboardLayoutStore();

  const { user } = useAuth();
  const firstName = user?.name?.split(" ")[0] || "User";

  const [activeTab, setActiveTab] = useState("overview");
  const [savedTime, setSavedTime] = useState("");

  useEffect(() => {
    validateLayouts();
  }, [validateLayouts]);

  useEffect(() => {
    setSavedTime(
      new Date(lastSavedAt).toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      })
    );
  }, [lastSavedAt]);

  const { addToast } = useToastStore();
  const handleToggleWidget = (widgetId: any) => {
    if (activeWidgets.includes(widgetId)) {
      if (activeWidgets.length <= 1) {
        addToast("At least one widget must be visible.", "error");
        return;
      }
      hideWidget(widgetId);
    } else {
      showWidget(widgetId);
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* ── Premium Welcome Header ── */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight text-foreground font-display">
              Welcome, {firstName}!
            </h1>
            {user?.profileVerified && (
              <span 
                className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full font-bold tracking-wide uppercase"
                style={{
                  fontSize: '10px',
                  background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.12) 0%, rgba(37, 99, 235, 0.18) 50%, rgba(96, 165, 250, 0.08) 100%)',
                  color: '#60A5FA',
                  border: '1px solid rgba(59, 130, 246, 0.35)',
                  boxShadow: '0 0 20px rgba(59, 130, 246, 0.35), 0 0 40px rgba(59, 130, 246, 0.15), 0 4px 12px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(96, 165, 250, 0.15)',
                  textShadow: '0 0 8px rgba(59, 130, 246, 0.3)',
                }}
              >
                <BadgeCheck className="h-3 w-3" style={{ filter: 'drop-shadow(0 0 4px rgba(59, 130, 246, 0.4))' }} />
                Verified
              </span>
            )}
          </div>
            <div className="flex items-center gap-3 text-sm text-muted-foreground">
              <div className="flex items-center gap-1.5">
                <div className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
                <span>{activeWidgets.length} widgets active</span>
              </div>
              <span className="text-border">|</span>
              <span className="text-primary/80 font-medium">Last saved {savedTime}</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {!isEditMode ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setActiveTab("overview");
                  startEditing();
                }}
                className="gap-2"
              >
                <Pencil className="h-3.5 w-3.5" />
                Edit Dashboard
              </Button>
            ) : (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setActiveTab(activeTab === "store" ? "overview" : "store")}
                  className={cn(
                    "gap-2 border-dashed transition-all",
                    activeTab === "store" && "bg-muted border-solid border-primary/30"
                  )}
                >
                  <Plus className="h-3.5 w-3.5" />
                  {activeTab === "store" ? "Back to Dashboard" : "Add Widget"}
                </Button>

                <Button
                  size="sm"
                  onClick={() => {
                    setActiveTab("overview");
                    finishEditing();
                  }}
                  className="gap-2 bg-gradient-to-r from-primary to-primary/90 hover:from-primary/90 hover:to-primary text-primary-foreground shadow-sm shadow-primary/20"
                >
                  <Save className="h-3.5 w-3.5" />
                  Save
                </Button>

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setActiveTab("overview");
                    cancelEditing();
                  }}
                  className="gap-2 text-muted-foreground"
                >
                  <X className="h-3.5 w-3.5" />
                  Cancel
                </Button>
              </>
            )}
          </div>
        </div>

        {/* ── Premium Edit Mode Banner ── */}
        {isEditMode && activeTab === "overview" && (
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between rounded-[2rem] border border-primary/15 bg-gradient-to-r from-primary/10 via-primary/5 to-primary/10 px-6 py-5 shadow-lg shadow-primary/5 animate-in fade-in slide-in-from-top-2 duration-300">
            <div className="flex items-start gap-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white dark:bg-primary/20 text-primary shadow-sm ring-1 ring-primary/20 mt-0.5">
                <Sparkles className="h-5 w-5" />
              </div>
              <div className="flex flex-col gap-1">
                <span className="font-bold text-base text-foreground tracking-tight">
                  Edit Mode Active
                </span>
                <span className="text-muted-foreground text-sm">
                  Drag widgets to rearrange, resize by dragging corners. Auto-saves after 2 seconds.
                </span>
              </div>
            </div>
            <div className="mt-4 sm:mt-0 shrink-0 flex items-center gap-2 bg-white dark:bg-primary/20 px-4 py-2 rounded-xl text-sm font-bold text-primary shadow-sm ring-1 ring-primary/10">
              <GripVertical className="h-4 w-4" />
              Drag & Drop
            </div>
          </div>
        )}

        {/* ── Tabs Navigation ── */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="bg-transparent p-0 gap-4 h-auto w-full flex-wrap justify-start">
            <TabsTrigger
              value="overview"
              className="gap-2 rounded-md px-4 py-2 text-base font-medium data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=inactive]:text-muted-foreground data-[state=inactive]:hover:bg-muted data-[state=inactive]:hover:text-foreground transition-all shadow-none"
            >
              <LayoutDashboard className="h-4 w-4" />
              My Dashboard
            </TabsTrigger>
            <TabsTrigger
              value="store"
              className="gap-2 rounded-md px-4 py-2 text-base font-medium data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=inactive]:text-muted-foreground data-[state=inactive]:hover:bg-muted data-[state=inactive]:hover:text-foreground transition-all shadow-none"
            >
              <Store className="h-4 w-4" />
              Widget Store
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4">
            <DashboardDataProvider>
              <WidgetGrid />
            </DashboardDataProvider>
          </TabsContent>

          <TabsContent value="store" className="space-y-4">
            <WidgetMarketplace
              onToggle={handleToggleWidget}
              activeWidgets={activeWidgets}
            />
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
