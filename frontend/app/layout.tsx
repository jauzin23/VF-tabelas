import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { Toaster } from "@/components/ui/sonner";
import { SiteHeader } from "@/components/site-header";
import "./globals.css";

const geist = Geist({ subsets: ["latin"], variable: "--font-geist" });
const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
});

export const metadata: Metadata = {
  title: "VFTabelas",
  description:
    "Painel para a extração e deteção de tabelas em imagens depáginas web.",
};

export const viewport: Viewport = {
  themeColor: "#0a0a0a",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="pt-PT"
      className={`dark ${geist.variable} ${geistMono.variable} bg-background`}
    >
      <body className="min-h-svh font-sans antialiased">
        <div className="flex min-h-svh flex-col">
          <SiteHeader />
          <main className="mx-auto w-full max-w-7xl flex-1 p-4 md:p-6 lg:p-8">
            {children}
          </main>
        </div>
        <Toaster richColors position="top-right" />
        {process.env.NODE_ENV === "production" && <Analytics />}
      </body>
    </html>
  );
}
