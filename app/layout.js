import "./globals.css";
import { Providers } from "./providers";

export const metadata = {
  title: "AGILE TURN TECHNOLOGY LLP – Recruitment Suite",
  description: "Recruitment tracking system",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen antialiased transition-colors duration-200">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
