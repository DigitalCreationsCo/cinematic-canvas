import { ViewTransitions } from '#/lib/transition/index.js';
import { ThemeProvider } from '#/providers/theme/index.js'

export const Providers: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <ViewTransitions>{children}</ViewTransitions>
    </ThemeProvider>
  )
}
