// Supabase's PostgrestError is a plain {message, code, ...} object, not a real Error subclass,
// so `err instanceof Error` misses it and falls through to a useless generic message.
export function getErrorMessage(err: unknown, fallback = 'Something went wrong'): string {
  if (err && typeof err === 'object' && 'message' in err && typeof err.message === 'string') {
    return err.message
  }
  return fallback
}
