import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Moshomo — AI-native workforce OS",
    template: "%s · Moshomo",
  },
  description:
    "Manage employees, leave, smart shifts, and workforce decisions with Moshomo AI.",
};

export const viewport: Viewport = {
  themeColor: "#0c2a1d",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body
        className="flex min-h-full flex-col bg-canvas font-sans text-ink"
        suppressHydrationWarning
      >
        {children}
      </body>
    </html>
  );
}
