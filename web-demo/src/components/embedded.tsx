import { createContext, useContext } from 'react'
import type { ReactNode } from 'react'

const EmbeddedContext = createContext(false)

/** Wraps a dashboard page that is shown inside another page (a Settings tab). The page keeps all
 * its own content, but DashboardLayout and PageHeader stop drawing a second sidebar and header. */
export function Embedded({ children }: { children: ReactNode }) {
  return <EmbeddedContext.Provider value>{children}</EmbeddedContext.Provider>
}

export function useEmbedded(): boolean {
  return useContext(EmbeddedContext)
}
