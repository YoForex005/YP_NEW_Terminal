import type { Metadata } from "next";

import "./globals.css";
import { AuthProvider } from "@/components/auth/auth-provider";
import { PageLoader } from "@/components/ui/page-loader";
import { ThemeProvider } from "@/components/theme-provider";
import { GlobalLayoutWrapper } from "@/components/layout/global-layout-wrapper";

export const metadata: Metadata = {
  title: {
    default: "Yopips Web Terminal",
    template: "%s | Yopips",
  },
  description: "Yopips web terminal for trading accounts, market data, charts, and order management.",
  icons: {
    icon: [
      { url: "/yopips-terminal.ico?v=1", sizes: "any" },
    ],
    apple: "/brand/apple-touch-icon.png?v=2",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // #0e0f11 = the opening overlay colour: the first paint before the overlay
    // mounts matches it instead of flashing the theme background.
    <html lang="en" className="dark" style={{ colorScheme: "dark", backgroundColor: "#0e0f11" }} suppressHydrationWarning>
      <body className="bg-[#0e0f11] font-sans text-foreground antialiased">
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
