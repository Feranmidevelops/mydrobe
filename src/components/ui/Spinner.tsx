/**
 * A small turning ring for things that take a moment. It holds still for
 * people who ask for reduced motion; the text beside it still says what's
 * happening.
 */
export function Spinner({ className = 'size-8' }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`inline-block shrink-0 animate-spin rounded-full border-2 border-line border-t-ink motion-reduce:animate-none ${className}`}
    />
  )
}
