import type { Metadata } from "next";
import { Zalando_Sans, Inter, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";
import { Header } from '#/components/header';
import { cn } from '#/lib/utils';
import { Providers } from "#/providers";
import { PageTransition } from '#/components/PageTransition';
import { Footer } from "#/components/navigation/footer";
import { PreloadResources, PreloadHints } from "#/components/preload-resources";

const zalando = Zalando_Sans({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "900"],
  display: "swap",
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
      <head>
        <PreloadHints />
      </head>
      <body
        className={cn(
          "min-h-screen bg-background antialiased",
          zalando.style
        )}
      >
        <Providers
        >
          <div className="relative flex min-h-screen flex-col">
            <Header />
            <PreloadResources>
              <PageTransition>{children}</PageTransition>
            </PreloadResources>
          </div >
        </Providers >
        <Footer />
      </body >
    </html >
  );
}
