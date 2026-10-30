import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Afterlink — Documentation Recovery",
  description:
    "Recover lost documentation with historical web archives, evidence-backed analysis, and local AI.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased dark">
      <body className="min-h-screen bg-[#090a0f] font-sans text-slate-100">
        {children}
      </body>
    </html>
  );
}
