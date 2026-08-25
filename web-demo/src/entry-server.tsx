import { StrictMode } from 'react'
import { renderToString } from 'react-dom/server'
import { StaticRouter } from 'react-router-dom'
import App from './App.tsx'

// Node-side counterpart to main.tsx's browser render. Used only by
// scripts/prerender.mjs, at build time - never shipped to the browser (it's
// built as a separate SSR bundle and imported from plain Node, not from
// index.html). StaticRouter takes a fixed `location` instead of reading
// window.location, which is what makes rendering one route at a time
// possible outside a browser.
//
// Deliberately renders the exact same <App/> tree the browser hydrates -
// not a content-only subset - so a route that isn't wired into App.tsx's
// <Routes> can't silently render blank here while working in the browser.
export function render(url: string): string {
  return renderToString(
    <StrictMode>
      <StaticRouter location={url}>
        <App />
      </StaticRouter>
    </StrictMode>,
  )
}
