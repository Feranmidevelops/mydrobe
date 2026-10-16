/**
 * Resolves once the image has loaded. Uses the load event rather than
 * decode(), which can stall while the page is in a background tab.
 */
export function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error(`Couldn't load image: ${url.slice(0, 80)}`))
    image.src = url
  })
}
