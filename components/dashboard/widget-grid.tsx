"use client";

import { useCallback, useEffect, useRef } from "react";
import { X } from "lucide-react";
import type { Layout, Layouts } from "react-grid-layout";
import { Responsive, WidthProvider } from "react-grid-layout";

import { WIDGET_META } from "@/lib/dashboard/widget-catalog";
import { cn } from "@/lib/utils";
import { useDashboardLayoutStore } from "@/store/dashboard-layout-store";
import { useToastStore } from "@/store/toast-store";
import type { WidgetId } from "@/types/dashboard";

import { ActivePositionsWidget } from "@/components/dashboard/widgets/active-positions-widget";
import { DepositWithdrawalWidget } from "@/components/dashboard/widgets/deposit-withdrawal-widget";
import { MarketOverviewWidget } from "@/components/dashboard/widgets/market-overview-widget";
import { TradingSessionsWidget } from "@/components/dashboard/widgets/trading-sessions-widget";
import { AccountOverviewWidget } from "@/components/dashboard/widgets/account-overview-widget";
import { TradingStatisticsWidget } from "@/components/dashboard/widgets/trading-statistics-widget";
import { RecentTradesWidget } from "@/components/dashboard/widgets/recent-trades-widget";
import { EntertainmentWidget } from "@/components/dashboard/widgets/entertainment-widget";

const ResponsiveGrid = WidthProvider(Responsive);

const renderWidget = (widgetId: WidgetId) => {
  switch (widgetId) {
    case "account-overview":
      return <AccountOverviewWidget />;
    case "trading-statistics":
      return <TradingStatisticsWidget />;
    case "recent-trades":
      return <RecentTradesWidget />;
    case "entertainment":
      return <EntertainmentWidget />;
    case "market-overview":
      return <MarketOverviewWidget />;
    case "deposit-withdrawal":
      return <DepositWithdrawalWidget />;
    case "trading-sessions":
      return <TradingSessionsWidget />;
    case "active-positions":
      return <ActivePositionsWidget />;
    default:
      return null;
  }
};

export function WidgetGrid() {
  const { layouts, isEditMode, activeWidgets, updateLayouts, hideWidget, markSaved } = useDashboardLayoutStore();
  const { addToast } = useToastStore();

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initialized = useRef(false);

  useEffect(() => {
    return () => {
      if (saveTimer.current) {
        clearTimeout(saveTimer.current);
      }
    };
  }, []);

  const handleLayoutChange = useCallback(
    (_layout: Layout[], nextLayouts: Layouts) => {
      if (!initialized.current) {
        initialized.current = true;
        return;
      }

      if (!isEditMode) {
        return;
      }

      updateLayouts(nextLayouts);

      if (saveTimer.current) {
        clearTimeout(saveTimer.current);
      }

      saveTimer.current = setTimeout(() => {
        markSaved();
      }, 2000);
    },
    [isEditMode, markSaved, updateLayouts],
  );

  const handleHideWidget = (widgetId: WidgetId) => {
    hideWidget(widgetId);
    addToast(`${WIDGET_META[widgetId].title} removed`, "info");
  };

  return (
    <ResponsiveGrid
      className={cn("transition-all", isEditMode && "layout-editing")}
      layouts={layouts}
      breakpoints={{ lg: 1200, md: 900, sm: 0 }}
      cols={{ lg: 12, md: 12, sm: 1 }}
      rowHeight={18}
      margin={[14, 14]}
      containerPadding={[0, 0]}
      isDraggable={isEditMode}
      isResizable={isEditMode}
      compactType="vertical"
      resizeHandles={["se", "sw", "ne", "nw"]}
      onLayoutChange={handleLayoutChange}
      draggableHandle={undefined}
      draggableCancel=".non-draggable, button, input, textarea, select, [role='button']"
      useCSSTransforms
    >
      {activeWidgets.map((widgetId) => (
        <div
          key={widgetId}
          className={cn(
            "group relative h-full",
            isEditMode && "select-none cursor-move",
            isEditMode && "ring-2 ring-transparent hover:ring-primary/30 rounded-md transition-all duration-200"
          )}
        >
          {/* Remove Button */}
          {isEditMode && activeWidgets.length > 1 ? (
            <button
              type="button"
              className="non-draggable absolute right-2.5 top-2.5 z-10 inline-flex h-7 w-7 items-center justify-center rounded-md bg-card border border-border text-muted-foreground shadow-fintech opacity-0 transition-all hover:bg-danger/10 hover:text-danger group-hover:opacity-100"
              onClick={() => handleHideWidget(widgetId)}
              aria-label={`Hide ${WIDGET_META[widgetId].title}`}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          ) : null}

          {/* Resize Corner Indicators */}
          {isEditMode && (
            <>
              <div className="absolute bottom-1 right-1 h-2.5 w-2.5 rounded-full bg-primary/40 opacity-0 group-hover:opacity-100 transition-opacity" />
              <div className="absolute bottom-1 left-1 h-2.5 w-2.5 rounded-full bg-primary/40 opacity-0 group-hover:opacity-100 transition-opacity" />
              <div className="absolute top-1 right-1 h-2.5 w-2.5 rounded-full bg-primary/40 opacity-0 group-hover:opacity-100 transition-opacity" />
              <div className="absolute top-1 left-1 h-2.5 w-2.5 rounded-full bg-primary/40 opacity-0 group-hover:opacity-100 transition-opacity" />
            </>
          )}

          {renderWidget(widgetId)}
        </div>
      ))}
    </ResponsiveGrid>
  );
}
