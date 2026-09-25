import { useEffect } from 'react'

const PRODUCT_NAME = 'Signum'
const PRODUCTION_ORIGIN = 'https://signum-delta.vercel.app'

export function usePageMetadata(
  title: string,
  description: string,
  path: string,
) {
  useEffect(() => {
    document.title = `${title} · ${PRODUCT_NAME}`
    setNamedMeta('description', description)
    setCanonicalUrl(`${PRODUCTION_ORIGIN}${path}`)
  }, [description, path, title])
}

function setNamedMeta(name: string, content: string) {
  let element = document.head.querySelector<HTMLMetaElement>(
    `meta[name="${name}"]`,
  )
  if (!element) {
    element = document.createElement('meta')
    element.name = name
    document.head.append(element)
  }
  element.content = content
}

function setCanonicalUrl(href: string) {
  let element = document.head.querySelector<HTMLLinkElement>(
    'link[rel="canonical"]',
  )
  if (!element) {
    element = document.createElement('link')
    element.rel = 'canonical'
    document.head.append(element)
  }
  element.href = href
}
