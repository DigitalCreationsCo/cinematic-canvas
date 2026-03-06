import type { Metadata } from "next";
import { Zalando_Sans_Expanded, Inter, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";
import { Header } from '#/components/header';
import { cn } from '#/lib/utils';
import { Providers } from "#/providers";
import { PageTransition } from '#/components/PageTransition';

const zalandoSansExpanded = Zalando_Sans_Expanded({
  subsets: [ "latin" ],
  weight: [ "400", "500", "600", "700", "900" ],
  display: "swap",
  variable: "--font-heading",
});

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
          zalandoSansExpanded.variable
        )}
      >
        <Providers
        >
          <div className="relative flex min-h-screen flex-col">
            <Header />
            <PageTransition>{ children }</PageTransition>
          </div>
        </Providers>
      </body>
    </html>
  );
}
