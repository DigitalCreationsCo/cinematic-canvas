import { ThemeProvider } from '#/components/theme-provider'
import { AnimatePresence } from 'framer-motion'

export const Providers: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return (
    <ThemeProvider attribute="className" defaultTheme="dark" enableSystem={false}
      disableTransitionOnChange
    >
      <AnimatePresence mode="wait">
        {children}
      </AnimatePresence>
    </ThemeProvider>
  )
}
