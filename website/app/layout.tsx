import type { Metadata } from "next";
import { Inter, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "#/components/theme-provider.js";
import { Header } from "#/components/header.js";
import { cn } from "#/lib/utils.js";

const inter = Inter({
  subsets: [ "latin" ],
  weight: [ "400", "500", "600", "700", "900" ],
  display: "swap",
  variable: "--font-inter",
});

const ibmPlexMono = IBM_Plex_Mono({
  subsets: [ "latin" ],
  weight: [ "400", "500", "600", "700" ],
  display: "swap",
  variable: "--font-mono",
});

export const metadata: Metadata = {
  title: "Cinematic Canvas Docs",
  description: "Documentation for Cinematic Canvas",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={cn(
          "min-h-screen bg-background antialiased",
          inter.variable,
          ibmPlexMono.variable,
        )}
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem={ false }
          disableTransitionOnChange
        >
          <div className="relative flex min-h-screen flex-col">
            <Header />
            <div className="flex flex-1">{children}</div>
          </div>
        </ThemeProvider>
      </body>
    </html>
  );
}
