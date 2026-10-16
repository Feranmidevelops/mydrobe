import type { AnalysisRequest, AnalysisResponse } from './analyse-photo'
import { analyseGarmentPhoto, PhotoMappingError } from './photo-analysis'

// The app is typed against the DOM, so describe just the worker scope used here.
const scope = self as unknown as {
  onmessage: ((event: MessageEvent<AnalysisRequest>) => void) | null
  postMessage(message: AnalysisResponse, transfer: Transferable[]): void
}

scope.onmessage = ({ data }) => {
  try {
    const analysis = analyseGarmentPhoto(data.image, data.templateId, data.tolerance)
    scope.postMessage({ id: data.id, analysis }, [
      analysis.image.data.buffer,
      analysis.front.data.buffer,
      analysis.swatchPixels.data.buffer,
    ])
  } catch (error) {
    scope.postMessage(
      {
        id: data.id,
        error: error instanceof Error ? error.message : String(error),
        mapping: error instanceof PhotoMappingError,
      },
      [],
    )
  }
}
