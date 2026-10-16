import type { AnchorHTMLAttributes, MouseEvent } from 'react'
import { navigate, type Route } from '../../app/router'

interface LinkProps extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> {
  to: Route
}

/**
 * A real anchor, so it can be opened in a new tab or copied, that switches
 * pages in place for an ordinary left click.
 */
export function Link({ to, onClick, ...rest }: LinkProps) {
  function handleClick(event: MouseEvent<HTMLAnchorElement>) {
    onClick?.(event)
    const modified = event.metaKey || event.ctrlKey || event.shiftKey || event.altKey
    if (event.defaultPrevented || event.button !== 0 || modified || rest.target === '_blank') return
    event.preventDefault()
    navigate(to)
  }

  return <a {...rest} href={to} onClick={handleClick} />
}
