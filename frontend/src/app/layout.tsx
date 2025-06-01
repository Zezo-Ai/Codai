import type { Metadata } from "next";
import localFont from "next/font/local";
import { Toaster } from "@/components/ui/toaster";
import { NotificationContainer } from "@/components/notifications/NotificationContainer";
import DiagnosticsProvider from "@/components/debug/DiagnosticsProvider";
import { ExpertModeInitializer } from "@/components/ExpertModeInitializer";
import "./globals.css";
import "@/styles/blocks.css";
import "@/styles/states.css";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  weight: "100 900",
  display: 'swap',
  preload: true
});

const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
  weight: "100 900",
  display: 'swap',
  preload: true
});

export const metadata: Metadata = {
  title: "CODAI - Evolved Intelligence",
  description: "Turn ideas into production-ready apps and solutions. Zero code required.",
  // Remove all favicon references from metadata to avoid conflicts
  manifest: '/manifest.json',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Generate a timestamp for cache busting
  const uniqueTimestamp = Date.now();
  
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable}`}>
      <head>
        {/* Force favicon refresh with cache-busting timestamp */}
        <link 
          rel="icon" 
          href={`/favicon.png?v=${uniqueTimestamp}`} 
          type="image/png" 
          sizes="any"
        />
        <link 
          rel="shortcut icon" 
          href={`/favicon.png?v=${uniqueTimestamp}`} 
          type="image/png"
        />
        <link 
          rel="apple-touch-icon" 
          href={`/favicon.png?v=${uniqueTimestamp}`} 
          type="image/png"
        />
      </head>
      <body suppressHydrationWarning className="antialiased">
        <DiagnosticsProvider>
          <ExpertModeInitializer />
          {children}
          <NotificationContainer />
          <Toaster />
        </DiagnosticsProvider>
      </body>
    </html>
  );
}