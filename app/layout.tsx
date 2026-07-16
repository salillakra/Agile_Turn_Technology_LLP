import "./globals.css";
import { Providers } from "./providers";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { cn } from "@/lib/utils";

export const metadata = {
  title: "AGILE TURN TECHNOLOGY LLP – Recruitment Suite",
  description: "Recruitment tracking system",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={cn(GeistSans.variable, GeistMono.variable, "font-sans")}
    >
      <body className="min-h-screen antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
