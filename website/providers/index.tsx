import { ViewTransitions } from '#/lib/transition/index.js';
import { ThemeProvider } from '#/components/theme-provider.js'

export const Providers: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <ViewTransitions>{children}</ViewTransitions>
    </ThemeProvider>
  )
}
