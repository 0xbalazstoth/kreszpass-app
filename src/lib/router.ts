import { useEffect, useState } from 'react'

export interface HashRoute {
  parts: string[]
  query: URLSearchParams
}

function parse(hash: string): HashRoute {
  const raw = hash.replace(/^#\/?/, '')
  const [path, qs] = raw.split('?')
  return { parts: path.split('/').filter(Boolean).map(decodeURIComponent), query: new URLSearchParams(qs ?? '') }
}

export function useHashRoute(): HashRoute {
  const [route, setRoute] = useState(() => parse(location.hash))
  useEffect(() => {
    const onChange = () => setRoute(parse(location.hash))
    addEventListener('hashchange', onChange)
    return () => removeEventListener('hashchange', onChange)
  }, [])
  return route
}

export function navigate(path: string): void {
  location.hash = '#/' + path.replace(/^\//, '')
}

export function href(path: string): string {
  return '#/' + path.replace(/^\//, '')
}
