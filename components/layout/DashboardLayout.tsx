"use client";

import { useState, memo } from "react";
import { Sidebar } from "./Sidebar";
import { Navbar } from "./Navbar";
import { GlobalPaymentModal } from "@/components/wallet/global-payment-modal";

interface DashboardLayoutProps {
    children: React.ReactNode;
}

const MemoizedSidebar = memo(Sidebar);
const MemoizedNavbar = memo(Navbar);

export default function DashboardLayout({ children }: DashboardLayoutProps) {
    return (
        <>
            {children}
            <GlobalPaymentModal />
        </>
    );
}
