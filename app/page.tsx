"use client";

import { useEffect } from "react";

export default function HomePage() {
  useEffect(() => {
    const nextUrl = `/terminal${window.location.search}${window.location.hash}`;
    window.location.replace(nextUrl);
  }, []);

  return (
    <main className="flex min-h-screen items-center justify-center bg-background text-sm text-muted-foreground">
      Opening terminal...
    </main>
  );
}
