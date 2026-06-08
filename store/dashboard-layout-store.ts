"use client";

import type { Layouts } from "react-grid-layout";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { DASHBOARD_WIDGET_ORDER, DEFAULT_WIDGET_LAYOUTS } from "@/lib/dashboard/widget-catalog";
import type { WidgetId } from "@/types/dashboard";

const cloneLayouts = (layouts: Layouts): Layouts =>
  Object.fromEntries(
    Object.entries(layouts).map(([key, items]) => [
      key,
      (items ?? []).map((item) => ({ ...item })),
    ]),
  ) as Layouts;

const fallbackStorage: Storage = {
  getItem: () => null,
  setItem: () => undefined,
  removeItem: () => undefined,
  clear: () => undefined,
  key: () => null,
  get length() {
    return 0;
  },
};

interface DashboardLayoutState {
  isEditMode: boolean;
  isSaving: boolean;
  lastSavedAt: number;
  layouts: Layouts;
  activeWidgets: WidgetId[];
  // For cancel/revert functionality
  previousLayouts: Layouts | null;
  previousActiveWidgets: WidgetId[] | null;
  // Actions
  setEditMode: (value: boolean) => void;
  toggleEditMode: () => void;
  startEditing: () => void;
  cancelEditing: () => void;
  finishEditing: () => void;
  updateLayouts: (layouts: Layouts) => void;
  showWidget: (widgetId: WidgetId) => void;
  hideWidget: (widgetId: WidgetId) => void;
  markSaved: () => void;
  saveNow: () => void;
  resetLayouts: () => void;
  validateLayouts: () => void;
}

export const useDashboardLayoutStore = create<DashboardLayoutState>()(
  persist(
    (set) => ({
      isEditMode: false,
      isSaving: false,
      lastSavedAt: Date.now(),
      layouts: cloneLayouts(DEFAULT_WIDGET_LAYOUTS),
      activeWidgets: [...DASHBOARD_WIDGET_ORDER],
      previousLayouts: null,
      previousActiveWidgets: null,
      setEditMode: (value) => set({ isEditMode: value }),
      toggleEditMode: () => set((state) => ({ isEditMode: !state.isEditMode })),
      startEditing: () =>
        set((state) => ({
          isEditMode: true,
          previousLayouts: cloneLayouts(state.layouts),
          previousActiveWidgets: [...state.activeWidgets],
        })),
      cancelEditing: () =>
        set((state) => ({
          isEditMode: false,
          layouts: state.previousLayouts
            ? cloneLayouts(state.previousLayouts)
            : state.layouts,
          activeWidgets: state.previousActiveWidgets
            ? [...state.previousActiveWidgets]
            : state.activeWidgets,
          previousLayouts: null,
          previousActiveWidgets: null,
        })),
      finishEditing: () =>
        set({
          isEditMode: false,
          previousLayouts: null,
          previousActiveWidgets: null,
          isSaving: false,
          lastSavedAt: Date.now(),
        }),
      updateLayouts: (layouts) =>
        set({
          layouts: cloneLayouts(layouts),
          isSaving: true,
        }),
      showWidget: (widgetId) =>
        set((state) => {
          if (state.activeWidgets.includes(widgetId)) {
            return state;
          }

          // Ensure layout exists for this widget so it appears instantly
          const newLayouts = cloneLayouts(state.layouts);
          let layoutChanged = false;

          (Object.keys(DEFAULT_WIDGET_LAYOUTS) as (keyof Layouts)[]).forEach((bp) => {
            if (!newLayouts[bp]) newLayouts[bp] = [];
            const defaultItem = DEFAULT_WIDGET_LAYOUTS[bp]?.find((i) => i.i === widgetId);

            if (defaultItem) {
              const existingIndex = newLayouts[bp].findIndex((i) => i.i === widgetId);
              if (existingIndex === -1) {
                newLayouts[bp].push({ ...defaultItem });
                layoutChanged = true;
              }
            }
          });

          return {
            activeWidgets: [...state.activeWidgets, widgetId],
            layouts: layoutChanged ? newLayouts : state.layouts,
            isSaving: false,
            lastSavedAt: Date.now(),
          };
        }),
      hideWidget: (widgetId) =>
        set((state) => {
          if (state.activeWidgets.length <= 1) {
            return state;
          }
          return {
            activeWidgets: state.activeWidgets.filter((entry) => entry !== widgetId),
            isSaving: false,
            lastSavedAt: Date.now(),
          };
        }),
      markSaved: () =>
        set({
          isSaving: false,
          lastSavedAt: Date.now(),
        }),
      saveNow: () =>
        set({
          isSaving: false,
          lastSavedAt: Date.now(),
        }),
      resetLayouts: () =>
        set({
          layouts: cloneLayouts(DEFAULT_WIDGET_LAYOUTS),
          activeWidgets: [...DASHBOARD_WIDGET_ORDER],
          isSaving: false,
          lastSavedAt: Date.now(),
        }),
      validateLayouts: () =>
        set((state) => {
          const newLayouts = cloneLayouts(state.layouts);
          let hasChanges = false;

          (Object.keys(DEFAULT_WIDGET_LAYOUTS) as (keyof Layouts)[]).forEach((bp) => {
            if (!newLayouts[bp]) {
              newLayouts[bp] = [];
            }
            const defaults = DEFAULT_WIDGET_LAYOUTS[bp];

            // 1. Add missing items
            defaults?.forEach((defaultItem) => {
              const existingItemIndex = newLayouts[bp].findIndex((item) => item.i === defaultItem.i);

              if (existingItemIndex === -1) {
                newLayouts[bp].push({ ...defaultItem });
                hasChanges = true;
              } else {
                // 2. Fix squashed items (w=1, h=1 is often RGL's default for dropped items)
                // Or check if it's significantly smaller than minW/minH
                const item = newLayouts[bp][existingItemIndex];
                if ((item.w === 1 && item.h === 1) || (defaultItem.minW && item.w < defaultItem.minW) || (defaultItem.minH && item.h < defaultItem.minH)) {
                  newLayouts[bp][existingItemIndex] = {
                    ...item,
                    w: defaultItem.w,
                    h: defaultItem.h,
                    minW: defaultItem.minW,
                    minH: defaultItem.minH
                  };
                  hasChanges = true;
                }
              }
            });
          });

          if (!hasChanges) return state;
          return { layouts: newLayouts };
        }),
    }),
    {
      name: "dominion-widget-layout-v3",
      storage: createJSONStorage(() =>
        typeof window === "undefined" ? fallbackStorage : localStorage,
      ),
      partialize: (state) => ({
        layouts: state.layouts,
        activeWidgets: state.activeWidgets,
        isEditMode: state.isEditMode,
        lastSavedAt: state.lastSavedAt,
      }),
    },
  ),
);
