import type { Metadata } from "next";
import { Inter } from "next/font/google";

import "./globals.css";
import { AuthProvider } from "@/components/auth/auth-provider";
import { PageLoader } from "@/components/ui/page-loader";
import { ThemeProvider } from "@/components/theme-provider";
import { GlobalLayoutWrapper } from "@/components/layout/global-layout-wrapper";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: {
    default: "fxtrusts",
    template: "%s | fxtrusts",
  },
  description: "fxtrusts client dashboard for wallets, trading accounts, and platform activity.",
  icons: {
    icon: "/fx-icon.svg",
    apple: "/assets/logo_white.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark" style={{ colorScheme: "dark" }} suppressHydrationWarning>
      <body className={`${inter.variable} bg-background font-sans text-foreground antialiased`}>
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          forcedTheme="dark"
          enableSystem={false}
          disableTransitionOnChange
        >
          <PageLoader />
          <AuthProvider>
            <GlobalLayoutWrapper>
              {children}
            </GlobalLayoutWrapper>
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
