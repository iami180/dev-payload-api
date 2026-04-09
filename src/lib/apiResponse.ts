/**
 * Consistent JSON error envelope for all HTTP error responses.
 */
export type ApiErrorBody = {
  success: false
  error: {
    code: string
    message: string
    details?: Record<string, unknown>
  }
}

export function apiError(
  code: string,
  message: string,
  details?: Record<string, unknown>,
): ApiErrorBody {
  const error: ApiErrorBody['error'] = { code, message }
  if (details !== undefined && Object.keys(details).length > 0) {
    error.details = details
  }
  return { success: false, error }
}
