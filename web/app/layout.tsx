import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Nebula | On-Chain Portfolio Command Center",
  description:
    "A premium glassmorphism dashboard for tracking wallets, risk, flows, and on-chain portfolio intelligence."
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
