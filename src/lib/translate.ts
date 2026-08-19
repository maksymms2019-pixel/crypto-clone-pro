/**
 * Translation helper.
 *
 * The translation backend was removed from the project, so this returns the
 * original text unchanged. Kept as a module so existing call sites keep their
 * signature (`translateToUk(text, kind)`).
 */
export async function translateToUk(text: string, _kind?: string): Promise<string> {
  return text;
}
